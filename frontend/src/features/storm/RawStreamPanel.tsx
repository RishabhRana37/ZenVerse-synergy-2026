import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStreamStore } from '@/store/stream'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { Alert } from '@/lib/types'
import { clsx } from 'clsx'
import { Odometer } from '@/components/ui/Odometer'
import { motion } from 'framer-motion'
import { useFPSStore } from '@/lib/motion'

// ── Helpers ───────────────────────────────────────────────────────────────

function formatTimestamp(tsString: string): string {
  try {
    const d = new Date(tsString)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    const mss = String(d.getMilliseconds()).padStart(3, '0')
    return `${hh}:${mm}:${ss}.${mss}`
  } catch {
    return '00:00:00.000'
  }
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  try {
    const escaped = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-accent/30 text-accent font-semibold px-0.5 rounded-sm select-all">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    )
  } catch {
    return text
  }
}

// ── DupBadge component ───────────────────────────────────────────────────

const DupBadge = React.memo(({ count }: { count: number }) => {
  const textRef = useRef<HTMLSpanElement>(null)
  const badgeRef = useRef<HTMLSpanElement>(null)
  const currentCount = useRef(count)
  const targetCount = useRef(count)
  const animationFrameId = useRef<number | null>(null)

  useEffect(() => {
    targetCount.current = count
    
    const animate = () => {
      if (currentCount.current < targetCount.current) {
        if (badgeRef.current) {
          badgeRef.current.classList.add('scale-105', 'bg-severity-warning', 'border-severity-warning', 'text-[#0A0E14]')
          badgeRef.current.classList.remove('scale-100', 'bg-bg-elevated', 'border-border', 'text-text-secondary')
        }

        // Increment count smoothly
        currentCount.current = Math.min(
          currentCount.current + Math.ceil((targetCount.current - currentCount.current) * 0.15),
          targetCount.current
        )

        if (textRef.current) {
          textRef.current.textContent = `×${currentCount.current}`
        }

        setTimeout(() => {
          if (badgeRef.current) {
            badgeRef.current.classList.add('scale-100', 'bg-bg-elevated', 'border-border', 'text-text-secondary')
            badgeRef.current.classList.remove('scale-105', 'bg-severity-warning', 'border-severity-warning', 'text-[#0A0E14]')
          }
        }, 150)

        animationFrameId.current = requestAnimationFrame(animate)
      } else {
        animationFrameId.current = null
      }
    }

    if (animationFrameId.current === null) {
      animationFrameId.current = requestAnimationFrame(animate)
    }

    return () => {
      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current)
      }
    }
  }, [count])

  return (
    <span
      ref={badgeRef}
      className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border leading-none transition-all duration-150 inline-block select-none bg-bg-elevated border-border text-text-secondary scale-100"
    >
      <span ref={textRef}>×{count}</span>
    </span>
  )
})

// ── AlertRow component ───────────────────────────────────────────────────

interface AlertRowProps {
  alert: Alert
  searchQuery: string
  isFirehose: boolean
  reducedMotion: boolean
  index: number
  style?: React.CSSProperties
}

