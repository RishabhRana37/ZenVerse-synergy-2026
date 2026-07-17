import { useEffect, useState, useMemo } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { WarRoom } from '@/app/WarRoom'
import { EvalDashboard } from '@/features/eval/EvalDashboard'
import { TokensPage } from '@/app/TokensPage'
import { DebugPage } from '@/app/DebugPage'
import { HealthPage } from '@/app/HealthPage'
import { useWsConnection } from '@/hooks/useWsConnection'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useStreamStore } from '@/store/stream'
import { CommandPalette } from '@/components/ui/CommandPalette'
import { CornerBrackets } from '@/components/ui/CornerBrackets'
import { ReticleLogo } from '@/components/ui/ReticleLogo'
import { Odometer } from '@/components/ui/Odometer'
import { Sparkline } from '@/components/ui/Sparkline'
import { audioManager } from '@/lib/audio'
import { clsx } from 'clsx'

function AppInner() {
  useWsConnection()
  
  // Wire global keyboard shortcuts
  const { showOverlay, setShowOverlay } = useKeyboardShortcuts()
  
  const connection = useStreamStore((s) => s.connection)
  const [lastConnection, setLastConnection] = useState(connection)
  const [showRecoveryFlash, setShowRecoveryFlash] = useState(false)
  const [muted, setMuted] = useState(() => audioManager.getMuted())
  const [menuOpen, setMenuOpen] = useState(false)

  const view = useStreamStore((s) => s.view)
  const stats = useStreamStore((s) => s.stats)
  const replayRunning = stats?.replay?.running
  const alertsPerSec = stats?.alerts_per_sec

  // Calculate live stats
  const alerts = useStreamStore((s) => s.alerts)
  const totalAlerts = useStreamStore((s) => {
    const list = s.scrubMode && s.scrubState ? s.scrubState.alerts : s.alerts
    return list.reduce((acc, a) => acc + (a.dup_count ?? 1), 0)
  })
  const activeIncidents = useStreamStore((s) => {
    const map = s.scrubMode && s.scrubState ? s.scrubState.incidents : s.incidents
    return [...map.values()].filter((i) => i.status === 'active').length
  })
  const compressionRatio = useStreamStore((s) => {
    const activeAlerts = s.scrubMode && s.scrubState ? s.scrubState.alerts : s.alerts
    const activeIncidents = s.scrubMode && s.scrubState ? s.scrubState.incidents : s.incidents
    const unique = activeAlerts.length
    const total = activeAlerts.reduce((acc, a) => acc + (a.dup_count ?? 1), 0)
    const incs = [...activeIncidents.values()].length
    if (total === 0) return 0
    return Math.max(0, 1 - (incs + unique) / total)
  })

  // Severity metrics for heatmap
  const { infoPct, warnPct } = useMemo(() => {
    const list = alerts
    const info = list.filter(a => a.severity === 'info').length
    const warn = list.filter(a => a.severity === 'warning').length
    const crit = list.filter(a => a.severity === 'critical').length
    const tot = info + warn + crit || 1
    return {
      infoPct: (info / tot) * 100,
      warnPct: (warn / tot) * 100,
      critPct: (crit / tot) * 100
    }
  }, [alerts])

  // Sparkline history
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

  // Title and Dynamic SVG Favicon configuration
  useEffect(() => {
    document.title = 'StormLens — War Room'
  }, [])

  useEffect(() => {
    const dotColor =
      connection === 'open'
        ? '%232DD4A7'
        : connection === 'connecting'
        ? '%23F5A623'
        : '%23FF4D4F'

    const svgFavicon = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="32" height="32"><circle cx="10" cy="10" r="7" fill="none" stroke="%23E6EDF3" stroke-width="1"/><line x1="10" y1="0" x2="10" y2="2" stroke="%23E6EDF3" stroke-width="1"/><line x1="10" y1="18" x2="10" y2="20" stroke="%23E6EDF3" stroke-width="1"/><line x1="0" y1="10" x2="2" y2="10" stroke="%23E6EDF3" stroke-width="1"/><line x1="18" y1="10" x2="20" y2="10" stroke="%23E6EDF3" stroke-width="1"/><circle cx="16.5" cy="4.5" r="2" fill="${dotColor}"/></svg>`

    let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.getElementsByTagName('head')[0].appendChild(link)
    }
    link.href = svgFavicon
  }, [connection])

  // Reconnection recovery flash banner logic
  useEffect(() => {
    if (connection === 'open' && (lastConnection === 'closed' || lastConnection === 'connecting')) {
      setShowRecoveryFlash(true)
      const t = setTimeout(() => setShowRecoveryFlash(false), 1500)
      return () => clearTimeout(t)
    }
    setLastConnection(connection)
  }, [connection, lastConnection])

  const location = useLocation()

  return (
    <div className="flex h-screen w-screen bg-bg-base overflow-hidden font-sans select-none text-text-primary relative">
      {/* ── Left Sidebar Navigation (Linear / Notion dashboard density) ── */}
      <aside className="w-56 border-r border-border bg-bg-surface flex flex-col h-full flex-shrink-0 z-40 relative group/bracket transition-all duration-240 ease-lens">
        <CornerBrackets />
        
        {/* Workspace Switcher */}
        <div className="h-16 border-b border-border flex items-center px-4 gap-2.5 flex-shrink-0 select-none">
          <div className="w-5 h-5 rounded bg-accent/15 border border-accent/30 flex items-center justify-center text-accent text-[11px] font-bold font-mono">
            SL
          </div>
          <span className="font-mono text-[11px] font-bold tracking-wider uppercase text-text-primary">
            STORMLENS
          </span>
          <span className="text-[9px] text-text-muted font-mono bg-bg-base px-1.5 py-0.5 rounded border border-border/60 ml-auto">
            HPE
          </span>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-4 px-2.5 flex flex-col gap-1 min-h-0 overflow-y-auto">
          {[
            { to: '/', label: 'WAR ROOM', badge: '01' },
            { to: '/eval', label: 'METRICS EVAL', badge: '02' },
            { to: '/health', label: 'DIAGNOSTICS', badge: '03' },
            { to: '/debug', label: 'WS DEBUGGER', badge: '04' },
            { to: '/tokens', label: 'STYLE TOKENS', badge: '05' },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => clsx(
                "w-full text-left px-3 py-2 flex items-center justify-between text-[11px] font-mono tracking-wider transition-all duration-120 ease-lens rounded-md",
                isActive
                  ? "bg-bg-hover text-text-primary border-l-2 border-accent pl-2.5 font-semibold"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary border-l-2 border-transparent"
              )}
            >
              <span>{item.label}</span>
              <span className="text-[9px] text-text-muted/60 opacity-60">▎{item.badge}</span>
            </NavLink>
          ))}
        </nav>

        {/* Command Menu Shortcut & Help at the bottom */}
        <div className="mt-auto p-4 border-t border-border/40 flex flex-col gap-2.5 bg-bg-surface flex-shrink-0 font-sans">
          <div className="flex items-center justify-between text-[10px] text-text-muted">
            <span>Command Menu</span>
            <kbd className="text-[9px] font-mono font-bold bg-bg-base border border-border text-text-muted px-1.5 py-0.5 rounded">⌘K</kbd>
          </div>
          <div className="flex items-center justify-between text-[10px] text-text-muted">
            <span>Keyboard Shortcuts</span>
            <button
              onClick={() => setShowOverlay(true)}
              className="text-[9px] font-mono font-bold bg-bg-base border border-border text-accent px-1.5 py-0.5 rounded hover:border-accent/40 cursor-pointer"
            >
              Press ?
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Workspace Area ── */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Connection Banners (thin strips under navbar/header) */}
        <div className="w-full flex-shrink-0 select-none z-[50] relative">
          {connection !== 'open' && !showRecoveryFlash && (
            <div className="h-6 w-full bg-severity-critical text-text-inverse text-[10px] font-mono font-bold tracking-wider flex items-center justify-center animate-pulse z-[50] relative">
              ⚠️ CONNECTION LOST — RECONNECTING…
            </div>
          )}
          {showRecoveryFlash && (
            <div className="h-6 w-full bg-accent text-text-inverse text-[10px] font-mono font-bold tracking-wider flex items-center justify-center z-[50] relative">
              ✓ CONNECTION RECOVERED — LIVE
            </div>
          )}
        </div>

        {/* Global Page Header */}
        <header className="h-16 border-b border-border bg-bg-surface flex items-center px-6 w-full select-none flex-shrink-0 z-[50] relative">
          {/* Severity Heatmap Strip from Stripe */}
          <div
            className="absolute top-0 left-0 right-0 h-[3px] animate-mesh-gradient"
            style={{
              background: `linear-gradient(90deg, 
                #3b82f6 0%, 
                #3b82f6 ${infoPct}%, 
                #f59e0b ${infoPct}%, 
                #f59e0b ${infoPct + warnPct}%, 
                #ff4d4f ${infoPct + warnPct}%, 
                #ff4d4f 100%)`
            }}
          />

          {location.pathname === '/' ? (
            <>
              {/* Left Side: Socket status indicator */}
              <div className="flex items-center gap-3 w-[30%]">
                <ReticleLogo connection={connection} />
                <span className="font-semibold text-text-primary text-[15px] tracking-tight font-sans">StormLens</span>
                <div className="flex items-center gap-1.5 pl-2.5 border-l border-border">
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

              {/* Center: Segmented Control [Stream | Lens] + Hero Equation (Left-anchored at 38% total offset) */}
              <div className="flex-1 flex items-center justify-start pl-[8%] gap-6 z-20">
                <div className="flex bg-bg-base p-0.5 rounded border border-border">
                  <button
                    onClick={() => useStreamStore.getState().setView('stream')}
                    className={clsx(
                      "px-3 py-1 rounded text-[11px] font-sans font-medium transition-colors cursor-pointer",
                      view === 'stream'
                        ? 'bg-bg-surface text-text-primary border border-border shadow-sm font-semibold'
                        : 'text-text-secondary hover:text-text-primary'
                    )}
                  >
                    Stream
                  </button>
                  <button
                    onClick={() => useStreamStore.getState().setView('lens')}
                    className={clsx(
                      "px-3 py-1 rounded text-[11px] font-sans font-medium transition-colors cursor-pointer",
                      view === 'lens'
                        ? 'bg-bg-surface text-text-primary border border-border shadow-sm font-semibold'
                        : 'text-text-secondary hover:text-text-primary'
                    )}
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
                    
                    <Odometer value={compressionRatio} format="percent2" easing="spring" className="text-accent font-semibold" />
                    <span className="text-text-muted">noise suppressed</span>
                  </div>
                )}
              </div>

              {/* Right Side: Rate stat, Ambience audio, settings menu */}
              <div className="flex items-center justify-end gap-4 w-[280px] ml-auto">
                <div className="flex items-center justify-between bg-bg-base/40 px-2 py-1 rounded border border-border/50 w-[90px] h-[28px] flex-shrink-0 select-none">
                  <span className="text-[10px] font-mono text-text-primary tabular-nums tracking-tighter">
                    {alertsPerSec !== undefined ? `${Math.round(alertsPerSec)}/s` : '0/s'}
                  </span>
                  
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
                  onClick={() => {
                    audioManager.toggleMute()
                    setMuted(audioManager.getMuted())
                  }}
                  className="p-1.5 rounded border border-border bg-bg-base/50 hover:bg-bg-hover hover:border-border-strong transition-all duration-120 text-text-secondary hover:text-text-primary flex items-center justify-center cursor-pointer"
                  title={muted ? "Unmute ambient storm hum" : "Mute ambient storm hum"}
                >
                  {muted ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6L4.5 9H1.5v6h3l4.5 3.75V5.25z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                    </svg>
                  )}
                </button>

                {/* Dropdown Menu */}
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="p-1.5 rounded border border-border bg-bg-base/50 hover:bg-bg-hover hover:border-border-strong transition-all duration-120 text-text-secondary hover:text-text-primary flex items-center justify-center cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-bg-surface border border-border rounded-md shadow-elevated py-1 z-[100] flex flex-col">
                      <button
                        onClick={() => {
                          try { sessionStorage.removeItem('intro_seen') } catch {}
                          useStreamStore.getState().setShowIntro(true)
                          setMenuOpen(false)
                        }}
                        className="px-3.5 py-2 text-ui-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors text-left font-sans cursor-pointer"
                      >
                        Replay Cinematic Intro
                      </button>
                      <button
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('stormlens-open-palette'))
                          setMenuOpen(false)
                        }}
                        className="flex items-center justify-between px-3.5 py-2 text-ui-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors text-left font-sans cursor-pointer"
                      >
                        <span>Command Palette</span>
                        <kbd className="text-[9px] font-mono font-bold bg-bg-base border border-border text-text-muted px-1.5 py-0.5 rounded">⌘K</kbd>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <span className="font-mono text-[11px] font-bold tracking-wider uppercase text-text-muted">
                ▎ {location.pathname.replace('/', '').toUpperCase()}
              </span>
            </div>
          )}
        </header>

        {/* Route views container */}
        <div className="flex-1 min-h-0 w-full overflow-hidden relative">
          <Routes>
            <Route path="/"       element={<WarRoom />} />
            <Route path="/eval"   element={<EvalDashboard />} />
            <Route path="/tokens" element={<TokensPage />} />
            <Route path="/debug"  element={<DebugPage />} />
            <Route path="/health" element={<HealthPage />} />
          </Routes>
        </div>
      </div>

      <CommandPalette />

      {/* Keyboard Shortcuts Overlay Modal */}
      {showOverlay && (
        <div
          onClick={() => setShowOverlay(false)}
          className="fixed inset-0 bg-bg-base/70 backdrop-blur-md z-[80] flex items-center justify-center select-none font-sans"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm p-6 bg-bg-surface border border-border rounded-lg shadow-elevated flex flex-col gap-4 text-text-primary"
          >
            <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
              <span className="text-[12px] font-bold text-accent uppercase tracking-wider font-sans">
                Keyboard Shortcuts
              </span>
              <button
                onClick={() => setShowOverlay(false)}
                className="text-text-muted hover:text-text-primary text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div className="flex flex-col gap-2.5 font-mono text-[11px]">
              {[
                { key: 'S', desc: 'Start scenario replay (1× speed)' },
                { key: 'X', desc: 'Stop replay (keeps stats ticking)' },
                { key: 'R', desc: 'Reset (stops, clears view, restarts)' },
                { key: 'E', desc: 'Toggle metrics evaluation (/eval)' },
                { key: 'W', desc: 'Go back to War Room dashboard' },
                { key: 'M', desc: 'Toggle ambient audio mute status' },
                { key: '1/2/3', desc: 'Open 1st, 2nd, or 3rd incident details' },
                { key: 'Esc', desc: 'Close open incident details panel' },
                { key: '?', desc: 'Show / Hide this shortcut menu' },
              ].map((item) => (
                <div key={item.key} className="flex items-center gap-3">
                  <kbd className="px-2 py-0.5 rounded bg-bg-base border border-border text-accent font-bold min-w-[42px] text-center select-all">
                    {item.key}
                  </kbd>
                  <span className="text-text-secondary text-left select-all">
                    {item.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}
