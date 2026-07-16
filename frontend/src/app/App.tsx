/**
 * App — top-level router.
 *
 * Routes:
 *   /         → WarRoom      (the demo view)
 *   /eval     → EvalDashboard
 *   /tokens   → TokensPage   (design system style guide)
 *   /debug    → DebugPage    (live WS state — connection, stats, incidents)
 *   /health   → HealthPage   (pre-demo checklist screen)
 */

import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { WarRoom } from '@/app/WarRoom'
import { EvalDashboard } from '@/features/eval/EvalDashboard'
import { TokensPage } from '@/app/TokensPage'
import { DebugPage } from '@/app/DebugPage'
import { HealthPage } from '@/app/HealthPage'
import { useWsConnection } from '@/hooks/useWsConnection'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useStreamStore } from '@/store/stream'
import { CommandPalette } from '@/components/ui/CommandPalette'

/** Root component — mounts WS connection for entire app lifetime */
function AppInner() {
  useWsConnection()
  
  // Wire global keyboard shortcuts
  const { showOverlay, setShowOverlay } = useKeyboardShortcuts()
  
  const connection = useStreamStore((s) => s.connection)
  const [lastConnection, setLastConnection] = useState(connection)
  const [showRecoveryFlash, setShowRecoveryFlash] = useState(false)

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

  return (
    <>
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

      <Routes>
        <Route path="/"       element={<WarRoom />} />
        <Route path="/eval"   element={<EvalDashboard />} />
        <Route path="/tokens" element={<TokensPage />} />
        <Route path="/debug"  element={<DebugPage />} />
        <Route path="/health" element={<HealthPage />} />
      </Routes>

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
                className="text-text-muted hover:text-text-primary text-xs"
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
    </>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}
