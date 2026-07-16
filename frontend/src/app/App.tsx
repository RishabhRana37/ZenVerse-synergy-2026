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

/** Root component — mounts WS connection for entire app lifetime */
function AppInner() {
  useWsConnection()
  
  // Wire global keyboard shortcuts
  const { showOverlay, setShowOverlay } = useKeyboardShortcuts()
  
  const connection = useStreamStore((s) => s.connection)
  const [lastConnection, setLastConnection] = useState(connection)
  const [showRecoveryFlash, setShowRecoveryFlash] = useState(false)

  // Title and Favicon configuration
  useEffect(() => {
    document.title = 'StormLens — War Room'

    // Inline dark favicon SVG (simple lens/storm glyph)
    const svgFavicon = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%232DD4A7%22><path d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z%22/></svg>`

    let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.getElementsByTagName('head')[0].appendChild(link)
    }
    link.href = svgFavicon
  }, [])

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
