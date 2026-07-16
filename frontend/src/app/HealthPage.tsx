import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStreamStore } from '@/store/stream'

export function HealthPage() {
  const connection = useStreamStore((s) => s.connection)
  const [apiReachable, setApiReachable] = useState<'loading' | 'ok' | 'fail'>('loading')
  const [fps, setFps] = useState(60)

  // API reachability check
  useEffect(() => {
    const checkApi = async () => {
      try {
        const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8788'
        const res = await fetch(`${apiBase}/topology`)
        if (res.ok) {
          setApiReachable('ok')
        } else {
          setApiReachable('fail')
        }
      } catch {
        setApiReachable('fail')
      }
    }
    checkApi()
  }, [])

  // FPS Estimator requestAnimationFrame loop
  useEffect(() => {
    let lastTime = performance.now()
    let frames = 0
    let frameId: number

    const tick = () => {
      frames++
      const now = performance.now()
      if (now >= lastTime + 1000) {
        setFps(Math.round((frames * 1000) / (now - lastTime)))
        frames = 0
        lastTime = now
      }
      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [])

  return (
    <div className="flex flex-col min-h-screen bg-bg-base text-text-primary font-sans items-center justify-center p-6 select-none">
      <div className="w-full max-w-md p-6 bg-bg-surface border border-border rounded-lg shadow-elevated flex flex-col gap-5">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="flex flex-col">
            <span className="text-[14px] font-bold tracking-tight">StormLens Diagnostics</span>
            <span className="text-[10px] text-text-muted font-mono uppercase mt-0.5">Pre-Demo Checklist</span>
          </div>
          <Link
            to="/"
            className="px-2 py-1 rounded bg-bg-elevated border border-border hover:bg-bg-hover text-[10px] font-mono font-semibold text-text-secondary transition-colors"
          >
            ← War Room
          </Link>
        </div>

        {/* Diagnostic Items */}
        <div className="flex flex-col gap-3 font-mono text-[11px]">
          
          {/* WS Connection */}
          <div className="flex items-center justify-between p-2.5 rounded bg-bg-base border border-border/40">
            <span className="text-text-secondary">WebSocket stream connection:</span>
            <span
              className={
                connection === 'open'
                  ? 'text-accent font-bold'
                  : connection === 'connecting'
                  ? 'text-severity-warning font-bold'
                  : 'text-severity-critical font-bold'
              }
            >
              {connection.toUpperCase()}
            </span>
          </div>

          {/* API Reachability */}
          <div className="flex items-center justify-between p-2.5 rounded bg-bg-base border border-border/40">
            <span className="text-text-secondary">REST API reachability (port 8788):</span>
            <span
              className={
                apiReachable === 'ok'
                  ? 'text-accent font-bold'
                  : apiReachable === 'fail'
                  ? 'text-severity-critical font-bold'
                  : 'text-text-muted font-bold'
              }
            >
              {apiReachable.toUpperCase()}
            </span>
          </div>

          {/* FPS Estimate */}
          <div className="flex items-center justify-between p-2.5 rounded bg-bg-base border border-border/40">
            <span className="text-text-secondary">Render frame rate estimate (FPS):</span>
            <span
              className={
                fps >= 55
                  ? 'text-accent font-bold'
                  : fps >= 30
                  ? 'text-severity-warning font-bold'
                  : 'text-severity-critical font-bold'
              }
            >
              {fps} FPS
            </span>
          </div>

        </div>

        {/* Status Verdict */}
        <div className="text-center pt-2">
          {connection === 'open' && apiReachable === 'ok' && fps >= 55 ? (
            <span className="text-[11px] font-bold text-accent px-3 py-1.5 rounded-full bg-accent-dim border border-accent/20 tracking-wider uppercase select-none">
              ✓ SYSTEM READY FOR DEMO
            </span>
          ) : (
            <span className="text-[11px] font-bold text-severity-warning px-3 py-1.5 rounded-full bg-severity-warning/10 border border-severity-warning/20 tracking-wider uppercase select-none">
              ⚠️ DIAGNOSTICS INCOMPLETE / FAILING
            </span>
          )}
        </div>

      </div>
    </div>
  )
}
export default HealthPage
