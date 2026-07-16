import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { Link } from 'react-router-dom'
import { useStreamStore } from '@/store/stream'
import { RawStreamPanel } from '@/features/storm/RawStreamPanel'
import { IncidentPanel } from '@/features/incidents/IncidentPanel'
import { DemoDriver } from '@/features/demo-driver/DemoDriver'
import { Odometer } from '@/components/ui/Odometer'
import { ConvergenceOverlay } from '@/components/ui/ConvergenceOverlay'
import { DrillDownSlideOver } from '@/features/drilldown/DrillDownSlideOver'
import { audioManager } from '@/lib/audio'

export function WarRoom() {
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null)
  
  const connection = useStreamStore((s) => s.connection)
  const stats = useStreamStore((s) => s.stats)

  const alertsPerSec = stats?.alerts_per_sec
  const totalAlerts = stats?.total_alerts ?? null
  const activeIncidents = stats?.active_incidents ?? null
  const compressionRatio = stats?.compression_ratio ?? null
  const replayRunning = stats?.replay?.running ?? false

  const [muted, setMuted] = useState(audioManager.getMuted())

  // Sync mute state on custom events
  useEffect(() => {
    const handleMuteEvent = (e: Event) => {
      setMuted((e as CustomEvent<boolean>).detail)
    }
    window.addEventListener('stormlens-audio-mute', handleMuteEvent)
    return () => window.removeEventListener('stormlens-audio-mute', handleMuteEvent)
  }, [])

  // Listen to keyboard shortcut events for card selection
  useEffect(() => {
    const handleShortcutSelect = (e: Event) => {
      const idx = (e as CustomEvent<number>).detail
      const sortedIncidents = [...useStreamStore.getState().incidents.values()].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
      const target = sortedIncidents[idx]
      if (target) {
        setSelectedIncidentId(target.id)
      }
    }

    const handleShortcutClose = () => {
      setSelectedIncidentId(null)
    }

    window.addEventListener('stormlens-shortcut-incident', handleShortcutSelect)
    window.addEventListener('stormlens-shortcut-close', handleShortcutClose)

    return () => {
      window.removeEventListener('stormlens-shortcut-incident', handleShortcutSelect)
      window.removeEventListener('stormlens-shortcut-close', handleShortcutClose)
    }
  }, [])

  // ── Ambience hum tracking alerts per second ──────────────────────────────
  useEffect(() => {
    if (alertsPerSec !== undefined) {
      audioManager.updateRumble(alertsPerSec)
    }
  }, [alertsPerSec])

  // ── Sparkline Rate History (30 points) ──────────────────────────────────
  const [rateHistory, setRateHistory] = useState<{ value: number }[]>([])

  useEffect(() => {
    if (alertsPerSec !== undefined) {
      setRateHistory((prev) => {
        const next = [...prev, { value: alertsPerSec }]
        if (next.length > 30) {
          return next.slice(next.length - 30)
        }
        return next
      })
    }
  }, [alertsPerSec])

  // ── Compression Pulse Animation on Increase ─────────────────────────────
  const prevCompRatio = useRef<number | null>(null)
  const [shouldPulse, setShouldPulse] = useState(false)

  useEffect(() => {
    if (compressionRatio !== null && prevCompRatio.current !== null) {
      if (compressionRatio > prevCompRatio.current) {
        setShouldPulse(true)
        const timer = setTimeout(() => setShouldPulse(false), 200)
        return () => clearTimeout(timer)
      }
    }
    if (compressionRatio !== null) {
      prevCompRatio.current = compressionRatio
    }
  }, [compressionRatio])

  // ── Glow state for the Left Panel (Alert rate > 40/s) ────────────────────
  const showCriticalGlow = (alertsPerSec ?? 0) > 40

  return (
    <div className="flex flex-col h-screen w-screen bg-bg-base overflow-hidden font-sans select-none">
      {/* ── Top Bar (64px) ────────────────────────────────────────────────── */}
      <header className="h-16 px-6 border-b border-border bg-bg-surface flex items-center justify-between flex-shrink-0 z-10">
        
        {/* Left: Wordmark + Connection Dot */}
        <div className="flex items-center gap-3">
          <span className="font-semibold text-text-primary text-[15px] tracking-tight">StormLens</span>
          <div className="flex items-center gap-1.5 pl-1.5 border-l border-border">
            <span
              className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                connection === 'open'
                  ? 'bg-accent animate-pulse-dot'
                  : connection === 'connecting'
                  ? 'bg-severity-warning animate-pulse-dot'
                  : 'bg-severity-critical'
              }`}
            />
            <span className="text-[11px] text-text-secondary font-mono capitalize">
              {connection === 'open' ? 'connected' : connection}
            </span>
          </div>
        </div>

        {/* Center: Hero Equation [total_alerts] alerts → [active_incidents] incidents */}
        <div className="flex items-center gap-2 text-ui-sm font-mono text-text-secondary select-none">
          <Odometer value={totalAlerts} format="integer" className="text-text-primary font-semibold" />
          <span className="text-text-muted">alerts</span>
          
          <span className="mx-1 text-text-muted">→</span>
          
          <Odometer value={activeIncidents} format="integer" className="text-accent font-semibold" />
          <span className="text-text-muted">incidents</span>
          
          <span className="mx-2 text-border-strong font-sans">·</span>
          
          <motion.span
            animate={shouldPulse ? { scale: [1, 1.03, 1] } : {}}
            transition={{ duration: 0.2 }}
            className="inline-block"
          >
            <Odometer
              value={compressionRatio}
              format="percent2"
              className="text-accent font-semibold"
            />
          </motion.span>
          <span className="text-text-muted">noise suppressed</span>
        </div>

        {/* Right: Rate stat + Sparkline + Replay status */}
        <div className="flex items-center gap-4">
          {/* Rate Stat & Sparkline */}
          <div className="flex items-center gap-2 bg-bg-base/40 px-2.5 py-1 rounded border border-border/50">
            <div className="flex flex-col text-right">
              <span className="text-[9px] text-text-muted uppercase font-mono tracking-wider">rate</span>
              <span className="text-stream font-mono text-text-primary tabular-nums">
                {alertsPerSec !== undefined ? `${alertsPerSec.toFixed(1)}/s` : '—/s'}
              </span>
            </div>
            
            {/* Sparkline chart */}
            <div className="w-[60px] h-[20px] opacity-80">
              {rateHistory.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={rateHistory} margin={{ top: 1, right: 1, bottom: 1, left: 1 }}>
                    <defs>
                      <linearGradient id="rateSparkline" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2DD4A7" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#2DD4A7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#2DD4A7"
                      strokeWidth={1.2}
                      fill="url(#rateSparkline)"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Replay Indicator */}
          {replayRunning && (
            <div className="px-2 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent font-mono text-[9px] font-semibold tracking-wider uppercase animate-pulse">
              Replay
            </div>
          )}

          {/* Mute speaker button */}
          <button
            onClick={() => audioManager.toggleMute()}
            className="p-1.5 rounded hover:bg-bg-elevated text-text-secondary hover:text-accent transition-colors flex items-center justify-center flex-shrink-0"
            title={muted ? "Unmute ambience (M)" : "Mute ambience (M)"}
          >
            {muted ? (
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6L4.5 9H1.5v6h3l4.5 3.75V5.25z" />
              </svg>
            ) : (
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
            )}
          </button>

          {/* Tiny Eval link */}
          <Link
            to="/eval"
            className="px-2.5 py-1 rounded bg-bg-elevated border border-border hover:bg-bg-hover text-[11px] font-mono font-semibold text-text-secondary hover:text-text-primary transition-all duration-200"
          >
            Eval
          </Link>
        </div>
      </header>

      {/* ── Main Split View (Two Panels) ──────────────────────────────────── */}
      <main className="flex-1 min-h-0 w-full p-4 flex gap-4 bg-bg-base">
        {/* Left Panel: Raw Stream (40%) */}
        <section
          className={`w-[40%] flex flex-col h-full rounded-card border-t-2 border-t-severity-critical ${
            showCriticalGlow ? 'border-glow-critical' : ''
          } transition-all duration-300`}
        >
          <RawStreamPanel />
        </section>

        {/* Right Panel: Incidents (60%) */}
        <section className="w-[60%] flex flex-col h-full rounded-card border-t-2 border-t-accent">
          <IncidentPanel onIncidentSelect={setSelectedIncidentId} />
        </section>
      </main>

      {/* ── Demo Replay Controller ─────────────────────────────────────────── */}
      <div className="absolute bottom-6 right-6 z-50">
        <DemoDriver />
      </div>

      {/* ── Convergence Particle Overlay ────────────────────────────────────── */}
      <ConvergenceOverlay />

      {/* ── Drill-down Slide-over ─────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedIncidentId && (
          <DrillDownSlideOver
            incidentId={selectedIncidentId}
            onClose={() => setSelectedIncidentId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
