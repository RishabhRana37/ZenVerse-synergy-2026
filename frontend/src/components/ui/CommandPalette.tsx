import { useEffect, useState, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { useStreamStore } from '@/store/stream'
import { usePresentationMode } from '@/lib/presentationMode'
import { audioManager } from '@/lib/audio'
import { CornerBrackets } from '@/components/ui/CornerBrackets'
import { clsx } from 'clsx'
import { useFPSStore } from '@/lib/motion'

interface PaletteItem {
  id: string
  category: 'Actions' | 'Navigation' | 'Incidents' | 'Services'
  name: string
  shortcut?: string
  action: () => void
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'Actions':
      return (
        <svg className="w-3.5 h-3.5 text-accent flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      )
    case 'Navigation':
      return (
        <svg className="w-3.5 h-3.5 text-severity-info flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
      )
    case 'Incidents':
      return (
        <svg className="w-3.5 h-3.5 text-severity-critical flex-shrink-0 animate-pulse" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      )
    case 'Services':
      return (
        <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a3 3 0 013-3m0 0V5.25A2.25 2.25 0 017.5 3h9a2.25 2.25 0 012.25 2.25V7.5" />
        </svg>
      )
    default:
      return null
  }
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

  const fpsReduced = useFPSStore((s) => s.reducedMotion)
  const reducedMotion = (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || fpsReduced

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
          const apiBase = import.meta.env.VITE_API_URL || '/api'
          fetch(`${apiBase}/replay/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataset: 'db-cascade', scenario: 'db-cascade', speed: 1 }),
          }).catch((err) => console.error('[palette] failed to start:', err))
        },
      },
      {
        id: 'stop-replay',
        category: 'Actions',
        name: 'Stop Active Replay',
        shortcut: 'X',
        action: () => {
          const apiBase = import.meta.env.VITE_API_URL || '/api'
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
          const apiBase = import.meta.env.VITE_API_URL || '/api'
          fetch(`${apiBase}/replay/stop`, { method: 'POST' })
            .then(() => {
              streamState.clearAllState()
              setTimeout(() => {
                fetch(`${apiBase}/replay/start`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ dataset: 'db-cascade', scenario: 'db-cascade', speed: 1 }),
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
        name: 'Navigate: War Room (Dashboard)',
        shortcut: 'W',
        action: () => navigate('/'),
      },
      {
        id: 'nav-diagnostics',
        category: 'Navigation',
        name: 'Navigate: Store (System Diagnostics Checklist)',
        action: () => navigate('/health'),
      },
      {
        id: 'nav-eval',
        category: 'Navigation',
        name: 'Navigate: Pro (Metrics Evaluation)',
        shortcut: 'E',
        action: () => navigate('/eval'),
      },
      {
        id: 'nav-debug',
        category: 'Navigation',
        name: 'Navigate: AI (Live WS Debugger State)',
        action: () => navigate('/debug'),
      },
      {
        id: 'nav-style-guide',
        category: 'Navigation',
        name: 'Navigate: Style Primitives (Visual Tokens Style Guide)',
        action: () => navigate('/tokens'),
      },
      {
        id: 'nav-github',
        category: 'Navigation',
        name: 'Open: GitHub Repository',
        action: () => window.open('https://github.com/RishabhRana37/ZenVerse-synergy-2026', '_blank'),
      },
      {
        id: 'nav-docs',
        category: 'Navigation',
        name: 'Open: Documentation (Docs)',
        action: () => window.open('#docs', '_self'),
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

  // 3. Fuzzy filtering
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
  }

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

  // Item staggered variants config
  const itemVariants = {
    hidden: { opacity: 0, x: -4 },
    visible: (idx: number) => ({
      opacity: 1,
      x: 0,
      transition: {
        delay: reducedMotion ? 0 : Math.min(0.12, idx * 0.015),
        duration: 0.12,
        ease: 'easeOut',
      },
    }),
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-[#0A0E14]/80 z-[90] flex items-start justify-center pt-[15vh] select-none font-sans"
        >
          {/* Centered dialog (Width: 560px, Fast scale popup) */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.08, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[560px] bg-bg-surface border border-border/80 rounded-lg shadow-elevated overflow-hidden flex flex-col z-[100] relative max-h-[400px]"
            onKeyDown={handleKeyDown}
          >
            <CornerBrackets />

            {/* Input area */}
            <div className="relative border-b border-border/40 px-4 py-3.5 flex items-center gap-3">
              <svg className="w-4 h-4 text-text-secondary flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                placeholder="Search for commands, incidents, and services..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-text-primary text-[13px] outline-none font-sans placeholder-text-muted"
              />
            </div>

            {/* List items */}
            <div
              ref={listRef}
              className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5 min-h-0 bg-bg-surface"
            >
              {filteredItems.length === 0 ? (
                <div className="px-4 py-6 text-center text-text-muted font-mono text-[11px]">
                  No matching commands or resources found.
                </div>
              ) : (
                filteredItems.map((item, idx) => {
                  const isActive = idx === activeIndex
                  return (
                    <motion.button
                      key={item.id}
                      custom={idx}
                      variants={itemVariants}
                      initial="hidden"
                      animate="visible"
                      onClick={() => {
                        item.action()
                        setIsOpen(false)
                      }}
                      className={clsx(
                        "w-full text-left px-3 py-2 flex items-center justify-between text-ui-sm font-sans rounded-md select-none relative h-8 overflow-hidden",
                        isActive ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
                      )}
                    >
                      {/* Selection Glide background */}
                      {isActive && (
                        <motion.div
                          layoutId="palette-selection-highlight"
                          transition={
                            reducedMotion
                              ? { duration: 0 }
                              : { type: 'spring', stiffness: 420, damping: 33 }
                          }
                          className="absolute inset-0 bg-bg-hover z-0"
                        />
                      )}

                      <div className="flex items-center gap-2.5 min-w-0 z-10 relative">
                        {getCategoryIcon(item.category)}
                        <span className="truncate">{item.name}</span>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0 select-none z-10 relative">
                        <span className="text-[9px] px-1.5 py-0.2 rounded border border-border text-text-muted font-mono uppercase bg-bg-base/40">
                          {item.category}
                        </span>
                        {item.shortcut && (
                          <kbd className="text-[9px] font-mono font-bold bg-bg-base border border-border text-text-muted px-1.5 py-0.2 rounded">
                            {item.shortcut}
                          </kbd>
                        )}
                      </div>
                    </motion.button>
                  )
                })
              )}
            </div>

            {/* Raycast-style Action Bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/40 bg-bg-surface select-none text-[10px] font-mono text-text-muted shrink-0 z-20">
              <div className="flex items-center gap-1.5">
                <span>Select with <kbd className="px-1.5 py-0.5 rounded bg-bg-base border border-border font-bold">↑</kbd> <kbd className="px-1.5 py-0.5 rounded bg-bg-base border border-border font-bold">↓</kbd></span>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded bg-bg-base border border-border font-bold">↵</kbd>
                  <span>Open Command</span>
                </span>
                <span className="text-border/40">|</span>
                <span className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded bg-bg-base border border-border font-bold">Esc</kbd>
                  <span>Close</span>
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
