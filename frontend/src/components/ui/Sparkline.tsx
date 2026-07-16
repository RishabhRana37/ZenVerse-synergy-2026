import { useEffect, useRef, useState } from 'react'

interface SparklineProps {
  data: number[]
  width: number
  height: number
  color?: string
}

export function Sparkline({ data, width, height, color = '#2DD4A7' }: SparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [animationProgress, setAnimationProgress] = useState(1)
  const prevLastValRef = useRef<number | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const animationStartTimeRef = useRef<number | null>(null)

  const lastVal = data.length > 0 ? data[data.length - 1] : null

  // Trigger animation if the last value changes (new point added or updated)
  useEffect(() => {
    if (lastVal === null) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      setAnimationProgress(1)
      prevLastValRef.current = lastVal
      return
    }

    if (prevLastValRef.current !== null && prevLastValRef.current !== lastVal) {
      // Start a 200ms animation
      setAnimationProgress(0)
      animationStartTimeRef.current = performance.now()

      const tick = (now: number) => {
        if (!animationStartTimeRef.current) return
        const elapsed = now - animationStartTimeRef.current
        const progress = Math.min(1, elapsed / 200)
        setAnimationProgress(progress)

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(tick)
        }
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      animationFrameRef.current = requestAnimationFrame(tick)
    }

    prevLastValRef.current = lastVal

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [lastVal])

  // Draw to canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || data.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, width, height)

    const yMin = Math.min(...data)
    const yMax = Math.max(...data)
    const yRange = yMax - yMin === 0 ? 1 : yMax - yMin

    // Return canvas coordinates for a data point
    const getX = (idx: number) => (idx * width) / Math.max(1, data.length - 1)
    const getY = (val: number) => {
      // 2px top/bottom padding to prevent line clipping
      const paddedHeight = height - 4
      const pct = (val - yMin) / yRange
      return height - 2 - pct * paddedHeight
    }

    const n = data.length

    // Line segments
    const points: { x: number; y: number }[] = []
    for (let i = 0; i < n; i++) {
      const x = getX(i)
      const y = getY(data[i])

      if (i === n - 1 && n > 1) {
        // Interpolate the last segment
        const prevX = points[i - 1].x
        const prevY = points[i - 1].y
        const curX = prevX + (x - prevX) * animationProgress
        const curY = prevY + (y - prevY) * animationProgress
        points.push({ x: curX, y: curY })
      } else {
        points.push({ x, y })
      }
    }

    if (points.length === 0) return

    // ── 1. Draw area gradient fill ───────────────────────────────────────────
    const grad = ctx.createLinearGradient(0, 0, 0, height)
    grad.addColorStop(0, `${color}25`) // subtle gradient top
    grad.addColorStop(1, 'transparent')

    ctx.beginPath()
    ctx.moveTo(points[0].x, height)
    points.forEach((p) => ctx.lineTo(p.x, p.y))
    ctx.lineTo(points[points.length - 1].x, height)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // ── 2. Draw sparkline stroke ─────────────────────────────────────────────
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y)
    }
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()

    // ── 3. Draw active dot with glow ─────────────────────────────────────────
    const lastP = points[points.length - 1]
    ctx.save()
    ctx.beginPath()
    ctx.arc(lastP.x, lastP.y, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = 6
    ctx.fill()
    ctx.restore()
  }, [data, width, height, color, animationProgress])

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'block',
      }}
    />
  )
}
