import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { WarRoom } from '@/app/WarRoom'
import { EvalDashboard } from '@/features/eval/EvalDashboard'
import { TokensPage } from '@/app/TokensPage'
import { DebugPage } from '@/app/DebugPage'
import { HealthPage } from '@/app/HealthPage'
import { LandingPage } from '@/features/landing/LandingPage'
import { useWsConnection } from '@/hooks/useWsConnection'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useStreamStore } from '@/store/stream'
import { CommandPalette } from '@/components/ui/CommandPalette'
import { CornerBrackets } from '@/components/ui/CornerBrackets'
import { ReticleLogo } from '@/components/ui/ReticleLogo'
import { CommandBar } from '@/components/ui/CommandBar'
import { Kbd } from '@/components/ui/Kbd'
import { Odometer } from '@/components/ui/Odometer'
import { Sparkline } from '@/components/ui/Sparkline'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { audioManager } from '@/lib/audio'
import { useFPSStore } from '@/lib/motion'
import { clsx } from 'clsx'
import { AlertTriangle, Check, Volume2, VolumeX, Menu, X } from 'lucide-react'

function useFPSMonitor() {
  const updateFPS = useFPSStore((s) => s.updateFPS)

  useEffect(() => {
    let lastTime = performance.now()
    let frames = 0
    let rafId = 0

    const check = (time: number) => {
      frames++
      if (time - lastTime >= 1000) {
        const fps = Math.round((frames * 1000) / (time - lastTime))
        updateFPS(fps)
        frames = 0
        lastTime = time
      }
      rafId = requestAnimationFrame(check)
    }

    rafId = requestAnimationFrame(check)
    return () => cancelAnimationFrame(rafId)
  }, [updateFPS])
}

