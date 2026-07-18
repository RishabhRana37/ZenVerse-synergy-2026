/**
 * CommandPalette.tsx — fuzzy search commands, navigation, and live incidents.
 * Hand-built with framer-motion + zustand reads.
 * Opened with Cmd+K / Ctrl+K via hook.
 */
import { useEffect, useState, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { useStreamStore } from '@/store/stream'
import { usePresentationMode } from '@/lib/presentationMode'
import { audioManager } from '@/lib/audio'
import { startReplay, stopReplay, resetReplay } from '@/lib/actions'
import { CornerBrackets } from '@/components/ui/CornerBrackets'
import { useFPSStore } from '@/lib/motion'
import { clsx } from 'clsx'

interface PaletteItem {
  id: string
  category: 'Actions' | 'Navigation' | 'Incidents'
  name: string
  shortcut?: string
  action: () => void
  severity?: 'critical' | 'warning' | 'info'
  alertCount?: number
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const navigate = useNavigate()
  const location = useLocation()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  const incidentsMap = useStreamStore((s) => s.scrubMode && s.scrubState ? s.scrubState.incidents : s.incidents)
  const alerts = useStreamStore((s) => s.scrubMode && s.scrubState ? s.scrubState.alerts : s.alerts)
  const streamState = useStreamStore()
  const { toggle: togglePresentation } = usePresentationMode()

  const fpsReduced = useFPSStore((s) => s.reducedMotion)
  const reducedMotion = (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || fpsReduced

  // Listen for open/close event from the keyboard shortcuts hook
  useEffect(() => {
    const handleOpenEvent = () => {
      setIsOpen((prev) => !prev)
      setSearch('')
      setActiveIndex(0)
    }
    window.addEventListener('stormlens-open-palette', handleOpenEvent)
    return () => window.removeEventListener('stormlens-open-palette', handleOpenEvent)
  }, [])

  // Auto-focus and return focus on close
  useEffect(() => {
    if (isOpen) {
      lastFocusedRef.current = document.activeElement as HTMLElement
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
    } else {
      if (lastFocusedRef.current) {
        lastFocusedRef.current.focus()
      }
    }
  }, [isOpen])

  // Get incident severity
  const getIncidentSeverity = (inc: any) => {
    const myAlerts = alerts.filter(a => a.cluster_id === inc.id)
    if (myAlerts.some(a => a.severity === 'critical')) return 'critical'
    if (myAlerts.some(a => a.severity === 'warning')) return 'warning'
    if (inc.title.toLowerCase().includes('critical') || inc.title.toLowerCase().includes('error') || inc.title.toLowerCase().includes('fail')) return 'critical'
    if (inc.title.toLowerCase().includes('warn')) return 'warning'
    return 'info'
  }

  // Calculate sorted list of incidents exactly like WarRoom.tsx does
  const sortedIncidents = useMemo(() => {
    return [...incidentsMap.values()].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [incidentsMap])

  // Define static & dynamic items
  const items = useMemo<PaletteItem[]>(() => {
    const baseItems: PaletteItem[] = [
      // ── Actions ──
      {
        id: 'action-start',
        category: 'Actions',
        name: 'Start Replay (db-cascade scenario)',
        shortcut: 'S',
        action: () => { startReplay('db-cascade', 1) },
      },
      {
        id: 'action-stop',
        category: 'Actions',
        name: 'Stop Active Replay',
        shortcut: 'X',
        action: () => { stopReplay() },
      },
      {
        id: 'action-reset',
        category: 'Actions',
        name: 'Reset Scenario and State',
        shortcut: 'R',
        action: () => { resetReplay('db-cascade', 1) },
      },
      {
        id: 'action-mute',
        category: 'Actions',
        name: 'Toggle Audio Mute',
        shortcut: 'M',
        action: () => { audioManager.toggleMute() },
      },
      {
        id: 'action-presentation',
        category: 'Actions',
        name: 'Toggle Presentation Mode (high contrast)',
        action: () => { togglePresentation() },
      },
      {
        id: 'action-intro',
        category: 'Actions',
        name: 'Replay Cinematic Intro',
        action: () => {
          try { sessionStorage.removeItem('intro_seen') } catch {}
          streamState.setShowIntro(true)
        },
      },

      // ── Navigation ──
      {
        id: 'nav-war-room',
        category: 'Navigation',
        name: 'Navigate: War Room (Dashboard)',
        shortcut: 'W',
        action: () => navigate('/war-room'),
      },
      {
        id: 'nav-landing',
        category: 'Navigation',
        name: 'Navigate: Marketing Landing Page',
        action: () => navigate('/landing'),
      },
      {
        id: 'nav-eval',
        category: 'Navigation',
        name: 'Navigate: Metrics Evaluation',
        shortcut: 'E',
        action: () => navigate('/eval'),
      },
      {
        id: 'nav-diagnostics',
        category: 'Navigation',
        name: 'Navigate: Diagnostics',
        action: () => navigate('/health'),
      },
      {
        id: 'nav-tokens',
        category: 'Navigation',
        name: 'Navigate: Style Tokens Guide',
        action: () => navigate('/tokens'),
      },
      {
        id: 'nav-debug',
        category: 'Navigation',
        name: 'Navigate: WS Debugger State',
        action: () => navigate('/debug'),
      },
    ]

    // ── Live Incidents ──
    sortedIncidents.forEach((inc) => {
      baseItems.push({
        id: `incident-${inc.id}`,
        category: 'Incidents',
        name: inc.title,
        severity: getIncidentSeverity(inc),
        alertCount: inc.alert_count,
        action: () => {
          const idx = sortedIncidents.findIndex(i => i.id === inc.id)
          if (location.pathname !== '/war-room') {
            navigate('/war-room')
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('stormlens-shortcut-incident', { detail: idx }))
            }, 150)
          } else {
            window.dispatchEvent(new CustomEvent('stormlens-shortcut-incident', { detail: idx }))
          }
        },
      })
    })

    return baseItems
  }, [sortedIncidents, navigate, location.pathname, togglePresentation, alerts])

  // Fuzzy-filter items
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return items
    return items.filter((item) => {
      return (
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
      )
    })
  }, [items, search])

  // Reset index on search change
  useEffect(() => {
    setActiveIndex(0)
  }, [search])

  // Key handlers inside palette
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

  const itemVariants = {
    hidden: { opacity: 0, x: -4 },
    visible: (idx: number) => ({
      opacity: 1,
      x: 0,
      transition: {
        delay: reducedMotion ? 0 : Math.min(0.1, idx * 0.02),
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
          className="fixed inset-0 bg-[#0A0E14]/70 backdrop-blur-md z-[var(--z-modal)] flex items-start justify-center pt-[15vh] select-none font-sans"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.12, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[560px] bg-bg-surface border border-border/80 rounded-lg shadow-elevated overflow-hidden flex flex-col z-[100] relative max-h-[400px]"
            onKeyDown={handleKeyDown}
          >
            <CornerBrackets />

            {/* Search Input */}
            <div className="relative border-b border-border/40 px-4 py-3.5 flex items-center gap-3">
              <svg className="w-4 h-4 text-text-secondary flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                placeholder="Type a command or search incidents…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-text-primary text-[13px] outline-none font-mono placeholder-text-muted"
              />
            </div>

            {/* List */}
            <div
              ref={listRef}
              className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5 min-h-0 bg-bg-surface"
            >
              {filteredItems.length === 0 ? (
                <div className="px-4 py-6 text-center text-text-muted font-mono text-[11px]">
                  No matching commands or incidents found.
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
                        {item.category === 'Incidents' ? (
                          <span className={clsx(
                            "w-1.5 h-1.5 rounded-full flex-shrink-0",
                            item.severity === 'critical' ? 'bg-[#FF4D4F]' : item.severity === 'warning' ? 'bg-[#F5A623]' : 'bg-[#4D9FFF]'
                          )} />
                        ) : item.category === 'Actions' ? (
                          <svg className="w-3.5 h-3.5 text-accent flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5 text-severity-info flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                          </svg>
                        )}
                        <span className="truncate">{item.name}</span>
                        {item.category === 'Incidents' && item.alertCount !== undefined && (
                          <span className="text-[9px] font-mono text-text-muted">({item.alertCount} alerts)</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0 select-none z-10 relative">
                        <span className="text-[8px] px-1 py-0.2 rounded border border-border text-text-muted font-mono uppercase bg-bg-base/40">
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

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/40 bg-bg-surface select-none text-[10px] font-mono text-text-muted shrink-0 z-20">
              <div className="flex items-center gap-1.5">
                <span>Select with <kbd className="px-1 py-0.5 rounded bg-bg-base border border-border font-bold">↑</kbd> <kbd className="px-1 py-0.5 rounded bg-bg-base border border-border font-bold">↓</kbd></span>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded bg-bg-base border border-border font-bold">↵</kbd>
                  <span>Run</span>
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
