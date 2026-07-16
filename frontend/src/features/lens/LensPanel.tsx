import { useEffect, useRef } from 'react'
import { useStreamStore } from '@/store/stream'
import { fpsGuard } from '@/lib/fpsGuard'
import { audioManager } from '@/lib/audio'
import { TopologyHealthMap } from '@/features/incidents/TopologyHealthMap'
import { Odometer } from '@/components/ui/Odometer'
import type { Alert, Incident } from '@/lib/types'

// ── Configuration Constants ───────────────────────────────────────────────
const MAX_PARTICLES = 2000
const CELL_SIZE = 40 // for spatial hash grid
const HOVER_RADIUS_PARTICLE = 10
const HOVER_RADIUS_WELL = 25

// Severity colors
const SEVERITY_COLORS: Record<string, string> = {
  critical: '#FF4D4F',
  warning: '#F5A623',
  info: '#4D9FFF',
}

interface GravityWell {
  id: string // incidentId
  incident: Incident
  x: number
  y: number
  targetY: number
  vy: number
  radius: number
  targetRadius: number
  color: string
  title: string
  count: number
  status: 'active' | 'resolved'
  pulse: number // absorption visual feedback
  rotationAngle: number
}

interface LensPanelProps {
  onIncidentSelect: (id: string | null) => void
}

