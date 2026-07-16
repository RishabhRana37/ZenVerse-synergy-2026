import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

interface ColdOpenProps {
  onComplete: () => void
}

interface Point {
  rx: number
  ry: number
  vx: number
  vy: number
  tx: number
  ty: number
  color: string
  radius: number
}

export function ColdOpen({ onComplete }: ColdOpenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | null>(null)
  const pointsRef = useRef<Point[]>([])
  const [skipVisible, setSkipVisible] = useState(false)

  // 1. Handle Skip and Complete lifecycle
  const handleSkip = () => {
    // Save to sessionStorage
    try {
      sessionStorage.setItem('intro_seen', 'true')
    } catch {}
    onComplete()
  }

  // Trigger skip hint at 1s
  useEffect(() => {
    const skipTimer = setTimeout(() => {
      setSkipVisible(true)
    }, 1000)
    return () => clearTimeout(skipTimer)
  }, [])

  // Auto-advance to war room at 3.2s
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const advanceDuration = prefersReduced ? 400 : 3200

    const advanceTimer = setTimeout(() => {
      handleSkip()
    }, advanceDuration)

    return () => clearTimeout(advanceTimer)
  }, [onComplete])

  // Click & Keydown listeners to skip
  useEffect(() => {
    const handleKeyDown = () => {
      handleSkip()
    }
    const handleMouseClick = () => {
      handleSkip()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('click', handleMouseClick)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('click', handleMouseClick)
    }
  }, [onComplete])

  // 2. Canvas Animation logic
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = (canvas.width = window.innerWidth)
    let h = (canvas.height = window.innerHeight)

    const cols = 12
    const rows = 10
    const totalPoints = cols * rows

    // Initialize points
    const pts: Point[] = []
    for (let i = 0; i < totalPoints; i++) {
      pts.push({
        rx: Math.random() * w,
        ry: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        tx: 0,
        ty: 0,
        color: Math.random() < 0.12 ? '#2DD4A7' : '#5D6B7D',
        radius: Math.random() * 0.8 + 1.2,
      })
    }
    pointsRef.current = pts

    const updateTargets = (width: number, height: number) => {
      const padX = width * 0.15
      const padY = height * 0.2
      const dx = (width - padX * 2) / (cols - 1)
      const dy = (height - padY * 2) / (rows - 1)
      pointsRef.current.forEach((p, idx) => {
        const col = idx % cols
        const row = Math.floor(idx / cols)
        p.tx = padX + col * dx
        p.ty = padY + row * dy
      })
    }

    updateTargets(w, h)

    const handleResize = () => {
      if (!canvas) return
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
      updateTargets(w, h)
    }
    window.addEventListener('resize', handleResize)

    const startTime = performance.now()
    const duration = 2800 // lock into lattice by 2.8s

    const render = (time: number) => {
      const elapsed = time - startTime
      const progress = Math.min(1, elapsed / duration)

      // Cubic ease-in-out for organization speed
      const ease =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2

      ctx.clearRect(0, 0, w, h)

      pointsRef.current.forEach((p) => {
        // Drift position before grid alignment
        const dx = p.rx + p.vx * elapsed
        const dy = p.ry + p.vy * elapsed

        // Interpolate to grid
        const x = (1 - ease) * dx + ease * p.tx
        const y = (1 - ease) * dy + ease * p.ty

        ctx.beginPath()
        ctx.arc(x, y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
      })

      animationRef.current = requestAnimationFrame(render)
    }

    animationRef.current = requestAnimationFrame(render)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  // If prefers-reduced-motion is active, render a simple black backdrop
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (prefersReduced) {
    return (
      <motion.div
        ref={containerRef}
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed inset-0 bg-[#0A0E14] z-[100] flex items-center justify-center"
      />
    )
  }

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      className="fixed inset-0 bg-[#0A0E14] z-[100] flex flex-col items-center justify-center font-sans overflow-hidden select-none"
    >
      {/* 2D Canvas point field */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

      {/* Content wrapper */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center">
        {/* Wordmark */}
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
          className="text-5xl font-semibold tracking-tight text-text-primary mb-2 relative px-4"
        >
          StormLens
          {/* Underline draws left-to-right */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.0, delay: 0.6, ease: 'easeInOut' }}
            style={{ originX: 0 }}
            className="absolute -bottom-1 left-4 right-4 h-0.5 bg-accent"
          />
        </motion.h1>

        {/* Tagline */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.5, ease: 'easeOut' }}
          className="text-[13px] font-mono text-text-secondary mt-6 flex items-center gap-1.5 justify-center px-4"
        >
          <span>From</span>
          <span className="text-accent font-bold">2,000</span>
          <span>alerts to</span>
          <span className="text-accent font-bold">3</span>
          <span>answers.</span>
        </motion.div>
      </div>

      {/* Skip Hint */}
      {skipVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          transition={{ duration: 0.3 }}
          className="absolute bottom-6 right-8 text-[10px] font-mono text-text-secondary pointer-events-none"
        >
          press any key or click to skip ↵
        </motion.div>
      )}
    </motion.div>
  )
}
