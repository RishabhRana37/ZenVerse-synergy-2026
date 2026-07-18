import { useEffect, useRef, useState } from 'react'
import { useFPSStore } from '@/lib/motion'

interface Particle {
  id: number
  x: number
  y: number
  startX: number
  startY: number
  targetX: number
  targetY: number
  controlX: number
  controlY: number
  progress: number
  speed: number
  color: string
  size: number
  targetCardIndex: number
}

interface TargetCard {
  title: string
  sub: string
  scale: number
  pulse: number
  severity: 'critical' | 'warning' | 'info'
}

export function HeroConvergenceCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [alertsCount, setAlertsCount] = useState(2000)
  
  const fpsReduced = useFPSStore((s) => s.reducedMotion)
  const reducedMotion = (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || fpsReduced

  // Scenario loop duration: 8 seconds
  const LOOP_DURATION = 8000
  const ACTIVE_FLOW_DURATION = 6000 // alerts roll and flow for 6s, hold for 2s

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set dimensions
    const resize = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      canvas.width = (rect?.width ?? 680) * window.devicePixelRatio
      canvas.height = (rect?.height ?? 380) * window.devicePixelRatio
      canvas.style.width = '100%'
      canvas.style.height = '100%'
    }
    resize()
    window.addEventListener('resize', resize)

    // Alert details
    const SEVERITY_COLORS = {
      critical: '#FF4D4F',
      warning: '#F5A623',
      info: '#4D9FFF',
    }

    const cards: TargetCard[] = [
      { title: 'INC-1: postgres-primary disk saturated', sub: 'Correlated 950 alerts · Blast radius: 3 hosts', scale: 1, pulse: 0, severity: 'critical' },
      { title: 'INC-2: redis-cache connection timeout', sub: 'Correlated 680 alerts · Blast radius: 1 service', scale: 1, pulse: 0, severity: 'warning' },
      { title: 'INC-3: gateway-service latency spike', sub: 'Correlated 370 alerts · Blast radius: 2 APIs', scale: 1, pulse: 0, severity: 'info' },
    ]

    let particles: Particle[] = []
    let nextParticleId = 0
    let startTime = performance.now()

    // Spawns a particle
    const spawnParticle = (w: number, h: number) => {
      const targetCardIndex = Math.floor(Math.random() * cards.length)
      const startX = -10
      const startY = Math.random() * h
      
      const targetX = w * 0.65
      // Distribute card vertical centers
      const targetY = h * 0.25 + targetCardIndex * h * 0.25

      // Control points for curving Bezier path
      const controlX = startX + (targetX - startX) * 0.4
      const controlY = startY + (targetY - startY) * 0.1 + (Math.random() - 0.5) * h * 0.5

      const severities: ('critical' | 'warning' | 'info')[] = ['critical', 'warning', 'info']
      const randSev = severities[Math.floor(Math.random() * severities.length)]
      const color = SEVERITY_COLORS[randSev]

      particles.push({
        id: nextParticleId++,
        x: startX,
        y: startY,
        startX,
        startY,
        targetX,
        targetY,
        controlX,
        controlY,
        progress: 0,
        speed: 0.006 + Math.random() * 0.008,
        color,
        size: 2.5 + Math.random() * 2,
        targetCardIndex,
      })
    }

    let animationId = 0

    const render = (now: number) => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      const cycleElapsed = (now - startTime) % LOOP_DURATION

      // Re-trigger/reset
      if (now - startTime >= LOOP_DURATION) {
        startTime = now
        particles = []
      }

      // Update linear counter state
      if (cycleElapsed < ACTIVE_FLOW_DURATION) {
        const pct = cycleElapsed / ACTIVE_FLOW_DURATION
        const currentAlerts = Math.max(3, Math.round(2000 - 1997 * pct))
        setAlertsCount(currentAlerts)
      } else {
        setAlertsCount(3)
      }

      // Static frame on reduced motion
      if (reducedMotion) {
        setAlertsCount(3)
        // Just draw the three cards statically and some static accent nodes
        drawCards(ctx, w, h, cards)
        animationId = requestAnimationFrame(render)
        return
      }

      // Spawn particles periodically in active phase
      if (cycleElapsed < ACTIVE_FLOW_DURATION && Math.random() < 0.25 && particles.length < 80) {
        spawnParticle(w, h)
      }

      // ── Draw Flow Channels (Background Curves) ──────────────────────────
      ctx.lineWidth = 1 * window.devicePixelRatio
      cards.forEach((_, idx) => {
        ctx.strokeStyle = 'rgba(45, 212, 167, 0.03)'
        ctx.beginPath()
        ctx.moveTo(0, h * 0.25 + idx * h * 0.25)
        ctx.bezierCurveTo(w * 0.2, h * 0.1 + idx * h * 0.25, w * 0.4, h * 0.9 - idx * h * 0.15, w * 0.65, h * 0.25 + idx * h * 0.25)
        ctx.stroke()
      })

      // ── Update & Draw Particles ──────────────────────────────────────────
      particles.forEach((p, idx) => {
        p.progress += p.speed
        if (p.progress >= 1) {
          // Trigger Impact
          const card = cards[p.targetCardIndex]
          card.scale = 1.025
          card.pulse = 1
          particles.splice(idx, 1)
          return
        }

        // Quadratic Bezier Interpolation
        const t = p.progress
        const mt = 1 - t
        p.x = mt * mt * p.startX + 2 * mt * t * p.controlX + t * t * p.targetX
        p.y = mt * mt * p.startY + 2 * mt * t * p.controlY + t * t * p.targetY

        // Interpolate color from severity to brand-green accent (#2DD4A7)
        let r, g, b
        if (p.color === '#FF4D4F') { // critical red
          r = Math.round(255 - (255 - 45) * t)
          g = Math.round(77 - (77 - 212) * t)
          b = Math.round(79 - (79 - 167) * t)
        } else if (p.color === '#F5A623') { // warning yellow
          r = Math.round(245 - (245 - 45) * t)
          g = Math.round(166 - (166 - 212) * t)
          b = Math.round(35 - (35 - 167) * t)
        } else { // info blue
          r = Math.round(77 - (77 - 45) * t)
          g = Math.round(159 - (159 - 212) * t)
          b = Math.round(255 - (255 - 167) * t)
        }

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * window.devicePixelRatio, 0, Math.PI * 2)
        ctx.fill()
      })

      // ── Update & Draw Target Cards ───────────────────────────────────────
      cards.forEach((card) => {
        // Recover scale and pulse
        card.scale += (1 - card.scale) * 0.1
        card.pulse += (0 - card.pulse) * 0.08
      })

      drawCards(ctx, w, h, cards)

      animationId = requestAnimationFrame(render)
    }

    const drawCards = (ctx: CanvasRenderingContext2D, w: number, h: number, cards: TargetCard[]) => {
      const cardW = w * 0.32
      const cardH = h * 0.18
      const dpr = window.devicePixelRatio

      cards.forEach((card, idx) => {
        const x = w * 0.65
        const y = h * 0.25 + idx * h * 0.25 - cardH / 2

        ctx.save()
        // Center-relative scaling on impact
        ctx.translate(x + cardW / 2, y + cardH / 2)
        ctx.scale(card.scale, card.scale)
        ctx.translate(-(x + cardW / 2), -(y + cardH / 2))

        // Draw impact glow ripple
        if (card.pulse > 0.01) {
          ctx.strokeStyle = `rgba(45, 212, 167, ${card.pulse * 0.2})`
          ctx.lineWidth = 3 * dpr
          ctx.beginPath()
          ctx.roundRect(x - 6 * dpr, y - 6 * dpr, cardW + 12 * dpr, cardH + 12 * dpr, 6 * dpr)
          ctx.stroke()
        }

        // Card Solid Surface (#11161F)
        ctx.fillStyle = '#11161F'
        ctx.beginPath()
        ctx.roundRect(x, y, cardW, cardH, 6 * dpr)
        ctx.fill()

        // Card Border with Accent glow/highlight
        ctx.strokeStyle = card.pulse > 0.1 
          ? `rgba(45, 212, 167, ${0.1 + card.pulse * 0.4})` 
          : 'rgba(255, 255, 255, 0.06)'
        ctx.lineWidth = 1 * dpr
        ctx.stroke()

        // Severity indicator strip
        const sevColors = { critical: '#FF4D4F', warning: '#F5A623', info: '#4D9FFF' }
        ctx.fillStyle = sevColors[card.severity]
        ctx.beginPath()
        ctx.roundRect(x, y, 3 * dpr, cardH, [6 * dpr, 0, 0, 6 * dpr])
        ctx.fill()

        // Card Text Titles (using standard canvas font fallback)
        ctx.fillStyle = '#E6EDF3'
        ctx.font = `${Math.max(10, 11 * dpr)}px monospace`
        ctx.fillText(card.title, x + 12 * dpr, y + cardH * 0.4)

        ctx.fillStyle = '#8B98A9'
        ctx.font = `${Math.max(8, 9 * dpr)}px sans-serif`
        ctx.fillText(card.sub, x + 12 * dpr, y + cardH * 0.7)

        ctx.restore()
      })
    }

    animationId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [reducedMotion])

  return (
    <div ref={containerRef} className="w-full h-full relative select-none">
      {/* Floating Alerts Counter */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 flex flex-col items-center z-20">
        <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-1">
          Active Alert Volume
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl md:text-5xl font-mono font-bold tracking-tight text-text-primary tabular-nums">
            {alertsCount.toLocaleString()}
          </span>
          <span className="text-ui-sm font-sans font-semibold text-text-secondary">
            alerts
          </span>
        </div>
        <div className="h-[2px] w-12 bg-accent/30 mt-2 rounded-full overflow-hidden relative">
          <div 
            className="absolute top-0 bottom-0 bg-accent transition-all duration-300"
            style={{ width: `${(alertsCount / 2000) * 100}%` }}
          />
        </div>
      </div>

      <canvas ref={canvasRef} className="block w-full h-full" aria-hidden="true" />
    </div>
  )
}