export function LensPanel({ onIncidentSelect }: LensPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // DOM overlays for zero React re-render tooltips
  const particleTooltipRef = useRef<HTMLDivElement>(null)
  const wellTooltipRef = useRef<HTMLDivElement>(null)

  // React states for the live hero equation overlay
  const stats = useStreamStore((s) => s.scrubMode && s.scrubState ? s.scrubState.stats : s.stats)
  const totalAlerts = stats?.total_alerts ?? 0
  const activeIncidents = stats?.active_incidents ?? 0
  const compressionRatio = stats?.compression_ratio ?? 0

  // ── Physics Flat Typed-Arrays ────────────────────────────────────────────
  // We use flat arrays to prevent GC pauses and allocate memory upfront
  const px = useRef(new Float32Array(MAX_PARTICLES))
  const py = useRef(new Float32Array(MAX_PARTICLES))
  const pvx = useRef(new Float32Array(MAX_PARTICLES))
  const pvy = useRef(new Float32Array(MAX_PARTICLES))
  
  // 0 = info, 1 = warning, 2 = critical
  const pSeverity = useRef(new Uint8Array(MAX_PARTICLES))
  
  // 0 = unclustered, 1 = attracted, 2 = orbiting, 3 = decaying, 4 = dead/inactive
  const pState = useRef(new Uint8Array(MAX_PARTICLES))
  
  // Index of target gravity well (-1 if none)
  const pTargetWell = useRef(new Int16Array(MAX_PARTICLES))
  
  // Age tracker (used for noise expiration and fade transitions)
  const pAge = useRef(new Float32Array(MAX_PARTICLES))
  
  // Orbit parameters
  const pOrbitalRadius = useRef(new Float32Array(MAX_PARTICLES))
  const pOrbitalSpeed = useRef(new Float32Array(MAX_PARTICLES))
  const pOrbitalAngle = useRef(new Float32Array(MAX_PARTICLES))

  // Ripple effect tracking: -1 if none, otherwise current radius
  const pRippleRadius = useRef(new Float32Array(MAX_PARTICLES))
  const pRippleMax = useRef(new Float32Array(MAX_PARTICLES))

  // Map of alert ID -> particle index
  const alertToParticleMap = useRef(new Map<string, number>())
  // Track last seen dup_count per alert to trigger ripple events
  const lastDupCountMap = useRef(new Map<string, number>())

  // Parallel JS string array to map particle slots back to alert objects
  const pAlertIds = useRef<(string | null)[]>(new Array(MAX_PARTICLES).fill(null))

  // ── Gravity Wells & Background ───────────────────────────────────────────
  const wellsRef = useRef<GravityWell[]>([])
  
  // Sparse dust particles for dimensional depth
  const dustX = useRef(new Float32Array(100))
  const dustY = useRef(new Float32Array(100))
  const dustSpeed = useRef(new Float32Array(100))
  const dustSize = useRef(new Float32Array(100))
  const dustAlpha = useRef(new Float32Array(100))

  // Mouse tracking
  const mouseX = useRef(-9999)
  const mouseY = useRef(-9999)
  const hoveredParticleIdx = useRef(-1)
  const hoveredWellIdx = useRef(-1)

  // Refs for loop coordination
  const animationFrameId = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)

  // ── Initialize Dust Particles ────────────────────────────────────────────
  const initDust = (w: number, h: number) => {
    for (let i = 0; i < 100; i++) {
      dustX.current[i] = Math.random() * w
      dustY.current[i] = Math.random() * h
      dustSpeed.current[i] = 0.05 + Math.random() * 0.12
      dustSize.current[i] = 0.6 + Math.random() * 1.4
      dustAlpha.current[i] = 0.02 + Math.random() * 0.06
    }
  }

  // ── Allocate free particle slot ──────────────────────────────────────────
  const findFreeSlot = (): number => {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (pState.current[i] === 4) return i
    }
    // If no slot available, replace the oldest unclustered particle
    let oldestIdx = -1
    let maxAge = -1
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (pState.current[i] === 0 && pAge.current[i] > maxAge) {
        maxAge = pAge.current[i]
        oldestIdx = i
      }
    }
    if (oldestIdx !== -1) {
      const oldId = pAlertIds.current[oldestIdx]
      if (oldId) {
        alertToParticleMap.current.delete(oldId)
        lastDupCountMap.current.delete(oldId)
      }
      return oldestIdx
    }
    return 0 // Fallback
  }

  // ── Initialize or Sync Gravity Wells ─────────────────────────────────────
  const syncWells = (incidents: Map<string, Incident>, width: number, height: number) => {
    const currentWells = [...wellsRef.current]

    // Mark resolved wells and add new active ones
    incidents.forEach((incident) => {
      let well = currentWells.find((w) => w.id === incident.id)
      const rootCandidate = incident.root_candidates?.[0]
      const rootAlert = rootCandidate ? useStreamStore.getState().alertIndex.get(rootCandidate.alert_id) : null
      const severity = rootAlert?.severity || 'info'
      const severityColor = SEVERITY_COLORS[severity] || '#4D9FFF'

      if (incident.status === 'active') {
        const targetRadius = Math.max(24, Math.min(65, Math.sqrt(incident.alert_count) * 7.5))
        if (!well) {
          // New active well
          well = {
            id: incident.id,
            incident,
            x: width * 0.75,
            y: height / 2 + (Math.random() - 0.5) * 100,
            targetY: height / 2,
            vy: 0,
            radius: 0,
            targetRadius,
            color: severityColor,
            title: incident.title || 'Incident',
            count: incident.alert_count,
            status: 'active',
            pulse: 0,
            rotationAngle: Math.random() * Math.PI * 2,
          }
          currentWells.push(well)
        } else {
          // Update existing active well
          well.incident = incident
          well.targetRadius = targetRadius
          well.count = incident.alert_count
          well.color = severityColor
          if (well.status === 'resolved') {
            well.status = 'active'
          }
        }
      } else {
        // Incident resolved
        if (well && well.status === 'active') {
          well.status = 'resolved'
          well.targetRadius = 0 // Shrink away
          // Trigger particles orbiting it to drift off
          const wellIndex = currentWells.indexOf(well)
          for (let i = 0; i < MAX_PARTICLES; i++) {
            if (pTargetWell.current[i] === wellIndex) {
              pState.current[i] = 3 // Drift/fade
              pAge.current[i] = 1.5 // 1.5 seconds remaining
              pvx.current[i] = (Math.random() - 0.5) * 2.5
              pvy.current[i] = (Math.random() - 0.5) * 2.5
            }
          }
        }
      }
    })

    // Spacing calculations: vertically distribute visible wells
    const visibleWells = currentWells.filter((w) => w.status === 'active' || w.radius > 0.5)
    
    // Sort wells stably by created_at to avoid jitter
    visibleWells.sort((a, b) => {
      const timeA = new Date(a.incident.created_at).getTime()
      const timeB = new Date(b.incident.created_at).getTime()
      return timeA - timeB
    })

    const margin = 90
    const availHeight = height - margin * 2
    visibleWells.forEach((w, index) => {
      if (visibleWells.length === 1) {
        w.targetY = height / 2
      } else {
        w.targetY = margin + (index / (visibleWells.length - 1)) * availHeight
      }
    })

    wellsRef.current = currentWells
  }

  // ── Sync Particle States with Store alerts ───────────────────────────────
  const syncParticles = (alerts: Alert[], _width: number, height: number) => {
    const activeMap = alertToParticleMap.current
    const activeIds = new Set(alerts.map((a) => a.id))

    // 1. Move particles to decay (State 3) if they scrolled off the buffer
    activeMap.forEach((pIdx, id) => {
      if (!activeIds.has(id) && pState.current[pIdx] !== 3 && pState.current[pIdx] !== 4) {
        pState.current[pIdx] = 3 // decay/fade
        pAge.current[pIdx] = 1.0 // 1.0 seconds remaining
        pvx.current[pIdx] = (Math.random() - 0.5) * 1.5
        pvy.current[pIdx] = (Math.random() - 0.5) * 1.0
        activeMap.delete(id)
        lastDupCountMap.current.delete(id)
      }
    })

    // 2. Add or update active alerts
    alerts.forEach((alert) => {
      const pIdx = activeMap.get(alert.id)
      
      if (pIdx === undefined) {
        // Spawn a new particle
        const slot = findFreeSlot()
        
        // Spawn position: left edge with turbulence
        px.current[slot] = 0
        py.current[slot] = Math.random() * height
        pvx.current[slot] = 1.8 + Math.random() * 1.4 // rightward velocity
        pvy.current[slot] = (Math.random() - 0.5) * 0.8
        pSeverity.current[slot] = alert.severity === 'critical' ? 2 : alert.severity === 'warning' ? 1 : 0
        pAge.current[slot] = 0.0 // start age
        pRippleRadius.current[slot] = -1.0
        
        pAlertIds.current[slot] = alert.id
        activeMap.set(alert.id, slot)
        lastDupCountMap.current.set(alert.id, alert.dup_count)

        if (alert.cluster_id !== null) {
          // Spawn as attracted to its gravity well
          const wellIdx = wellsRef.current.findIndex((w) => w.id === alert.cluster_id)
          if (wellIdx !== -1) {
            pState.current[slot] = 1 // attracted
            pTargetWell.current[slot] = wellIdx
          } else {
            pState.current[slot] = 0 // fallback unclustered
            pTargetWell.current[slot] = -1
          }
        } else {
          pState.current[slot] = 0 // unclustered
          pTargetWell.current[slot] = -1
        }
      } else {
        // Existing particle: check if cluster status updated
        if (alert.cluster_id !== null && pState.current[pIdx] === 0) {
          const wellIdx = wellsRef.current.findIndex((w) => w.id === alert.cluster_id)
          if (wellIdx !== -1) {
            pState.current[pIdx] = 1 // transition to attracted
            pTargetWell.current[pIdx] = wellIdx
          }
        }

        // Check if dedup occurred
        const lastDup = lastDupCountMap.current.get(alert.id) || 1
        if (alert.dup_count > lastDup) {
          lastDupCountMap.current.set(alert.id, alert.dup_count)
          // Emit dedup ripple
          pRippleRadius.current[pIdx] = 0
          pRippleMax.current[pIdx] = 35 + Math.min(25, alert.dup_count * 1.5)
        }
      }
    })
  }

  // ── Initialize Simulation from Current State on Entry ───────────────────
  const initializeFromBuffer = (width: number, height: number) => {
    const store = useStreamStore.getState()
    
    // Clear existing particle maps
    alertToParticleMap.current.clear()
    lastDupCountMap.current.clear()
    pAlertIds.current.fill(null)
    for (let i = 0; i < MAX_PARTICLES; i++) {
      pState.current[i] = 4 // mark all dead
      pRippleRadius.current[i] = -1
    }

    // Sync wells first
    syncWells(store.incidents, width, height)
    // Instantly place wells at their vertical target spacing to avoid starting from center
    wellsRef.current.forEach((w) => {
      w.y = w.targetY
      w.radius = w.targetRadius
    })

    // Now populate particles
    const alerts = store.alerts
    const activeMap = alertToParticleMap.current

    alerts.forEach((alert) => {
      const slot = findFreeSlot()
      pAlertIds.current[slot] = alert.id
      activeMap.set(alert.id, slot)
      lastDupCountMap.current.set(alert.id, alert.dup_count)

      pSeverity.current[slot] = alert.severity === 'critical' ? 2 : alert.severity === 'warning' ? 1 : 0
      pRippleRadius.current[slot] = -1.0

      if (alert.cluster_id !== null) {
        // Pre-orbiting for clustered
        const wellIdx = wellsRef.current.findIndex((w) => w.id === alert.cluster_id)
        if (wellIdx !== -1) {
          const well = wellsRef.current[wellIdx]
          pState.current[slot] = 2 // orbiting
          pTargetWell.current[slot] = wellIdx
          
          // Organic distribution around orbit
          const angle = Math.random() * Math.PI * 2
          const rad = well.radius + (Math.random() - 0.5) * well.radius * 0.45
          
          pOrbitalAngle.current[slot] = angle
          pOrbitalRadius.current[slot] = rad
          pOrbitalSpeed.current[slot] = (0.012 + Math.random() * 0.016) * (Math.random() < 0.5 ? 1 : -1)
          
          px.current[slot] = well.x + Math.cos(angle) * rad * 1.25
          py.current[slot] = well.y + Math.sin(angle) * rad * 0.8
        } else {
          // Fallback unclustered
          pState.current[slot] = 0
          pTargetWell.current[slot] = -1
          px.current[slot] = Math.random() * width * 0.55 + width * 0.03
          py.current[slot] = Math.random() * height
          pvx.current[slot] = (Math.random() - 0.2) * 1.2
          pvy.current[slot] = (Math.random() - 0.5) * 0.8
          pAge.current[slot] = Math.random() * 0.6 // random initial age offset
        }
      } else {
        // Scattered for unclustered
        pState.current[slot] = 0 // unclustered
        pTargetWell.current[slot] = -1
        px.current[slot] = Math.random() * width * 0.55 + width * 0.03
        py.current[slot] = Math.random() * height
        pvx.current[slot] = (Math.random() - 0.2) * 1.2
        pvy.current[slot] = (Math.random() - 0.5) * 0.8
        pAge.current[slot] = Math.random() * 0.6
      }
    })
  }

  // ── Main Effect Loop ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set dimensions based on parent container
    const resizeCanvas = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.scale(dpr, dpr)

      // Sync size state inside loop closures
      initDust(rect.width, rect.height)
      initializeFromBuffer(rect.width, rect.height)
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Spatial hash grid map
    const grid = new Map<string, number[]>()

    // Transient subscribe to Zustand store to keep refs updated without React triggers
    let lastScrubTime = -1
    let lastScrubMode = false

    const unsubscribeStore = useStreamStore.subscribe((state) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      if (state.scrubMode) {
        if (!lastScrubMode || state.scrubTime !== lastScrubTime) {
          initializeFromBuffer(rect.width, rect.height)
          lastScrubTime = state.scrubTime
          lastScrubMode = true
        }
      } else {
        if (lastScrubMode) {
          initializeFromBuffer(rect.width, rect.height)
          lastScrubMode = false
          lastScrubTime = -1
        }
        syncWells(state.incidents, rect.width, rect.height)
        syncParticles(state.alerts, rect.width, rect.height)
      }
    })

    // Animation Loop
    const loop = (timestamp: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) {
        animationFrameId.current = requestAnimationFrame(loop)
        return
      }
      const width = rect.width
      const height = rect.height

      // Measure FPS via guard
      fpsGuard.measure()
      const isThrottled = fpsGuard.isThrottled()

      // Calculate time delta (capped to prevent physics explosions on background)
      let dt = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 16.666 : 1.0
      dt = Math.min(3.0, dt) // Cap delta time
      lastTimeRef.current = timestamp

      // prefers-reduced-motion: 30% speed, no turbulence
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const simSpeed = prefersReduced ? 0.3 * dt : dt

      // Clear Canvas
      ctx.fillStyle = '#06090F' // sleeker dark theme background
      ctx.fillRect(0, 0, width, height)

      // ── Draw Faint Dimensional Background ────────────────────────────────
      // Radial grid centered in well area
      const wellCenterX = width * 0.75
      const wellCenterY = height * 0.5
      
      ctx.lineWidth = 1
      for (let r = 80; r <= 560; r += 120) {
        ctx.beginPath()
        ctx.arc(wellCenterX, wellCenterY, r, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(45, 212, 167, 0.012)'
        ctx.stroke()
      }
      // Faint radial lines
      ctx.beginPath()
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        ctx.moveTo(wellCenterX, wellCenterY)
        ctx.lineTo(wellCenterX + Math.cos(a) * 600, wellCenterY + Math.sin(a) * 600)
      }
      ctx.strokeStyle = 'rgba(45, 212, 167, 0.007)'
      ctx.stroke()

      // Sparse dust particles
      for (let j = 0; j < 100; j++) {
        dustX.current[j] -= dustSpeed.current[j] * simSpeed
        if (dustX.current[j] < 0) {
          dustX.current[j] = width
          dustY.current[j] = Math.random() * height
        }
        ctx.fillStyle = `rgba(45, 212, 167, ${dustAlpha.current[j]})`
        ctx.beginPath()
        ctx.arc(dustX.current[j], dustY.current[j], dustSize.current[j], 0, Math.PI * 2)
        ctx.fill()
      }

      // ── Update & Draw Gravity Wells ──────────────────────────────────────
      const springK = 0.07
      const damping = 0.22
      const wells = wellsRef.current

      // Remove fully shrunk resolved wells
      wellsRef.current = wells.filter((w) => {
        if (w.status === 'resolved' && w.radius < 0.5) {
          return false
        }
        return true
      })

      // Update well spring vertical positions
      wellsRef.current.forEach((w) => {
        // Vertical spring layout
        const dy = w.targetY - w.y
        const force = dy * springK - w.vy * damping
        w.vy += force * dt
        w.y += w.vy * dt

        // Radius transition LERP
        w.radius += (w.targetRadius - w.radius) * 0.12 * dt

        // Rotation
        w.rotationAngle += 0.004 * simSpeed

        // Decay pulse indicator
        if (w.pulse > 0) {
          w.pulse -= 0.05 * dt
        }
      })

      // Draw gravity wells
      let hoveredWell: GravityWell | null = null
      let newHoveredWellIdx = -1

      // Well hovering scan
      for (let wIdx = 0; wIdx < wellsRef.current.length; wIdx++) {
        const w = wellsRef.current[wIdx]
        if (w.status !== 'active') continue

        const dx = w.x - mouseX.current
        const dy = w.y - mouseY.current
        const dist = Math.sqrt(dx * dx + dy * dy)
        
        // Hover condition
        if (Math.abs(dist - w.radius) < HOVER_RADIUS_WELL || dist < w.radius) {
          newHoveredWellIdx = wIdx
          hoveredWell = w
          break
        }
      }
      hoveredWellIdx.current = newHoveredWellIdx

      wellsRef.current.forEach((w, wIdx) => {
        if (w.radius < 0.5) return
        const isWellHovered = (wIdx === newHoveredWellIdx)
        const isResolved = w.status === 'resolved'

        // Draw rotating dashed outer ring
        ctx.save()
        ctx.translate(w.x, w.y)
        ctx.rotate(w.rotationAngle)
        
        ctx.beginPath()
        ctx.arc(0, 0, w.radius, 0, Math.PI * 2)
        ctx.setLineDash([4, 6])
        ctx.lineWidth = isWellHovered ? 2.5 : 1.5
        
        // Mute resolved, brighten hovered, else low-alpha
        if (isResolved) {
          ctx.strokeStyle = 'rgba(139, 152, 169, 0.12)'
        } else {
          ctx.strokeStyle = isWellHovered ? w.color : `${w.color}45`
        }
        ctx.stroke()
        ctx.restore()

        // Draw soft inner boundary circle
        ctx.beginPath()
        ctx.arc(w.x, w.y, w.radius - 4, 0, Math.PI * 2)
        ctx.strokeStyle = isResolved ? 'rgba(0,0,0,0)' : `${w.color}0c`
        ctx.lineWidth = 1
        ctx.stroke()

        // Ripple pulse expanding from well center when a particle is absorbed
        if (w.pulse > 0 && !isResolved) {
          ctx.beginPath()
          ctx.arc(w.x, w.y, w.radius * (1.0 - w.pulse * 0.6), 0, Math.PI * 2)
          ctx.strokeStyle = `${w.color}${Math.floor(w.pulse * 120).toString(16).padStart(2, '0')}`
          ctx.lineWidth = 1
          ctx.stroke()
        }

        // Draw text labels beside the active wells
        if (!isResolved) {
          ctx.fillStyle = isWellHovered ? '#FFFFFF' : '#8B98A9'
          ctx.font = '11px "JetBrains Mono", Menlo, monospace'
          ctx.fillText(w.title, w.x + w.radius + 12, w.y - 1)
          
          ctx.fillStyle = isWellHovered ? w.color : `${w.color}cc`
          ctx.font = '10px "JetBrains Mono", Menlo, monospace'
          ctx.fillText(`${w.count} active alerts`, w.x + w.radius + 12, w.y + 11)
        }
      })

      // ── Update Spatial Hash Grid ─────────────────────────────────────────
      grid.clear()
      let activeParticlesCount = 0

      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (pState.current[i] === 4) continue // Skip dead
        activeParticlesCount++

        const cx = Math.floor(px.current[i] / CELL_SIZE)
        const cy = Math.floor(py.current[i] / CELL_SIZE)
        const key = `${cx},${cy}`
        
        let cell = grid.get(key)
        if (!cell) {
          cell = []
          grid.set(key, cell)
        }
        cell.push(i)
      }

      // ── FPS Degradation Check: Cap Particles at 800 ──────────────────────
      const particleLimit = isThrottled ? 800 : 2000
      if (activeParticlesCount > particleLimit) {
        // Enforce the cap: transition excess oldest unclustered particles to state 3 (absorbed)
        const excess = activeParticlesCount - particleLimit
        
        // Find indices of unclustered particles sorted by age desc
        const unclusteredIndices: { index: number; age: number }[] = []
        for (let i = 0; i < MAX_PARTICLES; i++) {
          if (pState.current[i] === 0) {
            unclusteredIndices.push({ index: i, age: pAge.current[i] })
          }
        }
        
        unclusteredIndices.sort((a, b) => b.age - a.age)
        
        const toPrune = unclusteredIndices.slice(0, excess)
        toPrune.forEach(({ index }) => {
          pState.current[index] = 3 // transition to decay/fade
          pAge.current[index] = 0.5 // quickly fade out in 0.5s
          pvx.current[index] = (Math.random() - 0.5) * 1.0
          pvy.current[index] = (Math.random() - 0.5) * 0.5
          
          const alertId = pAlertIds.current[index]
          if (alertId) {
            alertToParticleMap.current.delete(alertId)
            lastDupCountMap.current.delete(alertId)
          }
        })
      }

      // ── Hover picking via Spatial Hash Grid ──────────────────────────────
      let closestIdx = -1
      let minDistance = HOVER_RADIUS_PARTICLE
      
      const mouseGridX = Math.floor(mouseX.current / CELL_SIZE)
      const mouseGridY = Math.floor(mouseY.current / CELL_SIZE)

      // Query mouse cell and its 8 neighbors
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const key = `${mouseGridX + dx},${mouseGridY + dy}`
          const cell = grid.get(key)
          if (!cell) continue

          cell.forEach((idx) => {
            if (pState.current[idx] === 3 || pState.current[idx] === 4) return
            const dist = Math.sqrt(
              Math.pow(px.current[idx] - mouseX.current, 2) +
              Math.pow(py.current[idx] - mouseY.current, 2)
            )
            if (dist < minDistance) {
              minDistance = dist
              closestIdx = idx
            }
          })
        }
      }
      hoveredParticleIdx.current = closestIdx

      // ── Update & Draw Particles ──────────────────────────────────────────
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const state = pState.current[i]
        if (state === 4) continue // Skip dead

        // 1. Physics Calculations
        if (state === 0) {
          // Unclustered: swarm in left 60% with rightward drift & turbulence
          if (!prefersReduced) {
            // Turbulence/perlin-ish wander using sinusoidal coordinates
            const timeVal = timestamp * 0.0015
            const noiseAngle = (Math.sin(px.current[i] * 0.015) + Math.cos(py.current[i] * 0.015) + timeVal) * Math.PI
            pvx.current[i] += Math.cos(noiseAngle) * 0.12 * simSpeed
            pvy.current[i] += Math.sin(noiseAngle) * 0.12 * simSpeed
          }

          // Constant rightward drift velocity
          pvx.current[i] += 0.045 * simSpeed

          // Drag friction
          pvx.current[i] *= Math.pow(0.965, simSpeed)
          pvy.current[i] *= Math.pow(0.965, simSpeed)

          // Soft pushback boundary at 60% screen width
          if (px.current[i] > width * 0.6) {
            pvx.current[i] -= 0.16 * simSpeed
          }

          // Screen boundaries collision
          if (px.current[i] < 0) { px.current[i] = 0; pvx.current[i] *= -0.5; }
          if (py.current[i] < 0) { py.current[i] = 0; pvy.current[i] *= -0.5; }
          if (py.current[i] > height) { py.current[i] = height; pvy.current[i] *= -0.5; }

          px.current[i] += pvx.current[i] * simSpeed
          py.current[i] += pvy.current[i] * simSpeed

          // Expiration for noise alerts (60s matching buffer)
          pAge.current[i] += simSpeed / 3600 // 60s at 60fps = 3600 updates
          if (pAge.current[i] >= 1.0) {
            pState.current[i] = 3 // switch to decay
            pAge.current[i] = 1.0 // opacity tracker (1s fade out)
            pvx.current[i] = (Math.random() - 0.5) * 1.0
            pvy.current[i] = (Math.random() - 0.5) * 0.5
            
            const alertId = pAlertIds.current[i]
            if (alertId) {
              alertToParticleMap.current.delete(alertId)
              lastDupCountMap.current.delete(alertId)
            }
          }
        } 
        else if (state === 1) {
          // Attracted: accelerate towards well
          const wellIdx = pTargetWell.current[i]
          const well = wellsRef.current[wellIdx]

          if (!well || well.status !== 'active') {
            // Well disappeared or resolved, revert to unclustered
            pState.current[i] = 0
            pTargetWell.current[i] = -1
            pvx.current[i] = (Math.random() - 0.5) * 1.5
            pvy.current[i] = (Math.random() - 0.5) * 1.0
          } else {
            const dx = well.x - px.current[i]
            const dy = well.y - py.current[i]
            const dist = Math.sqrt(dx * dx + dy * dy)

            if (dist < well.radius + 35) {
              // Transition to State 2 (Orbiting)
              pState.current[i] = 2
              pOrbitalAngle.current[i] = Math.atan2(dy, dx)
              pOrbitalRadius.current[i] = well.radius + (Math.random() - 0.5) * well.radius * 0.45
              pOrbitalSpeed.current[i] = (0.014 + Math.random() * 0.016) * (Math.random() < 0.5 ? 1 : -1)
            } else {
              // Gravitational pull force
              const pullAcc = 0.42 * simSpeed
              pvx.current[i] += (dx / dist) * pullAcc
              pvy.current[i] += (dy / dist) * pullAcc

              // High drag so they don't overshoot wildly
              pvx.current[i] *= Math.pow(0.91, simSpeed)
              pvy.current[i] *= Math.pow(0.91, simSpeed)

              px.current[i] += pvx.current[i] * simSpeed
              py.current[i] += pvy.current[i] * simSpeed
            }
          }
        } 
        else if (state === 2) {
          // Orbiting
          const wellIdx = pTargetWell.current[i]
          const well = wellsRef.current[wellIdx]

          if (!well) {
            pState.current[i] = 3
            pAge.current[i] = 1.0
            pvx.current[i] = (Math.random() - 0.5) * 2.0
            pvy.current[i] = (Math.random() - 0.5) * 2.0
          } else {
            // Update orbital angle
            pOrbitalAngle.current[i] += pOrbitalSpeed.current[i] * simSpeed

            // ~20% of particles persist in orbit permanently
            const persists = (i % 5 === 0)
            
            if (persists) {
              const minRadius = well.radius * 0.35
              if (pOrbitalRadius.current[i] < minRadius) {
                pOrbitalRadius.current[i] = minRadius
              } else {
                pOrbitalRadius.current[i] -= 0.015 * simSpeed // slow decay
              }
            } else {
              // Normal particles spiral inward decay
              pOrbitalRadius.current[i] -= 0.045 * simSpeed
              
              if (pOrbitalRadius.current[i] < well.radius * 0.18 || pOrbitalRadius.current[i] < 6) {
                // Absorbed! Transition to quick fade out State 3
                pState.current[i] = 3
                pAge.current[i] = 0.25 // 0.25s quick fade
                well.pulse = 1.0 // trigger well absorb ring pulse
                pvx.current[i] = 0
                pvy.current[i] = 0
                
                const alertId = pAlertIds.current[i]
                if (alertId) {
                  alertToParticleMap.current.delete(alertId)
                  lastDupCountMap.current.delete(alertId)
                }
              }
            }

            // Calculate elliptical orbit positions
            const targetX = well.x + Math.cos(pOrbitalAngle.current[i]) * pOrbitalRadius.current[i] * 1.25
            const targetY = well.y + Math.sin(pOrbitalAngle.current[i]) * pOrbitalRadius.current[i] * 0.82

            // Interpolate position towards orbit targets
            px.current[i] += (targetX - px.current[i]) * 0.14 * simSpeed
            py.current[i] += (targetY - py.current[i]) * 0.14 * simSpeed
          }
        } 
        else if (state === 3) {
          // Decaying / fading out
          pAge.current[i] -= simSpeed / 60 // decrease time remaining
          if (pAge.current[i] <= 0) {
            pState.current[i] = 4 // mark dead
            const alertId = pAlertIds.current[i]
            if (alertId) {
              alertToParticleMap.current.delete(alertId)
              lastDupCountMap.current.delete(alertId)
            }
          } else {
            // Apply drift speed
            px.current[i] += pvx.current[i] * simSpeed
            py.current[i] += pvy.current[i] * simSpeed
          }
        }

        // 2. Draw Particle
        let alpha = 0.75
        if (state === 0) {
          alpha = 0.75 * (1.0 - pAge.current[i])
        } else if (state === 3) {
          // Fade based on remaining life
          alpha = 0.75 * pAge.current[i]
        }

        const severity = pSeverity.current[i]
        let color = '#4D9FFF'
        let baseRadius = 2.0

        if (severity === 2) {
          color = SEVERITY_COLORS.critical
          baseRadius = 3.0
        } else if (severity === 1) {
          color = SEVERITY_COLORS.warning
          baseRadius = 2.3
        }

        // Brighten if hovered, or if its well is hovered
        const isParticleHovered = (i === closestIdx)
        const isOrbitWellHovered = (state === 2 && pTargetWell.current[i] === hoveredWellIdx.current)
        
        if (isParticleHovered || isOrbitWellHovered) {
          alpha = 1.0
          baseRadius += 1.5
        }

        ctx.fillStyle = isParticleHovered ? '#FFFFFF' : `${color}${Math.floor(alpha * 255).toString(16).padStart(2, '0')}`

        // Glow for critical severity
        if (severity === 2 && !isThrottled) {
          ctx.beginPath()
          ctx.arc(px.current[i], py.current[i], baseRadius * 2.0, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255, 77, 79, ${alpha * 0.16})`
          ctx.fill()
        }

        ctx.beginPath()
        ctx.arc(px.current[i], py.current[i], baseRadius, 0, Math.PI * 2)
        ctx.fill()

        // 3. Draw ripple ring for dedup events
        if (pRippleRadius.current[i] >= 0) {
          pRippleRadius.current[i] += 1.6 * simSpeed
          const rAlpha = 1.0 - (pRippleRadius.current[i] / pRippleMax.current[i])
          
          if (rAlpha <= 0) {
            pRippleRadius.current[i] = -1.0
          } else {
            ctx.beginPath()
            ctx.arc(px.current[i], py.current[i], pRippleRadius.current[i], 0, Math.PI * 2)
            ctx.strokeStyle = `${color}${Math.floor(rAlpha * 255).toString(16).padStart(2, '0')}`
            ctx.lineWidth = 1.0
            ctx.stroke()
          }
        }
      }

      // ── Draw DOM overlays for hovered Tooltips (Zero React Render) ──────────
      if (closestIdx !== -1) {
        const id = pAlertIds.current[closestIdx]
        const alertObj = id ? useStreamStore.getState().alertIndex.get(id) : null
        
        if (alertObj && particleTooltipRef.current) {
          const tEl = particleTooltipRef.current
          tEl.style.display = 'block'
          
          const text = `${alertObj.service || 'unknown'} · ${alertObj.host || 'unknown'} · ${alertObj.severity} · ${alertObj.message}`
          tEl.innerHTML = text
          
          // Position relative to parent element
          const pad = 12
          let top = py.current[closestIdx] - 34
          let left = px.current[closestIdx] + pad
          
          // Boundary guard
          if (left + 220 > width) left = px.current[closestIdx] - 230
          if (top < 10) top = py.current[closestIdx] + 16

          tEl.style.top = `${top}px`
          tEl.style.left = `${left}px`
        }
      } else if (particleTooltipRef.current) {
        particleTooltipRef.current.style.display = 'none'
      }

      if (hoveredWell && wellTooltipRef.current) {
        const tEl = wellTooltipRef.current
        tEl.style.display = 'block'

        const rootCandidate = hoveredWell.incident.root_candidates?.[0]
        const rcText = rootCandidate ? `${rootCandidate.service} (${Math.round(rootCandidate.confidence * 100)}%)` : 'Unknown'
        const titleText = hoveredWell.incident.title || 'Incident'
        const details = hoveredWell.incident.summary || 'Analyzing blast radius...'

        tEl.innerHTML = `
          <div class="font-bold text-text-primary mb-1 border-b border-border/30 pb-0.5">${titleText}</div>
          <div class="grid grid-cols-[80px_1fr] gap-x-2 gap-y-0.5 text-text-secondary select-none">
            <span class="text-text-muted font-sans font-medium">Root Cause:</span>
            <span class="text-severity-critical">${rcText}</span>
            <span class="text-text-muted font-sans font-medium">Impact:</span>
            <span>${hoveredWell.incident.services.join(', ')}</span>
          </div>
          <div class="text-text-muted mt-2 border-t border-border/20 pt-1.5 leading-relaxed font-sans select-text">${details}</div>
        `

        let top = hoveredWell.y - 120
        let left = hoveredWell.x - 140
        if (top < 10) top = hoveredWell.y + hoveredWell.radius + 15
        
        tEl.style.top = `${top}px`
        tEl.style.left = `${left}px`
      } else if (wellTooltipRef.current) {
        wellTooltipRef.current.style.display = 'none'
      }

      // Loop
      animationFrameId.current = requestAnimationFrame(loop)
    }

    animationFrameId.current = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      unsubscribeStore()
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current)
      }
    }
  }, [])

  // ── Interaction Listeners ────────────────────────────────────────────────
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    mouseX.current = e.clientX - rect.left
    mouseY.current = e.clientY - rect.top
  }

  const handleMouseLeave = () => {
    mouseX.current = -9999
    mouseY.current = -9999
  }

  const handleCanvasClick = (_e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hoveredWellIdx.current !== -1) {
      const well = wellsRef.current[hoveredWellIdx.current]
      if (well && well.status === 'active') {
        onIncidentSelect(well.id)
        audioManager.playWhoosh()
      }
    }
  }

  return (
    <div ref={containerRef} className="flex-1 min-h-0 w-full relative bg-bg-base overflow-hidden">
      {/* 2D Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-pointer select-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleCanvasClick}
      />

      {/* Hero Equation DOM Overlay (top-left) */}
      <div className="absolute top-4 left-6 z-20 flex items-center gap-2 text-ui-sm font-mono text-text-secondary whitespace-nowrap min-w-0 max-w-full overflow-hidden text-ellipsis select-none bg-bg-surface/50 backdrop-blur-md px-3 py-1.5 rounded border border-border/30">
        <Odometer value={totalAlerts} format="integer" easing="linear" className="text-text-primary font-semibold" />
        <span className="text-text-muted">alerts</span>
        
        <span className="text-text-muted">→</span>
        
        <Odometer value={activeIncidents} format="integer" easing="spring" className="text-accent font-semibold" />
        <span className="text-accent font-semibold">incidents</span>
        
        <span className="text-border-strong font-sans">·</span>
        
        <Odometer
          value={compressionRatio}
          format="percent2"
          easing="spring"
          className="text-accent font-semibold"
        />
        <span className="text-text-muted">noise suppressed</span>
      </div>

      {/* Legend DOM Overlay (bottom-left) */}
      <div className="absolute bottom-4 left-6 z-20 flex flex-col gap-1.5 text-[9px] font-mono text-text-muted select-none bg-bg-surface/60 backdrop-blur-md p-3 rounded border border-border/30 shadow-elevated">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-severity-critical shadow-[0_0_6px_#FF4D4F] flex-shrink-0" />
          <span>Critical alert particle</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-severity-warning flex-shrink-0" />
          <span>Warning alert particle</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-severity-info flex-shrink-0" />
          <span>Info alert particle</span>
        </div>
        <div className="flex items-center gap-2 mt-1 border-t border-border/20 pt-1.5">
          <span className="w-4 h-4 rounded-full border border-dashed border-accent/60 flex items-center justify-center text-[7px] text-accent flex-shrink-0 animate-spin-slow">○</span>
          <span>Gravity well ring (Active incident)</span>
        </div>
      </div>

      {/* Floating Topology Health Map DOM Overlay (top-right) */}
      <div className="absolute top-4 right-6 z-20 w-[330px] rounded-card border border-border bg-bg-surface/85 backdrop-blur-md shadow-elevated overflow-hidden text-left">
        <TopologyHealthMap onNodeClick={onIncidentSelect} />
      </div>

      {/* Zero React Render Particle Tooltip */}
      <div
        ref={particleTooltipRef}
        className="absolute pointer-events-none z-30 hidden px-2.5 py-1.5 rounded border border-border bg-bg-surface/90 backdrop-blur shadow-elevated font-mono text-[9px] text-text-primary whitespace-nowrap"
      />

      {/* Zero React Render Well Tooltip */}
      <div
        ref={wellTooltipRef}
        className="absolute pointer-events-none z-30 hidden w-[280px] p-3 rounded border border-border bg-bg-surface/95 backdrop-blur-md shadow-elevated font-mono text-[10px] text-text-secondary text-left leading-normal"
      />
    </div>
  )
}
