import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStreamStore } from '@/store/stream'
import { getPresentationMode } from '@/lib/presentationMode'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CornerBrackets } from '@/components/ui/CornerBrackets'

export function HealthPage() {
  const connection = useStreamStore((s) => s.connection)
  const totalAlerts = useStreamStore((s) => s.stats?.total_alerts ?? 0)
  const incidents = useStreamStore((s) => s.incidents)
  const [apiReachable, setApiReachable] = useState<'loading' | 'ok' | 'fail'>('loading')
  const [fps, setFps] = useState(60)
  const [presentationMode, setPresentationMode] = useState(getPresentationMode())

  // API reachability check
  useEffect(() => {
    const checkApi = async () => {
      try {
        const apiBase = import.meta.env.VITE_API_URL || '/api'
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

  // Sync presentation mode state from localStorage on mount
  useEffect(() => {
    const handler = () => setPresentationMode(getPresentationMode())
    // Listen for storage changes (in case another tab changes it)
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  // Last storm summary
  const incidentCount = incidents.size
  const stormRun = totalAlerts > 0
  const lastStormSummary = stormRun
    ? `${totalAlerts.toLocaleString()} alerts → ${incidentCount} incident${incidentCount !== 1 ? 's' : ''}`
    : 'No storm run yet'

  const DiagRow = ({
    label,
    value,
    color,
  }: {
    label: string
    value: string
    color: 'accent' | 'warning' | 'critical' | 'muted'
  }) => (
    <div className="flex items-center justify-between p-2.5 rounded bg-bg-base border border-border/40">
      <span className="text-text-secondary">{label}</span>
      <span
        className={
          color === 'accent'
            ? 'text-accent font-bold'
            : color === 'warning'
            ? 'text-severity-warning font-bold'
            : color === 'critical'
            ? 'text-severity-critical font-bold'
            : 'text-text-muted font-bold'
        }
      >
        {value}
      </span>
    </div>
  )

  const allReady = connection === 'open' && apiReachable === 'ok' && fps >= 55

  return (
    <div className="w-full min-h-full bg-bg-base text-text-primary font-sans flex flex-col items-center justify-center py-12 px-6 select-none relative overflow-hidden">
      {/* Background laser rays */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 opacity-40">
        <div className="absolute -top-[10%] left-[5%] w-[160px] h-[140%] bg-gradient-to-b from-[#FF2B2E]/0 via-[#FF2B2E]/18 to-[#FF2B2E]/0 rotate-[35deg] blur-[90px]" />
        <div className="absolute -top-[25%] left-[38%] w-[260px] h-[150%] bg-gradient-to-b from-[#FF2B2E]/0 via-[#FF2B2E]/25 to-[#FF4D4F]/8 rotate-[35deg] blur-[130px]" />
      </div>

      <Card className="w-full max-w-md p-6 flex flex-col gap-5 relative group/bracket bg-bg-surface/80 backdrop-blur-md z-10 border border-border/80 shadow-2xl">
        <CornerBrackets />
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="flex flex-col">
            <span className="text-[14px] font-bold tracking-tight">StormLens Diagnostics</span>
            <span className="text-[10px] text-text-muted font-mono uppercase mt-0.5">Pre-Demo Checklist</span>
          </div>
          <Link to="/">
            <Button
              variant="secondary"
              size="sm"
              className="text-[10px] font-mono font-semibold text-text-secondary"
            >
              ← War Room
            </Button>
          </Link>
        </div>

        {/* Diagnostic Items */}
        <div className="flex flex-col gap-3 font-mono text-[11px]">
          
          {/* WS Connection */}
          <DiagRow
            label="WebSocket stream connection:"
            value={connection.toUpperCase()}
            color={connection === 'open' ? 'accent' : connection === 'connecting' ? 'warning' : 'critical'}
          />

          {/* API Reachability */}
          <DiagRow
            label="REST API reachability (backend :8000):"
            value={apiReachable.toUpperCase()}
            color={apiReachable === 'ok' ? 'accent' : apiReachable === 'fail' ? 'critical' : 'muted'}
          />

          {/* FPS Estimate */}
          <DiagRow
            label="Render frame rate estimate (FPS):"
            value={`${fps} FPS`}
            color={fps >= 55 ? 'accent' : fps >= 30 ? 'warning' : 'critical'}
          />

          {/* Presentation Mode */}
          <DiagRow
            label="Presentation mode:"
            value={presentationMode ? 'ON' : 'OFF'}
            color={presentationMode ? 'accent' : 'muted'}
          />

          {/* Last storm summary */}
          <DiagRow
            label="Last storm:"
            value={lastStormSummary}
            color={stormRun ? 'accent' : 'muted'}
          />

        </div>

        {/* Status Verdict */}
        <div className="text-center pt-2">
          {allReady ? (
            <span className="text-[11px] font-bold text-accent px-3 py-1.5 rounded-full bg-accent-dim border border-accent/20 tracking-wider uppercase select-none">
              ✓ SYSTEM READY FOR DEMO
            </span>
          ) : (
            <span className="text-[11px] font-bold text-severity-warning px-3 py-1.5 rounded-full bg-severity-warning/10 border border-severity-warning/20 tracking-wider uppercase select-none">
              ⚠️ DIAGNOSTICS INCOMPLETE / FAILING
            </span>
          )}
        </div>

        {/* Tips */}
        {!allReady && (
          <div className="flex flex-col gap-1.5 text-[10px] font-mono text-text-muted border-t border-border/30 pt-3">
            {connection !== 'open' && (
              <span>• WebSocket: start the backend (<code className="text-text-secondary">uvicorn app.api.main:app</code>) then reload</span>
            )}
            {apiReachable === 'fail' && (
              <span>• API: backend must be running (uvicorn app.api.main:app, port 8000)</span>
            )}
            {fps < 55 && (
              <span>• FPS: close other browser tabs and GPU-heavy apps</span>
            )}
          </div>
        )}

      </Card>
    </div>
  )
}
export default HealthPage