const AlertRow = React.memo(
  ({ alert, searchQuery, isFirehose, reducedMotion, index, style }: AlertRowProps) => {
    const isNew = Date.now() - new Date(alert.ts).getTime() < 2500
    const flashClass = isNew && alert.severity === 'critical' ? 'animate-flash-critical' : ''
    const claimedClass = alert.cluster_id ? 'opacity-40' : ''

    const sevBorderColor =
      alert.severity === 'critical' ? 'border-l-severity-critical' :
      alert.severity === 'warning'  ? 'border-l-severity-warning' :
      'border-l-severity-info'

    // Bypass entrance animations entirely under high replay rate / reduced motion
    if (reducedMotion || isFirehose) {
      return (
        <div
          data-alert-id={alert.id}
          style={{
            ...style,
            boxShadow: alert.severity === 'critical' ? 'inset 0 0 0 1px rgba(255, 77, 79, 0.15)' : undefined,
          }}
          className={clsx(
            "flex items-center gap-3 px-4 border-l-2 border-b border-b-border/30 font-mono text-[12px] h-[44px] select-none hover:bg-bg-hover transition-colors duration-100",
            sevBorderColor,
            flashClass,
            claimedClass,
            isFirehose && "blur-[0.5px] opacity-80"
          )}
        >
          <span className="text-text-muted flex-shrink-0 w-[92px] tabular-nums">
            {formatTimestamp(alert.ts)}
          </span>
          <div className="w-[62px] flex-shrink-0">
            <Badge variant={alert.severity} className="text-[10px] px-1.5 py-0.5">
              {alert.severity}
            </Badge>
          </div>
          <span className="text-text-secondary flex-shrink-0 truncate max-w-[140px]">
            {highlightMatch(alert.service || '—', searchQuery)}{' '}
            <span className="text-text-muted">·</span>{' '}
            {highlightMatch(alert.host || '—', searchQuery)}
          </span>
          <span className="text-text-primary flex-1 truncate pr-2 text-left">
            {highlightMatch(alert.message, searchQuery)}
          </span>
          {alert.dup_count > 1 && (
            <div className="flex-shrink-0">
              <DupBadge count={alert.dup_count} />
            </div>
          )}
        </div>
      )
    }

    const staggerDelay = (index % 10) * 0.03

    return (
      <motion.div
        data-alert-id={alert.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          type: 'spring',
          stiffness: 260,
          damping: 26,
          delay: staggerDelay,
        }}
        style={{
          ...style,
          boxShadow: alert.severity === 'critical' ? 'inset 0 0 0 1px rgba(255, 77, 79, 0.15)' : undefined,
        }}
        className={clsx(
          "flex items-center gap-3 px-4 border-l-2 border-b border-b-border/30 font-mono text-[12px] h-[44px] select-none hover:bg-bg-hover transition-colors duration-100",
          sevBorderColor,
          flashClass,
          claimedClass
        )}
      >
        <span className="text-text-muted flex-shrink-0 w-[92px] tabular-nums">
          {formatTimestamp(alert.ts)}
        </span>
        <div className="w-[62px] flex-shrink-0">
          <Badge variant={alert.severity} className="text-[10px] px-1.5 py-0.5">
            {alert.severity}
          </Badge>
        </div>
        <span className="text-text-secondary flex-shrink-0 truncate max-w-[140px]">
          {highlightMatch(alert.service || '—', searchQuery)}{' '}
          <span className="text-text-muted">·</span>{' '}
          {highlightMatch(alert.host || '—', searchQuery)}
        </span>
        <span className="text-text-primary flex-1 truncate pr-2 text-left">
          {highlightMatch(alert.message, searchQuery)}
        </span>
        {alert.dup_count > 1 && (
          <div className="flex-shrink-0">
            <DupBadge count={alert.dup_count} />
          </div>
        )}
      </motion.div>
    )
  },
  (prev, next) => {
    return (
      prev.alert.id === next.alert.id &&
      prev.alert.dup_count === next.alert.dup_count &&
      prev.alert.cluster_id === next.alert.cluster_id &&
      prev.searchQuery === next.searchQuery &&
      prev.isFirehose === next.isFirehose &&
      prev.reducedMotion === next.reducedMotion &&
      prev.style?.transform === next.style?.transform
    )
  }
)

// ── RawStreamPanel component ─────────────────────────────────────────────

