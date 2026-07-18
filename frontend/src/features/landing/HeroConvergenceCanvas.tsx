import { useEffect, useRef, useState, useCallback } from 'react'
import { SPRING } from '@/lib/motion'
import { fpsGuard } from '@/lib/fpsGuard'

interface Particle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  startR: number
  startG: number
  startB: number
  colorStr: string
  size: number
  targetWellIndex: number
  progress: number
  startX: number
  startY: number
  targetX: number
  targetY: number
  controlX: number
  controlY: number
}

// ── Severity color helpers ───────────────────────────────────────────────────
const SEV_COLORS = [
  { str: '#FF4D4F', r: 255, g: 77, b: 79 }, // critical (60%)
  { str: '#F5A623', r: 245, g: 166, b: 35 }, // warning (25%)
  { str: '#4D9FFF', r: 77, g: 159, b: 255 },  // info (15%)
]

export function HeroConvergenceCanvas({ resetKey = 0 }: { resetKey?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const startTimeRef = useRef<number>(0)
  
  const [alertsCount, setAlertsCount] = useState(0)
  const [flashState, setFlashState] = useState(false)

  // Auto-detect reduced motion preference
  const fpsReduced = fpsGuard.isThrottled()
  const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const reducedMotion = prefersReduced || fpsReduced

  const createParticles = useCallback((w: number, h: number): Particle[] => {
    const cap = Math.min(80, fpsGuard.getParticleCap())
    const list: Particle[] = []
    
    for (let i = 0; i < cap; i++) {
      const rand = Math.random()
      let sev = SEV_COLORS[0] // critical (60%)
      if (rand > 0.6 && rand <= 0.85) {
        sev = SEV_COLORS[1] // warning (25%)
      } else if (rand > 0.85) {
        sev = SEV_COLORS[2] // info (15%)
      }

      list.push({
        id: i,
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.7,
        vy: (Math.random() - 0.5) * 0.7,
        startR: sev.r,
        startG: sev.g,
        startB: sev.b,
        colorStr: sev.str,
        size: 1.5 + Math.random() * 1.5,
        targetWellIndex: i % 3,
        progress: 0,
        startX: 0,
        startY: 0,
        targetX: 0,
        targetY: 0,
        controlX: 0,
        controlY: 0
      })
    }
    return list
  }, [])

  useEffect(() => {
    // Reference SPRING for layout presets matching
    if (SPRING) { /* reference only */ }

    if (reducedMotion) {
      setAlertsCount(3)
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1

    const resize = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      canvas.width = (rect?.width ?? 680) * dpr
      canvas.height = (rect?.height ?? 380) * dpr
      canvas.style.width = '100%'
      canvas.style.height = '100%'
    }
    resize()
    window.addEventListener('resize', resize)

    let particles = createParticles(canvas.width, canvas.height)
    startTimeRef.current = performance.now()
    let prevTime = performance.now()
    let animationId = 0

    const render = (now: number) => {
      fpsGuard.measure()
      const dt = Math.min(50, now - prevTime)
      prevTime = now

      let elapsed = now - startTimeRef.current

      // Reset and loop at 5300ms (4800ms stages + 500ms fadeout)
      if (elapsed >= 5300) {
        startTimeRef.current = now
        elapsed = 0
        particles = createParticles(canvas.width, canvas.height)
      }

      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      const wells = [
        { x: w * 0.25, y: h * 0.5 },
        { x: w * 0.5,  y: h * 0.5 },
        { x: w * 0.75, y: h * 0.5 }
      ]

      // ── STAGE 1: CHAOS (0 - 2000ms) ─────────────────────────────────────────
      if (elapsed < 2000) {
        const t1 = Math.min(1, elapsed / 1800)
        const ease = t1 * (2 - t1) // easeOutQuad
        setAlertsCount(Math.round(2000 * ease))
        setFlashState(false)

        particles.forEach(p => {
          // slight drift with velocity
          p.x += p.vx * (dt / 16.666) * dpr
          p.y += p.vy * (dt / 16.666) * dpr

          // wrap around bounds
          if (p.x < 0) p.x += w
          else if (p.x > w) p.x -= w
          if (p.y < 0) p.y += h
          else if (p.y > h) p.y -= h

          ctx.fillStyle = p.colorStr
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * dpr, 0, Math.PI * 2)
          ctx.fill()
        })
      }
      // ── STAGE 2: PULL (2000 - 3500ms) ───────────────────────────────────────
      else if (elapsed < 3500) {
        const elapsedStage2 = elapsed - 2000
        const t2 = Math.min(1, elapsedStage2 / 1500)
        const ease = t2 * t2 * t2 // easeInCubic
        setAlertsCount(Math.round(2000 - 1997 * ease))
        setFlashState(false)

        particles.forEach(p => {
          // Capture start coords on stage transition
          if (p.progress === 0) {
            p.startX = p.x
            p.startY = p.y
            p.targetX = wells[p.targetWellIndex].x
            p.targetY = wells[p.targetWellIndex].y
            p.controlX = (p.startX + p.targetX) / 2 + (Math.random() - 0.5) * w * 0.25
            p.controlY = (p.startY + p.targetY) / 2 + (Math.random() - 0.5) * h * 0.45
          }

          p.progress = Math.min(1, p.progress + 0.008 * (dt / 16.666))

          // Curve path along Bezier
          const t = p.progress
          const mt = 1 - t
          p.x = mt * mt * p.startX + 2 * mt * t * p.controlX + t * t * p.targetX
          p.y = mt * mt * p.startY + 2 * mt * t * p.controlY + t * t * p.targetY

          // Interpolate color toward accent (#2DD4A7: r=45, g=212, b=167)
          const r = Math.round(p.startR + (45 - p.startR) * t)
          const g = Math.round(p.startG + (212 - p.startG) * t)
          const b = Math.round(p.startB + (167 - p.startB) * t)

          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * dpr, 0, Math.PI * 2)
          ctx.fill()
        })
      }
      // ── STAGE 3: SETTLE (3500 - 4800ms) ─────────────────────────────────────
      else if (elapsed < 4800) {
        setAlertsCount(3)
        setFlashState(elapsed < 4000) // accent color flash for 500ms (3500 to 4000ms)

        const elapsedStage3 = elapsed - 3500

        // Draw expand flash ripple (0-300ms)
        if (elapsedStage3 < 300) {
          const flashPct = elapsedStage3 / 300
          const radius = (5 + flashPct * 40) * dpr
          const opacity = 1 - flashPct
          ctx.strokeStyle = `rgba(45, 212, 167, ${opacity})`
          ctx.lineWidth = 2 * dpr
          
          wells.forEach(well => {
            ctx.beginPath()
            ctx.arc(well.x, well.y, radius, 0, Math.PI * 2)
            ctx.stroke()
          })
        }

        // Render card silhouettes scaling up (0-300ms) using ease-out cubic
        const t3 = Math.min(1, elapsedStage3 / 300)
        const easeOutCubic = 1 - Math.pow(1 - t3, 3)
        const scale = 0.85 + 0.15 * easeOutCubic

        drawCardSilhouettes(ctx, wells, scale, 1.0, dpr)
      }
      // ── STAGE 4: FADEOUT (4800 - 5300ms) ────────────────────────────────────
      else {
        setAlertsCount(3)
        setFlashState(false)

        const fadeElapsed = elapsed - 4800
        const opacity = Math.max(0, 1 - fadeElapsed / 500)

        drawCardSilhouettes(ctx, wells, 1.0, opacity, dpr)
      }

      animationId = requestAnimationFrame(render)
    }

    const drawCardSilhouettes = (
      c: CanvasRenderingContext2D,
      wellsList: { x: number; y: number }[],
      scale: number,
      opacity: number,
      pixelRatio: number
    ) => {
      const cardW = 140 * pixelRatio
      const cardH = 50 * pixelRatio

      wellsList.forEach((well, idx) => {
        c.save()
        c.translate(well.x, well.y)
        c.scale(scale, scale)

        // Card solid fill
        c.fillStyle = `rgba(17, 22, 31, ${opacity})`
        c.beginPath()
        c.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 6 * pixelRatio)
        c.fill()

        // Accent border
        c.strokeStyle = `rgba(45, 212, 167, ${opacity})`
        c.lineWidth = 1.5 * pixelRatio
        c.stroke()

        // Faint label text
        c.fillStyle = `rgba(139, 152, 169, ${opacity})`
        c.font = `bold ${10 * pixelRatio}px monospace`
        c.textAlign = 'center'
        c.fillText(`INC-0${idx + 1}`, 0, 4 * pixelRatio)

        c.restore()
      })
    }

    animationId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [reducedMotion, resetKey, createParticles])

  const alertsColorClass = flashState ? 'text-accent' : 'text-text-primary'

  return (
    <div ref={containerRef} className="w-full h-full relative select-none">
      {/* Floating Alerts Counter */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 flex flex-col items-center z-20">
        <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-1">
          Active Alert Volume
        </span>
        <div className="flex items-baseline gap-2">
          <span className={`text-4xl md:text-5xl font-mono font-bold tracking-tight transition-colors duration-200 ${alertsColorClass} tabular-nums`}>
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

      {/* Canvas */}
      <canvas ref={canvasRef} className="block w-full h-full" aria-hidden="true" />

      {/* Static Card Silhouettes for Reduced Motion */}
      {reducedMotion && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-around px-8 md:px-16 select-none z-10">
          {[0, 1, 2].map((idx) => (
            <div
              key={idx}
              className="w-[140px] h-[50px] bg-[#11161F] border-[1.5px] border-accent/40 rounded flex flex-col items-center justify-center font-mono"
              style={{
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
              }}
            >
              <span className="text-[10px] font-bold text-text-primary tracking-wider">INC-0{idx + 1}</span>
            </div>
          ))}
        </div>
      )}

      {/* Live Sim Indicator */}
      <div className={`absolute bottom-3 right-3 flex items-center gap-1.5 pointer-events-none z-20 transition-opacity duration-300 ${reducedMotion ? 'opacity-0' : 'opacity-100'}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" />
        <span className="font-mono text-[10px] text-text-muted uppercase tracking-widest">LIVE SIM</span>
      </div>
    </div>
  )
}
