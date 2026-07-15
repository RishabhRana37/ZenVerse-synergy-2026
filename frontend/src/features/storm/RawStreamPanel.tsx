import React, { useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStreamStore } from '@/store/stream'
import { Badge } from '@/components/ui/Badge'
import type { Alert } from '@/lib/types'
import { clsx } from 'clsx'

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

// ── DupBadge component ───────────────────────────────────────────────────

const DupBadge = React.memo(({ count }: { count: number }) => {
  const [pop, setPop] = useState(false)
  const prevCount = useRef(count)

  useEffect(() => {
    if (count > prevCount.current) {
      setPop(true)
      const timer = setTimeout(() => setPop(false), 150)
      prevCount.current = count
      return () => clearTimeout(timer)
    }
    prevCount.current = count
  }, [count])

  return (
    <span
      className={clsx(
        "px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border leading-none transition-all duration-150 inline-block select-none",
        pop
          ? "bg-severity-warning border-severity-warning text-text-inverse scale-110"
          : "bg-bg-elevated border-border text-text-secondary scale-100"
      )}
    >
      ×{count}
    </span>
  )
})

// ── AlertRow component ───────────────────────────────────────────────────

const AlertRow = React.memo(
  ({ alert, style }: { alert: Alert; style?: React.CSSProperties }) => {
    const isNew = Date.now() - new Date(alert.ts).getTime() < 2500
    const flashClass = isNew && alert.severity === 'critical' ? 'animate-flash-critical' : ''
    const claimedClass = alert.cluster_id ? 'opacity-40' : ''

    const sevBorderColor =
      alert.severity === 'critical' ? 'border-l-severity-critical' :
      alert.severity === 'warning'  ? 'border-l-severity-warning' :
      'border-l-severity-info'

    return (
      <div
        data-alert-id={alert.id}
        style={style}
        className={clsx(
          "flex items-center gap-3 px-4 border-l-[3px] border-b border-b-border/40 font-mono text-[12px] h-[44px] select-none",
          sevBorderColor,
          flashClass,
          claimedClass
        )}
      >
        {/* Column 1: HH:MM:SS.mmm */}
        <span className="text-text-muted flex-shrink-0 w-[92px] tabular-nums">
          {formatTimestamp(alert.ts)}
        </span>

        {/* Column 2: Severity Badge */}
        <div className="w-[62px] flex-shrink-0">
          <Badge variant={alert.severity} className="text-[10px] px-1.5 py-0.5">
            {alert.severity}
          </Badge>
        </div>

        {/* Column 3: Service · Host */}
        <span className="text-text-secondary flex-shrink-0 truncate max-w-[140px]">
          {alert.service || '—'} <span className="text-text-muted">·</span> {alert.host || '—'}
        </span>

        {/* Column 4: Message */}
        <span className="text-text-primary flex-1 truncate pr-2 text-left">
          {alert.message}
        </span>

        {/* Right edge: Dup count */}
        {alert.dup_count > 1 && (
          <div className="flex-shrink-0">
            <DupBadge count={alert.dup_count} />
          </div>
        )}
      </div>
    )
  },
  (prev, next) => {
    return (
      prev.alert.id === next.alert.id &&
      prev.alert.dup_count === next.alert.dup_count &&
      prev.alert.cluster_id === next.alert.cluster_id &&
      prev.style?.transform === next.style?.transform
    )
  }
)

// ── RawStreamPanel component ─────────────────────────────────────────────

export function RawStreamPanel() {
  const alerts = useStreamStore((s) => s.alerts)
  const alertsPerSec = useStreamStore((s) => s.stats?.alerts_per_sec)

  const parentRef = useRef<HTMLDivElement>(null)

  const [isPinned, setIsPinned] = useState(true)
  const [newAlertsCount, setNewAlertsCount] = useState(0)
  const pinnedAlertIdRef = useRef<string | null>(null)

  // Virtualizer setup
  const rowVirtualizer = useVirtualizer({
    count: alerts.length,
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
        if (alerts.length > 0) {
          pinnedAlertIdRef.current = alerts[0].id
        }
      }
    } else {
      if (isPinned) {
        setIsPinned(false)
        if (alerts.length > 0) {
          pinnedAlertIdRef.current = alerts[0].id
        }
      }
    }
  }

  // Pin behavior / new alert accumulation
  useEffect(() => {
    if (alerts.length > 0) {
      if (isPinned) {
        if (parentRef.current) {
          parentRef.current.scrollTop = 0
        }
        setNewAlertsCount(0)
        pinnedAlertIdRef.current = alerts[0].id
      } else {
        const pinnedId = pinnedAlertIdRef.current
        if (pinnedId) {
          const idx = alerts.findIndex((a) => a.id === pinnedId)
          if (idx !== -1) {
            setNewAlertsCount(idx)
          } else {
            // Pinned alert fell out of the ring buffer
            setNewAlertsCount(alerts.length)
          }
        }
      }
    } else {
      pinnedAlertIdRef.current = null
      setNewAlertsCount(0)
    }
  }, [alerts, isPinned])

  // Jump to top handler
  const handleJumpToTop = () => {
    setIsPinned(true)
    setNewAlertsCount(0)
    if (parentRef.current) {
      parentRef.current.scrollTop = 0
    }
    if (alerts.length > 0) {
      pinnedAlertIdRef.current = alerts[0].id
    }
  }

  return (
    <div className="flex flex-col h-full bg-bg-surface rounded-card border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-ui font-semibold text-text-primary font-sans">Raw Stream</span>
          {alerts.length > 0 && (
            <span className="text-[11px] text-text-muted font-mono tabular-nums">
              ({alerts.length} buffered)
            </span>
          )}
        </div>
        <div className="px-2 py-0.5 rounded bg-bg-elevated border border-border text-stream text-text-secondary font-mono tabular-nums">
          {alertsPerSec !== undefined ? `${alertsPerSec.toFixed(1)}/s` : '—/s'}
        </div>
      </div>

      {/* Body */}
      {alerts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-muted text-ui-sm font-sans select-none">
          awaiting alerts
        </div>
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
                const alert = alerts[virtualItem.index]
                if (!alert) return null
                return (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
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