export function DashboardLayout() {
  useWsConnection()
  
  // Wire global keyboard shortcuts
  const { showOverlay, setShowOverlay } = useKeyboardShortcuts()
  
  const connection = useStreamStore((s) => s.connection)
  const [lastConnection, setLastConnection] = useState(connection)
  const [showRecoveryFlash, setShowRecoveryFlash] = useState(false)
  const [muted, setMuted] = useState(() => audioManager.getMuted())
  const [menuOpen, setMenuOpen] = useState(false)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const shortcutsTriggerRef = useRef<HTMLButtonElement>(null)

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    menuTriggerRef.current?.focus()
  }, [])

  const closeOverlay = useCallback(() => {
    setShowOverlay(false)
    shortcutsTriggerRef.current?.focus()
  }, [setShowOverlay])

  // Escape key closes open popovers/modals and returns focus
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (menuOpen) { closeMenu(); return }
        if (showOverlay) { closeOverlay(); return }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen, showOverlay, closeMenu, closeOverlay])

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
  const navigate = useNavigate()

  return (
    <div className="flex h-screen w-screen bg-bg-base overflow-hidden font-sans select-none text-text-primary relative">
      
      {/* ── Left Sidebar Navigation (Linear / Notion dashboard density) ── */}
      <aside className="w-56 border-r border-border bg-bg-surface flex flex-col h-full flex-shrink-0 z-40 relative group/bracket transition-all duration-240 ease-lens">
        <CornerBrackets />
        
        {/* Workspace Switcher (Visual Dropdown UI) */}
        <div className="h-16 border-b border-border flex items-center px-4 gap-2.5 flex-shrink-0 select-none group/workspace hover:bg-bg-hover/30 transition-colors duration-120 cursor-pointer">
          <div className="w-6 h-6 rounded bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-[10px] font-bold font-mono shadow-sm group-hover/workspace:border-accent/40 transition-colors">
            SL
          </div>
          <div className="flex flex-col">
            <span className="font-sans text-[11px] font-bold tracking-wider uppercase text-text-primary leading-tight flex items-center gap-1">
              STORMLENS
              <svg className="w-2.5 h-2.5 text-text-muted group-hover/workspace:text-text-secondary transition-colors" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </span>
            <span className="text-[9px] font-mono text-text-muted leading-none">HPE Cluster</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-4 px-2.5 flex flex-col gap-1.5 min-h-0 overflow-y-auto">
          {[
            { to: '/war-room', label: 'War Room', badge: '01' },
            { to: '/eval', label: 'Metrics Eval', badge: '02' },
            { to: '/health', label: 'Diagnostics', badge: '03' },
            { to: '/debug', label: 'WS Debugger', badge: '04' },
            { to: '/tokens', label: 'Style Tokens', badge: '05' },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => clsx(
                "w-full text-left px-3.5 py-2 flex items-center justify-between text-[12px] font-sans font-medium transition-all duration-150 ease-out rounded-[10px] border border-transparent",
                isActive
                  ? "bg-bg-hover text-text-primary border-border/80 shadow-[inset_2.5px_0_0_0_var(--accent)] pl-4 font-semibold"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:translate-x-0.5"
              )}
            >
              <span>{item.label}</span>
              <span className="text-[9px] font-mono text-text-muted/60 opacity-60">▎{item.badge}</span>
            </NavLink>
          ))}
        </nav>

        {/* Command Menu Shortcut & Help at the bottom */}
        <div className="mt-auto p-4 border-t border-border/40 flex flex-col gap-2.5 bg-bg-surface/80 backdrop-blur-md flex-shrink-0 font-sans">
          <div className="flex items-center justify-between text-[10px] text-text-secondary font-mono">
            <span>Command Menu</span>
            <Kbd>⌘K</Kbd>
          </div>
          <div className="flex items-center justify-between text-[10px] text-text-secondary font-mono">
            <span>Shortcuts Help</span>
            <Button
              size="sm"
              variant="accent"
              onClick={() => setShowOverlay(true)}
              className="text-[9px] font-mono font-bold px-2 py-0.5 h-auto rounded"
            >
              Press ?
            </Button>
          </div>
          <div className="border-t border-border/20 pt-2.5 flex items-center justify-between text-[10px] text-text-secondary font-mono">
            <span>Exit Dashboard</span>
            <button
              onClick={() => {
                navigate('/')
              }}
              className="text-[9px] hover:text-text-primary px-1.5 py-0.5 rounded border border-border hover:bg-bg-hover transition-colors font-sans cursor-pointer font-bold"
            >
              Exit
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Workspace Area ── */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Connection Banners (thin strips under navbar/header) */}
        <div className="w-full flex-shrink-0 select-none z-[50] relative">
          {connection !== 'open' && !showRecoveryFlash && (
          <div className="h-6 w-full bg-severity-critical text-text-inverse text-[10px] font-mono font-bold tracking-wider flex items-center justify-center gap-1.5 animate-pulse z-[var(--z-banner)] relative">
              <AlertTriangle size={12} /> CONNECTION LOST — RECONNECTING…
            </div>
          )}
          {showRecoveryFlash && (
          <div className="h-6 w-full bg-accent text-text-inverse text-[10px] font-mono font-bold tracking-wider flex items-center justify-center gap-1.5 z-[var(--z-banner)] relative">
              <Check size={12} /> CONNECTION RECOVERED — LIVE
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

          {location.pathname === '/war-room' ? (
            <>
              {/* Left Side: Socket status indicator */}
              <div className="flex items-center gap-3 w-[30%]">
                <ReticleLogo connection={connection} />
                <span className="font-semibold text-text-primary text-[15px] tracking-tight font-sans">StormLens</span>
                <div className="flex items-center gap-1.5 pl-2.5 border-l border-border">
                  <span className="text-[11px] text-text-secondary font-mono capitalize">
                    {connection === 'open' ? 'live' : connection}
                  </span>
                </div>
                {replayRunning && (
                  <div className="px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent font-mono text-[8px] font-semibold tracking-wider uppercase animate-pulse">
                    Replay
                  </div>
                )}
              </div>

              {/* Center: CommandBar + Segmented Control [Stream | Lens] */}
              <div className="flex-1 flex items-center justify-start pl-[2%] gap-6 z-20">
                <CommandBar />
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
                  <div className="flex items-center gap-4 bg-bg-base/40 px-3 py-1.5 rounded border border-border text-[11px] font-mono text-text-secondary select-none animate-fade-in">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500/80" />
                      <Odometer value={totalAlerts} format="integer" easing="linear" className="text-text-primary font-bold" />
                      <span className="text-[9px] text-text-muted uppercase">alerts</span>
                    </div>
                    <span className="text-border/40 select-none">|</span>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent/80 animate-pulse" />
                      <Odometer value={activeIncidents} format="integer" easing="spring" className="text-accent font-bold" />
                      <span className="text-[9px] text-text-muted uppercase">incidents</span>
                    </div>
                    <span className="text-border/40 select-none">|</span>
                    <div className="flex items-center gap-1.5">
                      <Odometer value={compressionRatio} format="percent2" easing="spring" className="text-accent font-bold" />
                      <span className="text-[9px] text-text-muted uppercase font-sans">Noise Suppressed</span>
                    </div>
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

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    audioManager.toggleMute()
                    setMuted(audioManager.getMuted())
                  }}
                  title={muted ? "Unmute ambient storm hum" : "Mute ambient storm hum"}
                  className="h-7 w-7 p-0 flex items-center justify-center"
                >
                  {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </Button>

                <div className="relative">
                  <Button
                    ref={menuTriggerRef}
                    variant="secondary"
                    size="sm"
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="h-7 w-7 p-0 flex items-center justify-center"
                    aria-label="Open settings menu"
                    aria-expanded={menuOpen}
                  >
                    <Menu size={14} />
                  </Button>
                  {menuOpen && (
                    <Card
                      variant="elevated"
                      padding="none"
                      className="absolute right-0 mt-2 w-48 py-1 z-[var(--z-popover)] flex flex-col overflow-hidden"
                    >
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
                        className="flex items-center justify-between px-3.5 py-2 text-ui-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors text-left font-sans cursor-pointer border-t border-border/20"
                      >
                        <span>Command Palette</span>
                        <kbd className="text-[9px] font-mono font-bold bg-bg-base border border-border text-text-muted px-1.5 py-0.5 rounded">⌘K</kbd>
                      </button>
                    </Card>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between w-full z-20">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] font-bold tracking-wider uppercase text-text-muted">
                  ▎ {location.pathname.replace('/', '').toUpperCase()}
                </span>
              </div>
              <div className="flex-1 flex justify-center">
                <CommandBar />
              </div>
              <div className="w-[10%]"></div>
            </div>
          )}
        </header>

        {/* Route views container */}
        <div className="flex-1 min-h-0 w-full overflow-y-auto relative">
          <Outlet />
        </div>
      </div>

      <CommandPalette />

      {/* Keyboard Shortcuts Overlay Modal */}
      {showOverlay && (
        <div
          onClick={() => closeOverlay()}
          className="fixed inset-0 bg-bg-base/70 backdrop-blur-md z-[var(--z-modal)] flex items-center justify-center select-none font-sans"
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
                ref={shortcutsTriggerRef}
                onClick={() => closeOverlay()}
                className="text-text-muted hover:text-text-primary cursor-pointer"
                aria-label="Close shortcuts overlay"
              >
                <X size={14} />
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

function AppInner() {
  useFPSMonitor()
  
  // Title and Dynamic Favicon set at root level
  const connection = useStreamStore((s) => s.connection)
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

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<DashboardLayout />}>
        <Route path="/war-room" element={<WarRoom />} />
        <Route path="/eval" element={<EvalDashboard />} />
        <Route path="/tokens" element={<TokensPage />} />
        <Route path="/debug" element={<DebugPage />} />
        <Route path="/health" element={<HealthPage />} />
      </Route>
    </Routes>
  )
}


export function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}
