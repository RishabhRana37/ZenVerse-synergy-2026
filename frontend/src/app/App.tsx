import { useEffect, useState, useMemo } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
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
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
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
  const [entered, setEntered] = useState(() => {
    try {
      return sessionStorage.getItem('stormlens_entered') === 'true'
    } catch {
      return false
    }
  })

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
  const navigate = useNavigate()

  if (location.pathname === '/' && !entered) {
    return (
      <div className="w-full min-h-screen bg-[#05080E] text-[#F8FAFC] font-sans overflow-y-auto select-none relative z-50 flex flex-col items-center">
        {/* Diagonal Red Ray Glows in Background (Raycast lasers) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute -top-[10%] left-[5%] w-[160px] h-[140%] bg-gradient-to-b from-[#FF2B2E]/0 via-[#FF2B2E]/18 to-[#FF2B2E]/0 rotate-[35deg] blur-[90px]" />
          <div className="absolute -top-[25%] left-[38%] w-[260px] h-[150%] bg-gradient-to-b from-[#FF2B2E]/0 via-[#FF2B2E]/25 to-[#FF4D4F]/8 rotate-[35deg] blur-[130px]" />
          <div className="absolute -top-[20%] left-[65%] w-[90px] h-[130%] bg-gradient-to-b from-[#F5A623]/0 via-[#F5A623]/10 to-[#F5A623]/0 rotate-[35deg] blur-[70px]" />
        </div>

        {/* Raycast-style Landing Header Navigation */}
        <header className="w-full max-w-7xl h-20 px-8 flex items-center justify-between z-10 shrink-0 border-b border-white/[0.02] bg-transparent">
          {/* Left: Logo */}
          <div className="flex items-center gap-3">
            <ReticleLogo connection={connection} />
            <span className="font-sans text-[15px] font-bold tracking-tight text-[#F8FAFC]">StormLens</span>
          </div>

          {/* Center Links */}
          <div className="hidden md:flex items-center gap-8 text-[13px] font-medium text-[#94A3B8]">
            <button onClick={() => navigate('/health')} className="hover:text-[#F8FAFC] transition-colors cursor-pointer bg-transparent border-0 outline-none">Store</button>
            <button onClick={() => navigate('/eval')} className="hover:text-[#F8FAFC] transition-colors cursor-pointer bg-transparent border-0 outline-none">Pro</button>
            <button onClick={() => navigate('/debug')} className="hover:text-[#F8FAFC] transition-colors cursor-pointer bg-transparent border-0 outline-none">AI</button>
            <button onClick={() => navigate('/tokens')} className="hover:text-[#F8FAFC] transition-colors cursor-pointer bg-transparent border-0 outline-none">Style Primitives</button>
            <span className="text-white/10 select-none">|</span>
            <a href="https://github.com/RishabhRana37/ZenVerse-synergy-2026" target="_blank" rel="noopener noreferrer" className="hover:text-[#F8FAFC] transition-colors">GitHub</a>
            <a href="#docs" className="hover:text-[#F8FAFC] transition-colors bg-transparent border-0 outline-none">Docs</a>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-6 text-[13px] font-medium">
            <button onClick={() => navigate('/debug')} className="text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer bg-transparent border-0 outline-none">Log in</button>
            <Button
              variant="primary"
              onClick={() => {
                sessionStorage.setItem('stormlens_entered', 'true')
                setEntered(true)
              }}
              className="bg-[#F8FAFC] text-[#05080E] font-semibold hover:opacity-90 px-4 py-2 text-ui-sm rounded-md"
            >
              Enter War Room
            </Button>
          </div>
        </header>

        {/* Hero Main Content */}
        <div className="w-full max-w-4xl px-8 pt-20 pb-12 flex flex-col items-center text-center z-10 shrink-0">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: 'easeOut' }}
            className="text-[52px] md:text-[68px] font-bold tracking-tight text-[#F8FAFC] leading-[1.05]"
          >
            Your shortcut to <br />
            <span className="bg-gradient-to-r from-accent via-[#FF4D4F] to-[#F5A623] bg-clip-text text-transparent">resolution.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25, ease: 'easeOut' }}
            className="text-[15px] md:text-[18px] text-[#94A3B8] max-w-2xl mt-6 leading-relaxed"
          >
            A collection of powerful alert correlation tools all within a high-signal, extendable launcher. Fast, ergonomic and reliable.
          </motion.p>

          {/* Hero Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: 'easeOut' }}
            className="flex items-center gap-3.5 mt-10"
          >
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                sessionStorage.setItem('stormlens_entered', 'true')
                setEntered(true)
              }}
              className="bg-[#F8FAFC] text-[#05080E] hover:opacity-90 font-semibold px-6 py-3 rounded-lg flex items-center gap-2 shadow-xl shadow-accent/5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-10.84 0M10.22 8.22a3 3 0 11-4.22 0 3 3 0 014.22 0z" />
              </svg>
              Enter War Room Dashboard
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => navigate('/health')}
              className="px-6 py-3 rounded-lg border border-border/80 text-[#F8FAFC]"
            >
              Run Diagnostics
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="text-[10px] font-mono text-text-muted mt-5"
          >
            Install via npm or cargo | Try the new StormLens CLI v1.2
          </motion.div>

          {/* Pill Link Banner */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="mt-8"
          >
            <button
              onClick={() => navigate('/tokens')}
              className="px-4 py-1.5 rounded-full bg-accent/5 hover:bg-accent/10 border border-accent/20 hover:border-accent/30 text-[10px] font-mono text-accent transition-all flex items-center gap-1.5 cursor-pointer bg-transparent outline-none"
            >
              <span>Meet Glaze UI Tokens</span>
              <span className="text-[#94A3B8]">·</span>
              <span className="text-[#94A3B8] hover:text-accent flex items-center gap-0.5">Learn more →</span>
            </button>
          </motion.div>
        </div>

        {/* Floating App Preview Dashboard Frame */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 120, delay: 0.5 }}
          className="w-full max-w-5xl px-8 pb-20 z-10 flex flex-col items-center"
        >
          <div className="w-full aspect-[16/10] bg-bg-surface border border-border rounded-xl shadow-2xl relative overflow-hidden flex flex-col group/mockup">
            {/* Top Window Header Chrome */}
            <div className="h-10 border-b border-border/40 bg-bg-surface flex items-center justify-between px-4 select-none flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]/20" />
                <span className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]/20" />
                <span className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]/20" />
              </div>
              <span className="text-[10px] font-mono text-text-muted">StormLens Live Dashboard (Preview Mode)</span>
              <div className="w-16" /> {/* spacer */}
            </div>

            {/* Live Dashboard Body Content */}
            <div className="flex-1 min-h-0 pointer-events-none relative scale-[0.98] origin-center opacity-85 group-hover/mockup:opacity-95 transition-opacity duration-240">
              <WarRoom />
            </div>
          </div>
        </motion.div>
      </div>
    )
  }

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
        <nav className="flex-1 py-4 px-2.5 flex flex-col gap-1 min-h-0 overflow-y-auto">
          {[
            { to: '/', label: 'War Room', badge: '01' },
            { to: '/eval', label: 'Metrics Eval', badge: '02' },
            { to: '/health', label: 'Diagnostics', badge: '03' },
            { to: '/debug', label: 'WS Debugger', badge: '04' },
            { to: '/tokens', label: 'Style Tokens', badge: '05' },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => clsx(
                "w-full text-left px-3.5 py-2 flex items-center justify-between text-[12px] font-sans font-medium transition-all duration-120 ease-lens rounded-md border border-transparent",
                isActive
                  ? "bg-bg-hover/80 text-text-primary border-border/60 shadow-[inset_2.5px_0_0_0_#2DD4A7] pl-4 font-semibold"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              )}
            >
              <span>{item.label}</span>
              <span className="text-[9px] font-mono text-text-muted/60 opacity-60">▎{item.badge}</span>
            </NavLink>
          ))}
        </nav>

        {/* Command Menu Shortcut & Help at the bottom */}
        <div className="mt-auto p-4 border-t border-border/40 flex flex-col gap-2.5 bg-bg-surface flex-shrink-0 font-sans">
          <div className="flex items-center justify-between text-[10px] text-text-secondary font-mono">
            <span>Command Menu</span>
            <kbd className="text-[9px] font-mono font-bold bg-bg-base border border-border text-text-muted px-1.5 py-0.5 rounded shadow-sm">⌘K</kbd>
          </div>
          <div className="flex items-center justify-between text-[10px] text-text-secondary font-mono">
            <span>Shortcuts Help</span>
            <Button
              size="sm"
              variant="accent"
              onClick={() => setShowOverlay(true)}
              className="text-[9px] font-mono font-bold px-2 py-0.5 h-auto"
            >
              Press ?
            </Button>
          </div>
          <div className="border-t border-border/20 pt-2.5 flex items-center justify-between text-[10px] text-text-secondary font-mono">
            <span>Exit Dashboard</span>
            <button
              onClick={() => {
                sessionStorage.removeItem('stormlens_entered')
                setEntered(false)
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
                    {connection === 'open' ? 'live' : connection}
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

                {/* Sound speaker toggle button */}
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
                  {muted ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6L4.5 9H1.5v6h3l4.5 3.75V5.25z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                    </svg>
                  )}
                </Button>

                {/* Dropdown Menu */}
                <div className="relative">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="h-7 w-7 p-0 flex items-center justify-center"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                  </Button>
                  {menuOpen && (
                    <Card
                      variant="elevated"
                      padding="none"
                      className="absolute right-0 mt-2 w-48 py-1 z-[100] flex flex-col overflow-hidden"
                    >
                      <button
                        onClick={() => {
                          try { sessionStorage.removeItem('intro_seen') } catch {}
                          useStreamStore.getState().setShowIntro(true)
                          setMenuOpen(false)
                        }}
                        className="px-3.5 py-2 text-ui-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors text-left font-sans cursor-pointer text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors text-left font-sans cursor-pointer"
                      >
                        Replay Cinematic Intro
                      </button>
                      <button
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('stormlens-open-palette'))
                          setMenuOpen(false)
                        }}
                        className="flex items-center justify-between px-3.5 py-2 text-ui-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors text-left font-sans cursor-pointer border-t border-border/20 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors text-left font-sans cursor-pointer"
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