export function RawStreamPanel() {
  const alerts = useStreamStore((s) => s.scrubMode && s.scrubState ? s.scrubState.alerts : s.alerts)
  const alertsPerSec = useStreamStore((s) => s.scrubMode && s.scrubState ? s.scrubState.stats?.alerts_per_sec : s.stats?.alerts_per_sec)

  const replaySpeed = useStreamStore((s) => s.stats?.replay?.speed ?? 1)
  const isFirehose = replaySpeed > 50
  const fpsReduced = useFPSStore((s) => s.reducedMotion)
  const reducedMotion = (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || fpsReduced

  // Filters State
  const [critEnabled, setCritEnabled] = useState(true)
  const [warnEnabled, setWarnEnabled] = useState(true)
  const [infoEnabled, setInfoEnabled] = useState(true)
  const [showClaimed, setShowClaimed] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // Debounce search input by 150ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 150)
    return () => clearTimeout(handler)
  }, [searchQuery])

  // Count severities in buffer
  const critCount = alerts.filter((a) => a.severity === 'critical').length
  const warnCount = alerts.filter((a) => a.severity === 'warning').length
  const infoCount = alerts.filter((a) => a.severity === 'info').length

  // Filter visible stream alerts. Memoized: an inline .filter() here would
  // return a new array reference every render, and the pin/scroll effect
  // below depends on this array — so it would re-fire (and re-run
  // setNewAlertsCount) on every render of this component, not just when the
  // alerts or filters actually changed.
  const filteredAlerts = useMemo(
    () =>
      alerts.filter((a) => {
        if (a.severity === 'critical' && !critEnabled) return false
        if (a.severity === 'warning' && !warnEnabled) return false
        if (a.severity === 'info' && !infoEnabled) return false
        if (!showClaimed && a.cluster_id !== null) return false

        if (debouncedQuery.trim()) {
          const q = debouncedQuery.toLowerCase()
          const service = (a.service || '').toLowerCase()
          const host = (a.host || '').toLowerCase()
          const message = (a.message || '').toLowerCase()
          if (!service.includes(q) && !host.includes(q) && !message.includes(q)) {
            return false
          }
        }
        return true
      }),
    [alerts, critEnabled, warnEnabled, infoEnabled, showClaimed, debouncedQuery],
  )

  const parentRef = useRef<HTMLDivElement>(null)

  const [isPinned, setIsPinned] = useState(true)
  const [newAlertsCount, setNewAlertsCount] = useState(0)
  const pinnedAlertIdRef = useRef<string | null>(null)

  // Virtualizer setup
  const rowVirtualizer = useVirtualizer({
    count: filteredAlerts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
  })

  // Handle user scrolling
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const scrollTop = target.scrollTop

    // If we're within 5px of the top, we pin
    if (scrollTop <= 5) {
      if (!isPinned) {
        setIsPinned(true)
        setNewAlertsCount(0)
        if (filteredAlerts.length > 0) {
          pinnedAlertIdRef.current = filteredAlerts[0].id
        }
      }
    } else {
      if (isPinned) {
        setIsPinned(false)
        if (filteredAlerts.length > 0) {
          pinnedAlertIdRef.current = filteredAlerts[0].id
        }
      }
    }
  }

  // Pin behavior / new alert accumulation
  useEffect(() => {
    if (filteredAlerts.length > 0) {
      if (isPinned) {
        if (parentRef.current) {
          parentRef.current.scrollTop = 0
        }
        setNewAlertsCount(0)
        pinnedAlertIdRef.current = filteredAlerts[0].id
      } else {
        const pinnedId = pinnedAlertIdRef.current
        if (pinnedId) {
          const idx = filteredAlerts.findIndex((a) => a.id === pinnedId)
          if (idx !== -1) {
            setNewAlertsCount(idx)
          } else {
            // Pinned alert fell out of the ring buffer
            setNewAlertsCount(filteredAlerts.length)
          }
        }
      }
    } else {
      pinnedAlertIdRef.current = null
      setNewAlertsCount(0)
    }
  }, [filteredAlerts, isPinned])

  // Jump to top handler
  const handleJumpToTop = () => {
    setIsPinned(true)
    setNewAlertsCount(0)
    if (parentRef.current) {
      parentRef.current.scrollTop = 0
    }
    if (filteredAlerts.length > 0) {
      pinnedAlertIdRef.current = filteredAlerts[0].id
    }
  }

  const totalAlerts = useStreamStore((s) => (s.scrubMode && s.scrubState ? s.scrubState.stats?.total_alerts : s.stats?.total_alerts) ?? 0)
  const incidentCount = useStreamStore((s) => s.scrubMode && s.scrubState ? s.scrubState.incidents.size : s.incidents.size)

  const isFilterActive =
    !critEnabled || !warnEnabled || !infoEnabled || !showClaimed || searchQuery.trim() !== ''

  const handleClearFilters = () => {
    setCritEnabled(true)
    setWarnEnabled(true)
    setInfoEnabled(true)
    setShowClaimed(true)
    setSearchQuery('')
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-bold tracking-wider uppercase text-text-muted">
            <span className="text-accent mr-1">▎01</span> Raw Stream
          </span>
          {alerts.length > 0 && (
            <span className="text-[11px] text-text-muted font-mono inline-flex items-baseline gap-1 select-none">
              (<Odometer value={alerts.length} easing="spring" className="text-text-muted" /> buffered)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isFirehose && (
            <span className="px-1.5 py-0.5 rounded bg-severity-warning/20 border border-severity-warning/30 text-severity-warning text-[10px] font-mono font-bold animate-pulse">
              🔥 FIREHOSE ({replaySpeed}x)
            </span>
          )}
          <div className="px-2 py-0.5 rounded bg-bg-elevated border border-border text-stream text-text-secondary font-mono">
            {alertsPerSec !== undefined ? (
              <>
                <Odometer value={alertsPerSec} format="float1" easing="linear" className="text-text-secondary" />
                <span>/s</span>
              </>
            ) : (
              '—/s'
            )}
          </div>
        </div>
      </div>

      {/* 36px Sub-Header Toolbar */}
      <div
        className={clsx(
          "flex items-center justify-between px-3 py-1 bg-bg-surface/50 border-b transition-colors duration-150 h-[36px] shrink-0 gap-2 select-none",
          isFilterActive ? "border-b-accent/50" : "border-b-border/40"
        )}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Severity filter chips */}
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              onClick={() => setCritEnabled(!critEnabled)}
              className={clsx(
                "px-2 py-0.5 h-6 text-[10px] font-bold font-sans",
                critEnabled
                  ? "bg-severity-critical/15 border-severity-critical/30 text-severity-critical hover:bg-severity-critical/20"
                  : "bg-transparent border-border/40 text-text-muted hover:border-border"
              )}
            >
              CRIT <span className="font-mono font-medium opacity-80">(<Odometer value={critCount} easing="spring" className="text-severity-critical" />)</span>
            </Button>
            <Button
              size="sm"
              onClick={() => setWarnEnabled(!warnEnabled)}
              className={clsx(
                "px-2 py-0.5 h-6 text-[10px] font-bold font-sans",
                warnEnabled
                  ? "bg-severity-warning/15 border-severity-warning/30 text-severity-warning hover:bg-severity-warning/20"
                  : "bg-transparent border-border/40 text-text-muted hover:border-border"
              )}
            >
              WARN <span className="font-mono font-medium opacity-80">(<Odometer value={warnCount} easing="spring" className="text-severity-warning" />)</span>
            </Button>
            <Button
              size="sm"
              onClick={() => setInfoEnabled(!infoEnabled)}
              className={clsx(
                "px-2 py-0.5 h-6 text-[10px] font-bold font-sans",
                infoEnabled
                  ? "bg-severity-info/15 border-severity-info/30 text-severity-info hover:bg-severity-info/20"
                  : "bg-transparent border-border/40 text-text-muted hover:border-border"
              )}
            >
              INFO <span className="font-mono font-medium opacity-80">(<Odometer value={infoCount} easing="spring" className="text-severity-info" />)</span>
            </Button>
          </div>

          <div className="h-4 w-px bg-border/40 shrink-0" />

          {/* Search input */}
          <div className="relative flex-1 min-w-0 max-w-[200px]">
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="filter stream..."
              className="h-6 py-0 px-2.5 text-[11px] font-mono"
            />
          </div>

          <div className="h-4 w-px bg-border/40 shrink-0" />

          {/* Claimed eye toggle */}
          <Button
            size="sm"
            variant={showClaimed ? "secondary" : "accent"}
            onClick={() => setShowClaimed(!showClaimed)}
            title={showClaimed ? "Hide claimed alerts" : "Show claimed alerts"}
            aria-label={showClaimed ? "Hide claimed alerts" : "Show claimed alerts"}
            className="h-6 w-6 p-0 flex items-center justify-center shrink-0"
          >
            {showClaimed ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            )}
          </Button>
        </div>

        {/* Info tally and Clear button */}
        {isFilterActive && (
          <div className="flex items-center gap-1.5 shrink-0 select-none">
            <span className="text-[10px] font-mono text-text-muted tabular-nums">
              {filteredAlerts.length} of {alerts.length} shown
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleClearFilters}
              title="Clear all filters"
              aria-label="Clear all filters"
              className="h-6 w-6 p-0 flex items-center justify-center"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
        )}
      </div>

      {/* Body */}
      {filteredAlerts.length === 0 ? (
        alerts.length > 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-text-muted text-ui-sm font-sans select-none px-6 text-center">
            No matching alerts found in buffer
          </div>
        ) : totalAlerts > 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-text-secondary text-ui-sm font-sans gap-2 select-none px-6 text-center">
            <div className="flex items-center gap-1.5 text-accent font-semibold">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Storm subsided
            </div>
            <div className="text-text-muted text-[11px] font-mono">
              {totalAlerts} alerts processed → {incidentCount} incident{incidentCount === 1 ? '' : 's'}
            </div>
          </div>
        ) : (
          // ── Idle / Ready state ─────────────────────────────────────────
          <div className="flex-1 flex flex-col">
            <div className="flex flex-col gap-px p-2">
              {/* Ghost shimmer rows — signals "ready, waiting for data" */}
              {[80, 55, 70, 45, 60, 50, 75].map((w, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 border-b border-border-subtle">
                  <div className={`w-1 h-3 rounded-full bg-text-muted/20 flex-shrink-0 animate-shimmer`} style={{ animationDelay: `${i * 150}ms` }} />
                  <div className={`h-2 rounded bg-text-muted/15 animate-shimmer flex-shrink-0`} style={{ width: `${w}px`, animationDelay: `${i * 120}ms` }} />
                  <div className={`h-2 rounded bg-text-muted/10 animate-shimmer flex-1`} style={{ animationDelay: `${i * 100}ms` }} />
                </div>
              ))}
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-center">
                <svg className="w-5 h-5 text-text-muted/50" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
                <span className="text-[11px] text-text-muted font-mono">
                  Ready — start the Demo Driver to begin
                </span>
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="flex-1 min-h-0 relative">
          <div
            ref={parentRef}
            onScroll={handleScroll}
            className="w-full h-full overflow-y-auto"
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const alert = filteredAlerts[virtualItem.index]
                if (!alert) return null
                return (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    searchQuery={debouncedQuery}
                    isFirehose={isFirehose}
                    reducedMotion={reducedMotion}
                    index={virtualItem.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  />
                )
              })}
            </div>
          </div>

          {/* Floating Pill */}
          {newAlertsCount > 0 && (
            <button
              onClick={handleJumpToTop}
              className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-accent text-text-inverse font-mono text-[11px] font-semibold tracking-wide shadow-elevated border border-accent hover:opacity-90 transition-opacity flex items-center gap-1"
            >
              ↑ {newAlertsCount} new alerts
            </button>
          )}
        </div>
      )}
    </div>
  )
}

