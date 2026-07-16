/**
 * StormTimeline — full-width 72px canvas area chart.
 *
 * Renders a rolling 90-second window of alerts/sec, stacked by severity.
 * All drawing happens inside a requestAnimationFrame loop — no React re-renders
 * during animation. Data is pushed in from stats + alerts ring buffer once
 * per 2s stats tick.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useStreamStore } from '@/store/stream'

// ── Constants ─────────────────────────────────────────────────────────────

const WINDOW_SECS = 90          // rolling window width
const CANVAS_HEIGHT = 72        // px — must match the outer wrapper height
const GRID_LINES = 4            // horizontal y-grid lines

// Design tokens (must match index.css --severity-*)
const COLOR_CRIT  = 'rgba(255, 77, 79,  0.30)'
const COLOR_WARN  = 'rgba(245, 166, 35, 0.25)'
const COLOR_INFO  = 'rgba(77, 159, 255, 0.20)'
const COLOR_EDGE  = '#2DD4A7'   // accent — top stroke
const COLOR_GRID  = 'rgba(255, 255, 255, 0.04)'
const COLOR_TEXT  = 'rgba(139, 152, 169, 0.9)'
const COLOR_PLAYHEAD = 'rgba(45, 212, 167, 0.5)'
const COLOR_MARKER_LINE = 'rgba(255, 255, 255, 0.15)'
const COLOR_CRIT_SOLID  = '#FF4D4F'
const COLOR_ACCENT_SOLID = '#2DD4A7'

// ── Types ─────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────

function formatHHMMSS(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

// ── Component ─────────────────────────────────────────────────────────────

export function StormTimeline() {
  const [collapsed, setCollapsed] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, time: '', total: 0, crit: 0, warn: 0, info: 0 })

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bucketsRef = useRef<Bucket[]>([])
  const rafRef = useRef<number>(0)
  const dirtyRef = useRef(true)  // only redraw when data changed

  // Store subscriptions
  const statsRef = useRef(useStreamStore.getState().stats)
  const alertsRef = useRef(useStreamStore.getState().alerts)

  // Subscribe to store changes (no React re-render — ref-only)
  useEffect(() => {
    const unsub = useStreamStore.subscribe((state) => {
      statsRef.current = state.stats
      alertsRef.current = state.alerts
      dirtyRef.current = true
    })
    return unsub
  }, [])

  // Push a new bucket when stats update
  useEffect(() => {
    const unsub = useStreamStore.subscribe((state) => {
      if (!state.stats) return
      const now = Date.now()
      const bucketTs = Math.floor(now / 1000) * 1000

      // Count severity in the ring buffer for the current second
      const alerts = state.alerts
      const critCount = alerts.filter(a => a.severity === 'critical').length
      const warnCount = alerts.filter(a => a.severity === 'warning').length
      const infoCount = alerts.filter(a => a.severity === 'info').length
      const total = state.stats.alerts_per_sec ?? 0

      // Ratio mix for this bucket
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
      // Avoid duplicate bucket for same second
      if (existing.length > 0 && existing[existing.length - 1].ts === bucketTs) {
        existing[existing.length - 1] = newBucket
      } else {
        existing.push(newBucket)
      }

      // Trim to window
      const cutoff = now - WINDOW_SECS * 1000
      bucketsRef.current = existing.filter(b => b.ts >= cutoff)

      dirtyRef.current = true
    })
    return unsub
  }, [])

  // ── Canvas drawing ───────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)

    const now = Date.now()
    const buckets = bucketsRef.current

    // Y-scale: max rate + 20% headroom, minimum 10
    const maxRate = Math.max(10, ...buckets.map(b => b.total))
    const yScale = (H - 8) / (maxRate * 1.2)

    // X helper: timestamp → canvas X (right = now)
    const toX = (ts: number) => {
      const ageMs = now - ts
      const ageSec = ageMs / 1000
      return W - ageSec * (W / WINDOW_SECS)
    }

    // ── Y-grid ──────────────────────────────────────────────────────────
    ctx.strokeStyle = COLOR_GRID
    ctx.lineWidth = 1
    for (let i = 1; i <= GRID_LINES; i++) {
      const y = H - (i / GRID_LINES) * (H - 8)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }

    if (buckets.length >= 2) {
      // Build x/y points for each severity layer
      // Stacking: crit fills from baseline, warn sits on top of crit, info on warn

      const points = buckets.map(b => ({
        x: toX(b.ts),
        yCrit: H - b.crit * yScale,
        yWarn: H - (b.crit + b.warn) * yScale,
        yInfo: H - (b.crit + b.warn + b.info) * yScale,
        yTotal: H - b.total * yScale,
      }))

      // Helper to draw a stacked area between two y-arrays
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

      // Draw info layer (bottom)
      drawArea(COLOR_INFO,
        p => p.yInfo,
        _ => H
      )
      // Draw warn layer
      drawArea(COLOR_WARN,
        p => p.yWarn,
        p => p.yCrit
      )
      // Draw crit layer (top)
      drawArea(COLOR_CRIT,
        p => p.yCrit,
        _ => H
      )

      // ── Accent top stroke ──────────────────────────────────────────────
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].yTotal)
      for (const p of points) ctx.lineTo(p.x, p.yTotal)
      ctx.strokeStyle = COLOR_EDGE
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // ── Incident birth markers ─────────────────────────────────────────
    const incidents = useStreamStore.getState().incidents
    incidents.forEach(incident => {
      const x = toX(new Date(incident.created_at).getTime())
      if (x < -10 || x > W + 10) return

      // Fade at left edge
      const fadePct = Math.min(1, Math.max(0, x / 30))

      const rootSvc = incident.root_candidates?.[0]?.service ?? ''
      const sev = incident.root_candidates?.[0] !== undefined
        ? (incident.status === 'resolved'
          ? 'rgba(45,212,167,0.4)'
          : COLOR_CRIT_SOLID)
        : COLOR_ACCENT_SOLID

      // Vertical guideline
      ctx.save()
      ctx.globalAlpha = fadePct * 0.6
      ctx.strokeStyle = COLOR_MARKER_LINE
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
      ctx.setLineDash([])

      // Pin dot + label
      ctx.globalAlpha = fadePct
      ctx.fillStyle = sev
      ctx.beginPath()
      ctx.arc(x, 10, 3, 0, Math.PI * 2)
      ctx.fill()

      if (rootSvc) {
        ctx.font = '9px JetBrains Mono, monospace'
        ctx.fillStyle = sev
        ctx.textAlign = 'left'
        const label = rootSvc.length > 14 ? rootSvc.slice(0, 13) + '…' : rootSvc
        ctx.fillText(`● ${label}`, x + 6, 14)
      }
      ctx.restore()
    })

    // ── "Now" playhead ───────────────────────────────────────────────────
    ctx.save()
    ctx.strokeStyle = COLOR_PLAYHEAD
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(W - 1, 0)
    ctx.lineTo(W - 1, H)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()

    // ── Rate label (top-right) ────────────────────────────────────────
    const rate = statsRef.current?.alerts_per_sec ?? 0
    ctx.font = '10px JetBrains Mono, monospace'
    ctx.fillStyle = COLOR_TEXT
    ctx.textAlign = 'right'
    ctx.fillText(`${Math.round(rate)}/s`, W - 14, 14)

    dirtyRef.current = false
  }, [])

  // ── RAF loop ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const loop = () => {
      if (dirtyRef.current) draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  // ── Canvas resize observer ────────────────────────────────────────────────

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

  // ── Hover / crosshair ─────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const W = rect.width

    const now = Date.now()
    const ageSec = ((W - mouseX) / W) * WINDOW_SECS
    const targetTs = now - ageSec * 1000

    // Find closest bucket
    const buckets = bucketsRef.current
    let closest: Bucket | null = null
    let minDist = Infinity
    for (const b of buckets) {
      const d = Math.abs(b.ts - targetTs)
      if (d < minDist) { minDist = d; closest = b }
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

    // Draw crosshair overlay
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    dirtyRef.current = true

    // Schedule a crosshair draw on top of the regular draw
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
      c.setLineDash([])
      c.restore()
    })
  }, [draw])

  const handleMouseLeave = useCallback(() => {
    setTooltip(t => ({ ...t, visible: false }))
    dirtyRef.current = true
  }, [])

  const currentRate = useStreamStore(s => s.stats?.alerts_per_sec ?? 0)

  return (
    <div className="w-full flex-shrink-0 bg-bg-base border-b border-border select-none">
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
          <span className="text-[10px] font-mono font-bold text-text-muted tracking-wider uppercase">
            Storm Timeline
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
          />

          {/* Hover tooltip */}
          {tooltip.visible && (
            <div
              className="pointer-events-none absolute z-10 px-2.5 py-1.5 rounded bg-bg-elevated border border-border shadow-elevated text-[10px] font-mono leading-snug"
              style={{
                left: Math.min(tooltip.x + 10, 999),
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
