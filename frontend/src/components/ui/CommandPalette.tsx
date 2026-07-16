import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useStreamStore } from '@/store/stream'
import { usePresentationMode } from '@/lib/presentationMode'
import { audioManager } from '@/lib/audio'
import { CornerBrackets } from '@/components/ui/CornerBrackets'
import { clsx } from 'clsx'

interface PaletteItem {
  id: string
  category: 'Actions' | 'Navigation' | 'Incidents' | 'Services'
  name: string
  shortcut?: string
  action: () => void
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const navigate = useNavigate()
  const location = useLocation()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const streamState = useStreamStore()
  const { toggle: togglePresentation } = usePresentationMode()

  // 1. Listen for Toggle trigger: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === 'k'
      const isCmdOrCtrl = e.metaKey || e.ctrlKey
      if (isCmdOrCtrl && isK) {
        e.preventDefault()
        setIsOpen((prev) => !prev)
        setSearch('')
        setActiveIndex(0)
      }
    }

    const handleOpenEvent = () => {
      setIsOpen(true)
      setSearch('')
      setActiveIndex(0)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('stormlens-open-palette', handleOpenEvent)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('stormlens-open-palette', handleOpenEvent)
    }
  }, [])

  // Auto-focus input when palette opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 25)
    }
  }, [isOpen])

  // 2. Define Command Items
  const items = useMemo<PaletteItem[]>(() => {
    const baseItems: PaletteItem[] = [
      // ── Actions ──
      {
        id: 'start-replay',
        category: 'Actions',
        name: 'Start Replay (db-cascade scenario)',
        shortcut: 'S',
        action: () => {
          const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8788'
          fetch(`${apiBase}/replay/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scenario: 'db-cascade', speed: 1 }),
          }).catch((err) => console.error('[palette] failed to start:', err))
        },
      },
      {
        id: 'stop-replay',
        category: 'Actions',
        name: 'Stop Active Replay',
        shortcut: 'X',
        action: () => {
          const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8788'
          fetch(`${apiBase}/replay/stop`, { method: 'POST' }).catch((err) =>
            console.error('[palette] failed to stop:', err)
          )
        },
      },
      {
        id: 'reset-replay',
        category: 'Actions',
        name: 'Reset Scenario and State',
        shortcut: 'R',
        action: () => {
          const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8788'
          fetch(`${apiBase}/replay/stop`, { method: 'POST' })
            .then(() => {
              streamState.clearAllState()
              setTimeout(() => {
                fetch(`${apiBase}/replay/start`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ scenario: 'db-cascade', speed: 1 }),
                })
              }, 300)
            })
            .catch((err) => console.error('[palette] failed to reset:', err))
        },
      },
      {
        id: 'toggle-view-lens',
        category: 'Actions',
        name: 'Switch to Lens Physics Simulation',
        shortcut: 'V',
        action: () => streamState.setView('lens'),
      },
      {
        id: 'toggle-view-stream',
        category: 'Actions',
        name: 'Switch to Stream Split View',
        shortcut: 'V',
        action: () => streamState.setView('stream'),
      },
      {
        id: 'toggle-presentation',
        category: 'Actions',
        name: 'Toggle Presentation Mode (high contrast)',
        action: () => togglePresentation(),
      },
      {
        id: 'toggle-mute',
        category: 'Actions',
        name: 'Mute / Unmute Ambience Hum',
        shortcut: 'M',
        action: () => audioManager.toggleMute(),
      },
      {
        id: 'replay-intro',
        category: 'Actions',
        name: 'Replay Cinematic Intro',
        action: () => {
          try {
            sessionStorage.removeItem('intro_seen')
          } catch {}
          streamState.setShowIntro(true)
        },
      },

      // ── Navigation ──
      {
        id: 'nav-war-room',
        category: 'Navigation',
        name: 'Navigate: Go to War Room Dashboard',
        shortcut: 'W',
        action: () => navigate('/'),
      },
      {
        id: 'nav-eval',
        category: 'Navigation',
        name: 'Navigate: Go to Metrics Evaluation',
        shortcut: 'E',
        action: () => navigate('/eval'),
      },
      {
        id: 'nav-diagnostics',
        category: 'Navigation',
        name: 'Navigate: Go to System Diagnostics Checklist',
        action: () => navigate('/health'),
      },
      {
        id: 'nav-debug',
        category: 'Navigation',
        name: 'Navigate: Go to Live WS debugger state',
        action: () => navigate('/debug'),
      },
      {
        id: 'nav-style-guide',
        category: 'Navigation',
        name: 'Navigate: Go to Visual Style Guide tokens',
        action: () => navigate('/tokens'),
      },
    ]

    // ── Dynamic Incidents ──
    const activeIncs = [...streamState.incidents.values()].filter((i) => i.status === 'active')
    activeIncs.forEach((inc) => {
      baseItems.push({
        id: `incident-${inc.id}`,
        category: 'Incidents',
        name: `Open Incident: ${inc.title}`,
        action: () => {
          window.dispatchEvent(new CustomEvent('stormlens-open-incident', { detail: inc.id }))
          if (location.pathname !== '/') {
            navigate('/')
          }
        },
      })
    })

    // ── Dynamic Services ──
    const services = [
      'postgres-primary',
      'payment-service',
      'auth-service',
      'gateway-service',
      'api-service',
      'worker-service',
      'redis-cache',
      'elasticsearch',
    ]
    services.forEach((svc) => {
      baseItems.push({
        id: `service-${svc}`,
        category: 'Services',
        name: `Inspect Service: ${svc}`,
        action: () => {
          // Find incident affecting this service
          const match = activeIncs.find((inc) => inc.services.includes(svc))
          if (match) {
            window.dispatchEvent(new CustomEvent('stormlens-open-incident', { detail: match.id }))
            if (location.pathname !== '/') {
              navigate('/')
            }
          } else {
            window.dispatchEvent(
              new CustomEvent('stormlens-toast', {
                detail: `Service "${svc}" is currently healthy. No active incident.`,
              })
            )
          }
        },
      })
    })

    return baseItems
  }, [streamState, navigate, location.pathname, togglePresentation])

  // 3. Fuzzy filtering (Lowercase substring matching)
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return items
    return items.filter((item) => item.name.toLowerCase().includes(query))
  }, [items, search])

  // Reset index when search changes
  useEffect(() => {
    setActiveIndex(0)
  }, [search])

  // 4. Keyboard Navigation inside list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = filteredItems[activeIndex]
      if (selected) {
        selected.action()
        setIsOpen(false)
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    const activeEl = listRef.current?.children[activeIndex] as HTMLElement
    if (activeEl && listRef.current) {
      const list = listRef.current
      const top = activeEl.offsetTop
      const bottom = top + activeEl.clientHeight
      const viewTop = list.scrollTop
      const viewBottom = viewTop + list.clientHeight

      if (top < viewTop) {
        list.scrollTop = top
      } else if (bottom > viewBottom) {
        list.scrollTop = bottom - list.clientHeight
      }
    }
  }, [activeIndex])

  if (!isOpen) return null

  return (
    <div
      onClick={() => setIsOpen(false)}
      className="fixed inset-0 bg-bg-base/70 backdrop-blur-md z-[90] flex items-start justify-center pt-[15vh] select-none font-sans"
    >
      {/* Centered dialog (Width: 560px) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] bg-bg-surface border border-border/80 rounded-lg shadow-elevated overflow-hidden flex flex-col z-[100] relative max-h-[380px]"
        onKeyDown={handleKeyDown}
      >
        <CornerBrackets />

        {/* Input area */}
        <div className="relative border-b border-border/40 px-4 py-3.5 flex items-center gap-3">
          {/* Tick prefix */}
          <span className="text-accent font-mono text-[13px] font-bold select-none">▎</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search active incidents / services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-text-primary text-[13px] outline-none font-sans placeholder-text-muted"
          />
        </div>

        {/* List items */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto py-1.5 flex flex-col min-h-0 bg-bg-surface"
        >
          {filteredItems.length === 0 ? (
            <div className="px-4 py-6 text-center text-text-muted font-mono text-[11px]">
              No matching commands or resources found.
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isActive = idx === activeIndex
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    item.action()
                    setIsOpen(false)
                  }}
                  className={clsx(
                    "w-full text-left px-4 py-2 flex items-center justify-between text-ui-sm font-sans transition-all duration-120 ease-lens",
                    isActive
                      ? "bg-bg-hover text-text-primary pl-5"
                      : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {/* Reticle tick prefix */}
                    <span className={clsx(
                      "font-mono text-[10px] select-none",
                      isActive ? "text-accent" : "text-text-muted/40"
                    )}>
                      {isActive ? '●' : '○'}
                    </span>
                    <span className="truncate">{item.name}</span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[9px] px-1.5 py-0.2 rounded border border-border text-text-muted font-mono uppercase bg-bg-base/40">
                      {item.category}
                    </span>
                    {item.shortcut && (
                      <kbd className="text-[9px] font-mono font-bold bg-bg-base border border-border text-text-muted px-1.5 py-0.2 rounded">
                        {item.shortcut}
                      </kbd>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
