import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useStreamStore } from '@/store/stream'
import { Sparkline } from '@/components/ui/Sparkline'
import { RawStreamPanel } from '@/features/storm/RawStreamPanel'
import { StormTimeline } from '@/features/storm/StormTimeline'
import { IncidentPanel } from '@/features/incidents/IncidentPanel'
import { DemoDriver } from '@/features/demo-driver/DemoDriver'
import { Odometer } from '@/components/ui/Odometer'
import { ConvergenceOverlay } from '@/components/ui/ConvergenceOverlay'
import { DrillDownSlideOver } from '@/features/drilldown/DrillDownSlideOver'
import { PanelErrorBoundary } from '@/components/ui/PanelErrorBoundary'
import { audioManager } from '@/lib/audio'
import { Toast } from '@/components/ui/Toast'
import { usePresentationMode } from '@/lib/presentationMode'
import { ColdOpen } from '@/features/intro/ColdOpen'
import { LensPanel } from '@/features/lens/LensPanel'

export function WarRoom() {
  const [view, setView] = useState<'stream' | 'lens'>('stream')
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)
  const [showIntro, setShowIntro] = useState(() => {
    try {
      return sessionStorage.getItem('intro_seen') !== 'true'
    } catch {
      return true
    }
  })
  const { presentationMode, toggle: togglePresentation } = usePresentationMode()
  
  const connection = useStreamStore((s) => s.connection)
  const stats = useStreamStore((s) => s.scrubMode && s.scrubState ? s.scrubState.stats : s.stats)
  const auditLog = useStreamStore((s) => s.auditLog)
  const unreadAuditCount = useStreamStore((s) => s.unreadAuditCount)
  const clearUnreadAuditCount = useStreamStore((s) => s.clearUnreadAuditCount)
  const scrubMode = useStreamStore((s) => s.scrubMode)
  const scrubTime = useStreamStore((s) => s.scrubTime)

  const handleCaptureSnapshot = () => {
    const state = useStreamStore.getState()
    if (!state.scrubState) return

    const scrubState = state.scrubState
    const total_alerts = scrubState.stats?.total_alerts ?? 0
    
    const activeIncs = [...scrubState.incidents.values()].filter(i => i.status === 'active')
    const firstInc = activeIncs[0]
    const rootCand = firstInc?.root_candidates?.[0]
    const rootCause = rootCand ? `${rootCand.service} ${Math.round(rootCand.confidence * 100)}%` : 'none'

    const snapshotText = `StormLens @ t+${state.scrubTime.toFixed(1)}s — ${total_alerts} alerts, ${activeIncs.length} incidents, root: ${rootCause}`
    
    navigator.clipboard.writeText(snapshotText)
      .then(() => {
        window.dispatchEvent(new CustomEvent('stormlens-toast', { detail: 'Copied snapshot to clipboard!' }))
      })
      .catch((err) => console.error('[time-machine] failed to copy snapshot:', err))
  }

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

  // Listen to keyboard shortcut 'V' to toggle view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        (document.activeElement as HTMLElement)?.contentEditable === 'true'
      ) {
        return
      }
      if (e.key.toLowerCase() === 'v') {
        setView((prev) => (prev === 'stream' ? 'lens' : 'stream'))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
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
      {/* ── Top Bar (64px CSS Grid) ────────────────────────────────────────── */}
      <header className="h-16 border-b border-border bg-bg-surface grid grid-cols-[240px_1fr_280px] items-center px-6 w-full select-none flex-shrink-0 z-[50] relative">
        
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
          {replayRunning && (
            <div className="px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent font-mono text-[8px] font-semibold tracking-wider uppercase animate-pulse">
              Replay
            </div>
          )}
        </div>

        {/* Center: Segmented Control [Stream | Lens] + Hero Equation */}
        <div className="justify-self-center flex items-center gap-6 z-20">
          <div className="flex bg-bg-base p-0.5 rounded border border-border">
            <button
              onClick={() => setView('stream')}
              className={`px-3 py-1 rounded text-[11px] font-sans font-medium transition-colors ${
                view === 'stream'
                  ? 'bg-bg-surface text-text-primary border border-border shadow-sm font-semibold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Stream
            </button>
            <button
              onClick={() => setView('lens')}
              className={`px-3 py-1 rounded text-[11px] font-sans font-medium transition-colors ${
                view === 'lens'
                  ? 'bg-bg-surface text-text-primary border border-border shadow-sm font-semibold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Lens
            </button>
          </div>

          {view === 'stream' && (
            <div className="flex items-center gap-2 text-ui-sm font-mono text-text-secondary whitespace-nowrap min-w-0 max-w-full overflow-hidden text-ellipsis select-none animate-fade-in">
              <Odometer value={totalAlerts} format="integer" easing="linear" className="text-text-primary font-semibold" />
              <span className="text-text-muted">alerts</span>
              
              <span className="text-text-muted">→</span>
              
              <Odometer value={activeIncidents} format="integer" easing="spring" className="text-accent font-semibold" />
              <span className="text-text-muted">incidents</span>
              
              <span className="text-border-strong font-sans">·</span>
              
              <motion.span
                animate={shouldPulse ? { scale: [1, 1.03, 1] } : {}}
                transition={{ duration: 0.2 }}
                className="inline-block"
              >
                <Odometer
                  value={compressionRatio}
                  format="percent2"
                  easing="spring"
                  className="text-accent font-semibold"
                />
              </motion.span>
              <span className="text-text-muted">noise suppressed</span>
            </div>
          )}
        </div>

        {/* Right Cluster, in order: alerts/sec component, sound toggle, single overflow menu */}
        <div className="justify-self-end flex items-center gap-4">
          
          {/* Rate Stat & Sparkline (Compact 90px component) */}
          <div className="flex items-center justify-between bg-bg-base/40 px-2 py-1 rounded border border-border/50 w-[90px] h-[28px] flex-shrink-0 select-none">
            <span className="text-[10px] font-mono text-text-primary tabular-nums tracking-tighter">
              {alertsPerSec !== undefined ? `${Math.round(alertsPerSec)}/s` : '0/s'}
            </span>
            
            {/* Sparkline chart */}
            <div className="w-[42px] h-[14px] opacity-80">
              {rateHistory.length > 0 && (
                <Sparkline
                  data={rateHistory.map(d => d.value)}
                  width={42}
                  height={14}
                  color="#2DD4A7"
                />
              )}
            </div>
          </div>

          {/* Sound speaker toggle button */}
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

          {/* Activity Log Popover Button */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => {
                if (!auditOpen) {
                  clearUnreadAuditCount()
                }
                setAuditOpen(!auditOpen)
              }}
              className="p-1.5 rounded hover:bg-bg-elevated text-text-secondary hover:text-accent transition-colors flex items-center justify-center flex-shrink-0 relative"
              title="Activity Log"
            >
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {unreadAuditCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-severity-critical border border-bg-surface text-[8px] font-mono font-bold text-text-inverse flex items-center justify-center px-0.5 select-none animate-pulse">
                  <Odometer value={unreadAuditCount} format="integer" easing="spring" className="text-text-inverse text-[8px] font-bold" />
                </span>
              )}
            </button>
            {auditOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAuditOpen(false)} />
                <div className="absolute right-0 mt-1.5 w-[320px] max-h-[400px] overflow-y-auto rounded bg-bg-elevated border border-border shadow-elevated p-3.5 z-50 flex flex-col font-sans text-left">
                  <h4 className="text-[10px] font-bold text-text-primary uppercase tracking-wider mb-2.5 pb-1.5 border-b border-border/40 select-none">
                    Activity Log
                  </h4>
                  {auditLog.length === 0 ? (
                    <div className="text-[11px] text-text-muted py-6 text-center select-none font-mono">
                      No activity logged yet
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {auditLog.map((entry) => {
                        const formattedTime = new Date(entry.timestamp).toLocaleTimeString(undefined, {
                          hour12: false,
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })

                        return (
                          <div key={entry.id} className="flex flex-col text-[11px] font-mono leading-tight">
                            <div className="flex items-center justify-between text-[9px] text-text-muted mb-0.5 select-none">
                              <span className="font-bold uppercase text-accent/80">
                                {entry.type.replace(/_/g, ' ')}
                              </span>
                              <span>{formattedTime}</span>
                            </div>
                            <span className="text-text-primary select-text">{entry.message}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* SINGLE Navigation Overflow Menu */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-8 h-8 rounded hover:bg-bg-elevated text-text-secondary hover:text-text-primary flex items-center justify-center font-bold text-base transition-colors"
              title="Navigation Menu"
            >
              ⋯
            </button>
            {menuOpen && (
              <>
                {/* Backdrop to close menu */}
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-1.5 w-40 rounded-md bg-bg-elevated border border-border shadow-elevated py-1 z-50 flex flex-col font-sans">
                  {[
                    { label: 'Evaluation', path: '/eval' },
                    { label: 'Style Guide', path: '/tokens' },
                    { label: 'WS Debugger', path: '/debug' },
                    { label: 'Diagnostics', path: '/health' },
                  ].map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMenuOpen(false)}
                      className="px-3.5 py-2 text-ui-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors text-left"
                    >
                      {item.label}
                    </Link>
                  ))}
                  {/* Presentation Mode toggle */}
                  <div className="border-t border-border/40 mt-1 pt-1">
                    <button
                      onClick={() => { togglePresentation(); setMenuOpen(false) }}
                      className="w-full flex items-center justify-between px-3.5 py-2 text-ui-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
                    >
                      <span>Presentation Mode</span>
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                        presentationMode
                          ? 'bg-accent/20 border-accent/40 text-accent'
                          : 'bg-bg-base border-border text-text-muted'
                      }`}>
                        {presentationMode ? 'ON' : 'OFF'}
                      </span>
                    </button>
                    {/* Replay Intro */}
                    <button
                      onClick={() => {
                        try {
                          sessionStorage.removeItem('intro_seen')
                        } catch {}
                        setShowIntro(true)
                        setMenuOpen(false)
                      }}
                      className="w-full text-left px-3.5 py-2 text-ui-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
                    >
                      Replay Intro
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

        </div>
      </header>

      {/* ── Storm Timeline Strip ────────────────────────────────────────────────── */}
      <PanelErrorBoundary label="Timeline">
        <StormTimeline />
      </PanelErrorBoundary>

      {/* ── Main Layout: Stream Split View vs Lens view ────────────────── */}
      {view === 'stream' ? (
        <main className="flex-1 min-h-0 w-full p-4 flex gap-4 bg-bg-base animate-fade-in">
          {/* Left Panel: Raw Stream (40%) */}
          <section
            className={`w-[40%] flex flex-col h-full rounded-card border-t-2 border-t-severity-critical ${
              showCriticalGlow ? 'border-glow-critical' : ''
            } transition-all duration-300`}
          >
            <PanelErrorBoundary label="Storm Stream">
              <RawStreamPanel />
            </PanelErrorBoundary>
          </section>

          {/* Right Panel: Incidents (60%) */}
          <section className="w-[60%] flex flex-col h-full rounded-card border-t-2 border-t-accent">
            <PanelErrorBoundary label="Incidents">
              <IncidentPanel onIncidentSelect={setSelectedIncidentId} />
            </PanelErrorBoundary>
          </section>
        </main>
      ) : (
        <LensPanel onIncidentSelect={setSelectedIncidentId} />
      )}

      {/* ── Time Machine REVIEWING Pill DOM Overlay ─────────────────────── */}
      {scrubMode && (
        <div className="absolute top-[88px] left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 bg-bg-surface/90 border border-accent/40 shadow-elevated px-3 py-1.5 rounded-full font-mono text-[10px] text-accent select-none backdrop-blur-md animate-fade-in">
          <span>⏸ REVIEWING — t+{scrubTime.toFixed(1)}s</span>
          <button
            onClick={handleCaptureSnapshot}
            className="p-1 hover:bg-bg-elevated rounded text-text-secondary hover:text-accent transition-colors flex items-center justify-center cursor-pointer"
            title="Copy shareable text snapshot to clipboard"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Demo Replay Controller ─────────────────────────────────────────── */}
      <div className="absolute bottom-6 right-6 z-50">
        <DemoDriver />
      </div>

      {/* ── Convergence Particle Overlay (Disabled in Lens view) ────────────── */}
      {view === 'stream' && <ConvergenceOverlay />}

      {/* Toast Notification Container */}
      <Toast />

      {/* ── Drill-down Slide-over ─────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedIncidentId && (
          <DrillDownSlideOver
            incidentId={selectedIncidentId}
            onClose={() => setSelectedIncidentId(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Cinematic Intro Cold Open ────────────────────────────────────── */}
      <AnimatePresence>
        {showIntro && (
          <ColdOpen onComplete={() => setShowIntro(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}
