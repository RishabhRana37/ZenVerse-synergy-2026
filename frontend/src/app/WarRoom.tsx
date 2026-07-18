import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useStreamStore } from '@/store/stream'
import { Button } from '@/components/ui/Button'
import { RawStreamPanel } from '@/features/storm/RawStreamPanel'
import { StormTimeline } from '@/features/storm/StormTimeline'
import { IncidentPanel } from '@/features/incidents/IncidentPanel'
import { DemoDriver } from '@/features/demo-driver/DemoDriver'
import { ConvergenceOverlay } from '@/components/ui/ConvergenceOverlay'
import { DrillDownSlideOver } from '@/features/drilldown/DrillDownSlideOver'
import { PanelErrorBoundary } from '@/components/ui/PanelErrorBoundary'
import { Toast } from '@/components/ui/Toast'
import { ColdOpen } from '@/features/intro/ColdOpen'
import { LensPanel } from '@/features/lens/LensPanel'
import { CornerBrackets } from '@/components/ui/CornerBrackets'
import { audioManager } from '@/lib/audio'

export function WarRoom() {
  const view = useStreamStore((s) => s.view)
  const setView = useStreamStore((s) => s.setView)
  const showIntro = useStreamStore((s) => s.showIntro)
  const setShowIntro = useStreamStore((s) => s.setShowIntro)

  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null)

  // Sync sessionStorage when intro is completed
  useEffect(() => {
    if (!showIntro) {
      try {
        sessionStorage.setItem('intro_seen', 'true')
      } catch {}
    }
  }, [showIntro])

  const stats = useStreamStore((s) => s.scrubMode && s.scrubState ? s.scrubState.stats : s.stats)
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
        setView(view === 'stream' ? 'lens' : 'stream')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [view, setView])

  // Listen for open incident events from palette
  useEffect(() => {
    const handleOpenIncident = (e: Event) => {
      setSelectedIncidentId((e as CustomEvent<string>).detail)
    }
    window.addEventListener('stormlens-open-incident', handleOpenIncident)
    return () => window.removeEventListener('stormlens-open-incident', handleOpenIncident)
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
  const alertsPerSec = stats?.alerts_per_sec
  useEffect(() => {
    if (alertsPerSec !== undefined) {
      audioManager.updateRumble(alertsPerSec)
    }
  }, [alertsPerSec])



  return (
    <div className="flex flex-col h-full w-full bg-bg-base overflow-hidden font-sans select-none relative z-10">
      
      {/* ── Storm Timeline Strip ────────────────────────────────────────────────── */}
      <PanelErrorBoundary label="Timeline">
        <StormTimeline />
      </PanelErrorBoundary>



      {/* ── Main Layout: Stream Split View vs Lens view ────────────────── */}
      {view === 'stream' ? (
        <main className="flex-1 min-h-0 w-full p-5 flex gap-5 bg-transparent animate-fade-in relative z-10">
          {/* Left Panel: Raw Stream (40%) with Corner Brackets */}
          <section
            className="w-[40%] flex flex-col h-full rounded-card border border-border bg-bg-surface/85 backdrop-blur-xl shadow-card transition-all duration-150 hover:border-border-hover relative group/bracket"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-severity-critical rounded-t-card z-10 pointer-events-none" />
            <PanelErrorBoundary label="Storm Stream">
              <RawStreamPanel />
            </PanelErrorBoundary>
            <CornerBrackets />
          </section>

          {/* Right Panel: Incidents (60%) with Corner Brackets */}
          <section className="w-[60%] flex flex-col h-full rounded-card border border-border bg-bg-surface/85 backdrop-blur-xl shadow-card transition-all duration-150 hover:border-border-hover relative group/bracket">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent rounded-t-card z-10 pointer-events-none" />
            <PanelErrorBoundary label="Incidents">
              <IncidentPanel onIncidentSelect={setSelectedIncidentId} />
            </PanelErrorBoundary>
            <CornerBrackets />
          </section>
        </main>
      ) : (
        <LensPanel onIncidentSelect={setSelectedIncidentId} />
      )}

      {/* ── Time Machine REVIEWING Pill DOM Overlay ─────────────────────── */}
      {scrubMode && (
        <div className="absolute top-[88px] left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-[#0B0F19]/80 border border-accent/30 shadow-elevated px-4 py-2 rounded-full font-mono text-[10px] text-text-primary select-none backdrop-blur-md animate-fade-in">
          <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-accent">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
            Reviewing
          </span>
          <span className="text-text-secondary font-mono">t+{scrubTime.toFixed(1)}s</span>
          <span className="text-border/40 select-none">|</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCaptureSnapshot}
            className="h-6 w-6 p-0 hover:bg-bg-hover hover:text-accent flex items-center justify-center"
            title="Copy shareable text snapshot to clipboard"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
          </Button>
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
