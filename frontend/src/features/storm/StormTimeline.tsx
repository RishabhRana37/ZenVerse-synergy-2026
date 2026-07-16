/**
 * StormTimeline — full-width 72px canvas area chart.
 *
 * Renders a rolling 90-second window of alerts/sec, stacked by severity.
 * Now acts as a scrubbable playhead / Time Machine interface.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useStreamStore } from '@/store/stream'
import { fpsGuard } from '@/lib/fpsGuard'
import { audioManager } from '@/lib/audio'
import { clsx } from 'clsx'

// ── Constants ─────────────────────────────────────────────────────────────
const WINDOW_SECS = 90          // rolling window width
const CANVAS_HEIGHT = 72        // px — must match the outer wrapper height
const GRID_LINES = 4            // horizontal y-grid lines

const COLOR_CRIT  = 'rgba(255, 77, 79,  0.30)'
const COLOR_WARN  = 'rgba(245, 166, 35, 0.25)'
const COLOR_INFO  = 'rgba(77, 159, 255, 0.20)'
const COLOR_EDGE  = '#2DD4A7'   // accent — top stroke
const COLOR_GRID  = 'rgba(255, 255, 255, 0.04)'
const COLOR_TEXT  = 'rgba(139, 152, 169, 0.9)'
const COLOR_CRIT_SOLID  = '#FF4D4F'
const COLOR_ACCENT_SOLID = '#2DD4A7'
const COLOR_PLAYHEAD = 'rgba(45, 212, 167, 0.5)'
const COLOR_MARKER_LINE = 'rgba(255, 255, 255, 0.15)'

interface Bucket {
  ts: number      // unix ms (start of the 1s bucket)
  total: number
  crit: number
  warn: number
  info: number
}

interface TooltipState {
  visible: boolean
  x: number
  y: number
  time: string
  total: number
  crit: number
  warn: number
  info: number
}

function formatHHMMSS(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function StormTimeline() {
  const [collapsed, setCollapsed] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    time: '',
    total: 0,
    crit: 0,
    warn: 0,
    info: 0
  })

  const [blurActive, setBlurActive] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bucketsRef = useRef<Bucket[]>([])
  const rafRef = useRef<number>(0)
  const dirtyRef = useRef(true)

  // Store subscriptions (refs for RAF loop)
  const statsRef = useRef(useStreamStore.getState().stats)
  const alertsRef = useRef(useStreamStore.getState().alerts)
  const baselineTimeRef = useRef(useStreamStore.getState().baselineTime)

  // Time Machine States (Zustand reactive subscriptions)
  const scrubMode = useStreamStore((s) => s.scrubMode)
  const scrubTime = useStreamStore((s) => s.scrubTime)
  const newIncidentsCount = useStreamStore((s) => s.newIncidentsCount)
  const startScrubbing = useStreamStore((s) => s.startScrubbing)
  const updateScrubbing = useStreamStore((s) => s.updateScrubbing)
  const stopScrubbing = useStreamStore((s) => s.stopScrubbing)

  // Keep refs up-to-date for RAF loop
  const scrubModeRef = useRef(scrubMode)
  const scrubTimeRef = useRef(scrubTime)
  const isDraggingRef = useRef(false)
  const scrubStartTimeRef = useRef<number>(0)

  useEffect(() => {
    scrubModeRef.current = scrubMode
    scrubTimeRef.current = scrubTime
  }, [scrubMode, scrubTime])

  // Sync basic state from store changes (ref-only to avoid React renders)
  useEffect(() => {
    const unsub = useStreamStore.subscribe((state) => {
      if (state.journal.length === 0 || state.baselineTime === null) {
        bucketsRef.current = []
      }
      statsRef.current = state.stats
      alertsRef.current = state.alerts
      baselineTimeRef.current = state.baselineTime
      dirtyRef.current = true
    })
    return unsub
  }, [])

  // Push new buckets on stats changes
  useEffect(() => {
    const unsub = useStreamStore.subscribe((state) => {
      if (!state.stats) return
      const now = Date.now()
      const bucketTs = Math.floor(now / 1000) * 1000

      const alerts = state.alerts
      const critCount = alerts.filter(a => a.severity === 'critical').length
      const warnCount = alerts.filter(a => a.severity === 'warning').length
      const infoCount = alerts.filter(a => a.severity === 'info').length
      const total = state.stats.alerts_per_sec ?? 0

      const bufTotal = critCount + warnCount + infoCount || 1
      const critFrac = critCount / bufTotal
      const warnFrac = warnCount / bufTotal
      const infoFrac = infoCount / bufTotal

      const newBucket: Bucket = {
        ts: bucketTs,
        total,
        crit: total * critFrac,
        warn: total * warnFrac,
        info: total * infoFrac,
      }

      const existing = bucketsRef.current
      if (existing.length > 0 && existing[existing.length - 1].ts === bucketTs) {
        existing[existing.length - 1] = newBucket
      } else {
        existing.push(newBucket)
      }

      const cutoff = now - WINDOW_SECS * 1000
      bucketsRef.current = existing.filter(b => b.ts >= cutoff)
      dirtyRef.current = true
    })
    return unsub
  }, [])

  // Exit Scrub Mode Handler
  const handleExitScrub = useCallback(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!prefersReduced) {
      setBlurActive(true)
      setTimeout(() => setBlurActive(false), 200)
    }
    stopScrubbing()
    audioManager.playWhoosh()
  }, [stopScrubbing])

  // ── Canvas Drawing ───────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)

    const buckets = bucketsRef.current
    const isScrubbed = scrubModeRef.current

    // Reference time "now" freezes when scrubbing
    const now = isScrubbed ? (scrubStartTimeRef.current || Date.now()) : Date.now()

    // Y-scale configuration
    const maxRate = Math.max(10, ...buckets.map(b => b.total))
    const yScale = (H - 8) / (maxRate * 1.2)

    // Convert timestamp to canvas X coordinate
    const toX = (ts: number) => {
      const ageMs = now - ts
      const ageSec = ageMs / 1000
      return W - ageSec * (W / WINDOW_SECS)
    }

    // ── Y-grid lines ──────────────────────────────────────────────────────
    ctx.strokeStyle = COLOR_GRID
    ctx.lineWidth = 1
    for (let i = 1; i <= GRID_LINES; i++) {
      const y = H - (i / GRID_LINES) * (H - 8)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }

    // ── Areas ─────────────────────────────────────────────────────────────
    if (buckets.length >= 2) {
      const points = buckets.map(b => ({
        x: toX(b.ts),
        yCrit: H - b.crit * yScale,
        yWarn: H - (b.crit + b.warn) * yScale,
        yInfo: H - (b.crit + b.warn + b.info) * yScale,
        yTotal: H - b.total * yScale,
      }))

      const drawArea = (
        color: string,
        getTop: (p: typeof points[0]) => number,
        getBot: (p: typeof points[0]) => number
      ) => {
        ctx.beginPath()
        ctx.moveTo(points[0].x, getBot(points[0]))
        for (const p of points) ctx.lineTo(p.x, getTop(p))
        for (let i = points.length - 1; i >= 0; i--) ctx.lineTo(points[i].x, getBot(points[i]))
        ctx.closePath()
        ctx.fillStyle = color
        ctx.fill()
      }

      drawArea(COLOR_INFO, p => p.yInfo, _ => H)
      drawArea(COLOR_WARN, p => p.yWarn, p => p.yCrit)
      drawArea(COLOR_CRIT, p => p.yCrit, _ => H)

      // Accent Top Stroke
      const strokeW = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--timeline-stroke').trim()
      ) || 1.5
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].yTotal)
      for (const p of points) ctx.lineTo(p.x, p.yTotal)
      ctx.strokeStyle = COLOR_EDGE
      ctx.lineWidth = strokeW
      ctx.stroke()
    }

    // ── Incident Birth Markers ─────────────────────────────────────────────
    const activeIncidentsMap = isScrubbed && useStreamStore.getState().scrubState 
      ? useStreamStore.getState().scrubState!.incidents
      : useStreamStore.getState().incidents

    activeIncidentsMap.forEach((incident) => {
      const createdTime = new Date(incident.created_at).getTime()
      const x = toX(createdTime)
      if (x < -10 || x > W + 10) return

      const fadePct = Math.min(1, Math.max(0, x / 30))
      const rootSvc = incident.root_candidates?.[0]?.service ?? ''
      const sev = incident.root_candidates?.[0] !== undefined
        ? (incident.status === 'resolved' ? 'rgba(45,212,167,0.45)' : COLOR_CRIT_SOLID)
        : COLOR_ACCENT_SOLID

      ctx.save()
      ctx.globalAlpha = fadePct * 0.6
      ctx.strokeStyle = COLOR_MARKER_LINE
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
      ctx.restore()

      ctx.save()
      ctx.globalAlpha = fadePct
      ctx.fillStyle = sev
      ctx.beginPath()
      ctx.arc(x, 10, 3.5, 0, Math.PI * 2)
      ctx.fill()

      if (rootSvc) {
        ctx.font = '9px "JetBrains Mono", Menlo, monospace'
        ctx.fillStyle = sev
        ctx.textAlign = 'left'
        const label = rootSvc.length > 14 ? rootSvc.slice(0, 13) + '…' : rootSvc
        ctx.fillText(`● ${label}`, x + 6, 13)
      }
      ctx.restore()
    })

    // ── Draggable Playhead ────────────────────────────────────────────────
    if (isScrubbed && baselineTimeRef.current !== null) {
      const playheadTs = baselineTimeRef.current + scrubTimeRef.current * 1000
      const pxVal = toX(playheadTs)

      if (pxVal >= 0 && pxVal <= W) {
        ctx.save()
        // Playhead Line
        ctx.strokeStyle = '#2DD4A7'
        ctx.shadowColor = '#2DD4A7'
        ctx.shadowBlur = 6
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(pxVal, 0)
        ctx.lineTo(pxVal, H)
        ctx.stroke()

        // Knob at the top
        ctx.fillStyle = '#2DD4A7'
        ctx.beginPath()
        ctx.arc(pxVal, 6, 4.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    } else {
      // Live Playhead Line
      ctx.save()
      ctx.strokeStyle = COLOR_PLAYHEAD
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(W - 1, 0)
      ctx.lineTo(W - 1, H)
      ctx.stroke()
      ctx.restore()
    }

    // Rate Label (unless scrubbed)
    if (!isScrubbed) {
      const rate = statsRef.current?.alerts_per_sec ?? 0
      ctx.font = '10px "JetBrains Mono", Menlo, monospace'
      ctx.fillStyle = COLOR_TEXT
      ctx.textAlign = 'right'
      ctx.fillText(`${Math.round(rate)}/s`, W - 14, 14)
    }

    dirtyRef.current = false
  }, [])

  // ── Drag & Keyboard Interaction Handlers ────────────────────────────────
  const processScrubAtX = useCallback((clientX: number, rect: DOMRect, isStarting: boolean) => {
    const W = rect.width
    let mouseX = clientX - rect.left
    mouseX = Math.max(0, Math.min(W, mouseX))

    const nowTime = scrubStartTimeRef.current || Date.now()
    const baseline = baselineTimeRef.current || nowTime

    // X helper
    const toXLocal = (ts: number) => {
      const ageMs = nowTime - ts
      const ageSec = ageMs / 1000
      return W - ageSec * (W / WINDOW_SECS)
    }

    // Magnet snap to incident-birth markers (within 6px)
    const incidents = useStreamStore.getState().incidents
    let targetTs = nowTime - (((W - mouseX) / W) * WINDOW_SECS) * 1000

    for (const incident of incidents.values()) {
      const incidentTs = new Date(incident.created_at).getTime()
      const markerX = toXLocal(incidentTs)
      if (Math.abs(mouseX - markerX) < 6) {
        targetTs = incidentTs
        break
      }
    }

    const t = Math.max(0, (targetTs - baseline) / 1000)
    if (isStarting) {
      startScrubbing(t)
    } else {
      updateScrubbing(t)
    }
  }, [startScrubbing, updateScrubbing])

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    
    isDraggingRef.current = true
    scrubStartTimeRef.current = Date.now()

    processScrubAtX(e.clientX, rect, true)
    audioManager.playWhoosh()
  }

  // Window drag coordinates tracking
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      
      processScrubAtX(e.clientX, rect, false)
    }

    const handleWindowMouseUp = () => {
      isDraggingRef.current = false
    }

    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }, [processScrubAtX])

  // Arrow Keys and Space/Esc keyboard listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = useStreamStore.getState()
      if (!state.scrubMode) return

      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'select' || tag === 'textarea' || (e.target as HTMLElement)?.contentEditable === 'true') {
        return
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const nudge = e.shiftKey ? 5.0 : 0.5
        const newT = Math.max(0, state.scrubTime - nudge)
        updateScrubbing(newT)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        const nudge = e.shiftKey ? 5.0 : 0.5
        const nowTime = Date.now()
        const maxT = state.baselineTime ? (nowTime - state.baselineTime) / 1000 : 0
        const newT = Math.min(maxT, state.scrubTime + nudge)
        updateScrubbing(newT)
      } else if (e.key === ' ' || e.key === 'Escape') {
        e.preventDefault()
        handleExitScrub()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [updateScrubbing, handleExitScrub])

  // ── RAF loop ─────────────────────────────────────────────────────────────
  const lastDrawTimeRef = useRef(0)

  useEffect(() => {
    const loop = (ts: number) => {
      fpsGuard.measure()
      const interval = fpsGuard.getTimelineInterval()
      const shouldDraw = dirtyRef.current && (interval === 0 || ts - lastDrawTimeRef.current >= interval)
      if (shouldDraw) {
        draw()
        lastDrawTimeRef.current = ts
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  // ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      canvas.width = Math.floor(entry.contentRect.width * window.devicePixelRatio)
      canvas.height = Math.floor(CANVAS_HEIGHT * window.devicePixelRatio)
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
      dirtyRef.current = true
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  // Canvas Hover tooltips (Only while not dragging)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const W = rect.width

    const now = scrubModeRef.current ? (scrubStartTimeRef.current || Date.now()) : Date.now()
    const ageSec = ((W - mouseX) / W) * WINDOW_SECS
    const targetTs = now - ageSec * 1000

    const buckets = bucketsRef.current
    let closest: Bucket | null = null
    let minDist = Infinity
    for (const b of buckets) {
      const d = Math.abs(b.ts - targetTs)
      if (d < minDist) {
        minDist = d
        closest = b
      }
    }

    if (closest && minDist < 2000) {
      setTooltip({
        visible: true,
        x: mouseX,
        y: e.clientY - rect.top,
        time: formatHHMMSS(closest.ts),
        total: Math.round(closest.total),
        crit: Math.round(closest.crit),
        warn: Math.round(closest.warn),
        info: Math.round(closest.info),
      })
    } else {
      setTooltip(t => ({ ...t, visible: false }))
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    dirtyRef.current = true

    requestAnimationFrame(() => {
      draw()
      const cvs = canvasRef.current
      if (!cvs) return
      const c = cvs.getContext('2d')
      if (!c) return
      const H = rect.height
      c.save()
      c.strokeStyle = 'rgba(255,255,255,0.2)'
      c.lineWidth = 1
      c.setLineDash([3, 3])
      c.beginPath()
      c.moveTo(mouseX, 0)
      c.lineTo(mouseX, H)
      c.stroke()
      c.restore()
    })
  }, [draw])

  const handleMouseLeave = useCallback(() => {
    if (isDraggingRef.current) return
    setTooltip(t => ({ ...t, visible: false }))
    dirtyRef.current = true
  }, [])

  const currentRate = useStreamStore(s => s.stats?.alerts_per_sec ?? 0)

  return (
    <div className="w-full flex-shrink-0 bg-bg-base border-b border-border select-none relative">
      {/* Collapse bar */}
      <div
        className="flex items-center justify-between px-4 h-[28px] cursor-pointer hover:bg-bg-elevated/40 transition-colors"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-3 h-3 text-text-muted transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
            fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          <span className="font-mono text-[11px] font-bold tracking-wider uppercase text-text-muted">
            <span className="text-accent mr-1">▎03</span> TIMELINE {scrubMode && "— Reviewing"}
          </span>
        </div>
        <span className="text-[10px] font-mono text-accent tabular-nums">
          {Math.round(currentRate)}/s
        </span>
      </div>

      {/* Canvas area */}
      {!collapsed && (
        <div className="relative w-full h-[72px] overflow-hidden">
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: `${CANVAS_HEIGHT}px`, display: 'block' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onMouseDown={handleMouseDown}
            className={clsx(
              "cursor-ew-resize transition-all",
              blurActive ? "blur-sm duration-200" : "blur-none"
            )}
          />

          {/* Pulsing LIVE return button */}
          <button
            disabled={!scrubMode}
            onClick={handleExitScrub}
            className={clsx(
              "absolute right-4 top-1/2 -translate-y-1/2 z-30 px-2.5 py-1 rounded font-mono text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5 transition-all duration-200 border",
              scrubMode
                ? "bg-accent border-accent/40 text-text-inverse shadow-elevated animate-pulse cursor-pointer"
                : "bg-bg-elevated/45 border-border/50 text-text-muted cursor-default"
            )}
          >
            <span className={clsx("w-1.5 h-1.5 rounded-full", scrubMode ? "bg-text-inverse" : "bg-accent")} />
            LIVE {scrubMode && newIncidentsCount > 0 && `+${newIncidentsCount}`}
          </button>

          {/* Hover tooltip */}
          {tooltip.visible && !isDraggingRef.current && (
            <div
              className="pointer-events-none absolute z-10 px-2.5 py-1.5 rounded bg-bg-elevated border border-border shadow-elevated text-[10px] font-mono leading-snug"
              style={{
                left: Math.min(tooltip.x + 10, window.innerWidth - 140),
                top: 4,
              }}
            >
              <div className="text-text-muted mb-0.5">{tooltip.time}</div>
              <div className="flex flex-col gap-px">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-severity-critical flex-shrink-0" />
                  <span className="text-text-secondary tabular-nums">{tooltip.crit} crit</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-severity-warning flex-shrink-0" />
                  <span className="text-text-secondary tabular-nums">{tooltip.warn} warn</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-severity-info flex-shrink-0" />
                  <span className="text-text-secondary tabular-nums">{tooltip.info} info</span>
                </div>
                <div className="border-t border-border/40 pt-px mt-px text-text-primary font-semibold tabular-nums">
                  {tooltip.total} total/s
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
