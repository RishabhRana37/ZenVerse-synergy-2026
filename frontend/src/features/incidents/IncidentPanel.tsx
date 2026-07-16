import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { useStreamStore, selectIncidentList } from '@/store/stream'
import { ConfidenceBar } from '@/components/ui/ConfidenceBar'
import { Odometer } from '@/components/ui/Odometer'
import type { Incident } from '@/lib/types'
import { clsx } from 'clsx'

// ── RelativeTime component ───────────────────────────────────────────────

function RelativeTime({ timestamp }: { timestamp: string }) {
  const [text, setText] = useState('')

  useEffect(() => {
    const update = () => {
      const ms = Date.now() - new Date(timestamp).getTime()
      const sec = Math.floor(ms / 1000)
      if (sec < 60) {
        setText('just now')
        return
      }
      const min = Math.floor(sec / 60)
      if (min < 60) {
        setText(`${min}m ago`)
        return
      }
      const hr = Math.floor(min / 60)
      setText(`${hr}h ago`)
    }

    update()
    const timer = setInterval(update, 15000) // update every 15s
    return () => clearInterval(timer)
  }, [timestamp])

  return <span className="text-[11px] text-text-secondary font-mono">{text}</span>
}

// ── TypewriterSummary component ──────────────────────────────────────────

function TypewriterSummary({
  text,
  onComplete,
}: {
  text: string
  onComplete?: () => void
}) {
  const [displayedText, setDisplayedText] = useState('')
  const prevText = useRef(text)

  useEffect(() => {
    // If the text changes after we already typed, update instantly
    if (text !== prevText.current) {
      prevText.current = text
      setDisplayedText(text)
      if (onComplete) onComplete()
      return
    }

    let start: number | null = null
    const duration = 600

    const step = (timestamp: number) => {
      if (!start) start = timestamp
      const elapsed = timestamp - start
      const percentage = Math.min(elapsed / duration, 1)
      const count = Math.floor(percentage * text.length)
      setDisplayedText(text.slice(0, count))

      if (elapsed < duration) {
        window.requestAnimationFrame(step)
      } else {
        setDisplayedText(text)
        if (onComplete) onComplete()
      }
    }

    const frameId = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frameId)
  }, [text, onComplete])

  return <span>{displayedText}</span>
}

// ── IncidentCard component ───────────────────────────────────────────────

const IncidentCard = React.memo(({ incident, onSelect }: { incident: Incident; onSelect?: (id: string) => void }) => {
  const [isPulsing, setIsPulsing] = useState(false)
  const [showFirstAction, setShowFirstAction] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  // Listen to the custom event triggered on particle arrival
  useEffect(() => {
    const handlePulse = () => {
      setIsPulsing(true)
      const timer = setTimeout(() => setIsPulsing(false), 200)
      return () => clearTimeout(timer)
    }

    window.addEventListener(`stormlens-card-pulse-${incident.id}`, handlePulse)
    return () => window.removeEventListener(`stormlens-card-pulse-${incident.id}`, handlePulse)
  }, [incident.id])

  const handleClick = () => {
    console.log('Incident Clicked ID:', incident.id)
    if (onSelect) onSelect(incident.id)
  }

  const topCandidate = incident.root_candidates?.[0]
  const rootService = topCandidate?.service

  // Visible services limit (max 4 + '+N more')
  const visibleServices = incident.services.slice(0, 4)
  const extraServices = incident.services.length - 4

  // Sparkline data mapping
  const sparklineData = (incident.sparkline || []).map((val, idx) => ({ idx, val }))

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={isPulsing ? { opacity: 1, scale: [1, 1.015, 1] } : { opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{
        scale: isPulsing ? { duration: 0.2 } : { duration: 0.35, ease: 'easeOut' },
        opacity: { duration: 0.35, ease: 'easeOut' },
        layout: { type: 'spring', stiffness: 200, damping: 25 },
      }}
      className="w-full text-left"
    >
      <div
        data-incident-id={incident.id}
        onClick={handleClick}
        className={clsx(
          "bg-bg-elevated border border-border rounded-card p-4 transition-colors duration-200 hover:border-border-strong hover:bg-bg-hover flex flex-col relative overflow-hidden select-none animate-border-pulse-entrance",
          incident.status === 'resolved' ? 'opacity-85' : ''
        )}
      >
        {/* Cap inner content at max-width 720px, left-aligned */}
        <div className="w-full max-w-[720px] text-left flex flex-col h-full">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-2 flex-shrink-0">
            <h3 className="text-[13px] font-semibold text-text-primary leading-tight font-sans select-text">
              {incident.title}
            </h3>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span
                className={clsx(
                  "w-1.5 h-1.5 rounded-full",
                  incident.status === 'active' ? "bg-severity-critical animate-pulse-dot" : "bg-accent"
                )}
              />
              <RelativeTime timestamp={incident.created_at} />
            </div>
          </div>

          {/* Root Cause Line & ConfidenceBar */}
          {topCandidate && (
            <div className="flex flex-col gap-1.5 my-1.5 pb-2.5 border-b border-border/40 flex-shrink-0">
              <div className="flex items-baseline gap-1 text-[11px] font-mono text-text-secondary truncate select-text">
                <span className="text-text-muted font-semibold uppercase text-[9px] tracking-wider">Root cause:</span>
                <span className="text-severity-critical font-bold">{topCandidate.service}</span>
                <span className="text-text-muted">·</span>
                <span className="truncate">{topCandidate.template}</span>
              </div>
              <ConfidenceBar
                confidence={topCandidate.confidence}
                height="xs"
                showLabel={true}
                greenThreshold={0.6}
                amberThreshold={0.3}
              />
            </div>
          )}

          {/* Services blast-radius chips */}
          <div className="flex flex-wrap gap-1.5 mb-2.5 flex-shrink-0">
            {visibleServices.map((svc) => {
              const isRoot = svc === rootService
              return (
                <span
                  key={svc}
                  className={clsx(
                    "px-2 py-0.5 rounded text-[10px] font-mono leading-none border transition-all duration-200 select-text",
                    isRoot
                      ? "bg-accent-dim text-accent ring-1 ring-accent border-accent/40 font-semibold"
                      : "bg-bg-base border-border text-text-secondary"
                  )}
                >
                  {svc}
                </span>
              )
            })}
            {extraServices > 0 && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono leading-none bg-bg-base border border-border text-text-muted">
                +{extraServices} more
              </span>
            )}
          </div>

          {/* Summary Zone */}
          <div className="mb-3.5 flex-1 min-h-0">
            {incident.summary ? (
              <div className="text-[12px] text-text-primary leading-[1.5] font-sans select-text">
                <div className={clsx("transition-all duration-200", !isExpanded && "line-clamp-4 overflow-hidden")}>
                  <TypewriterSummary
                    text={incident.summary}
                    onComplete={() => setShowFirstAction(true)}
                  />
                </div>

                {/* Show More/Less Button */}
                {incident.summary.length > 180 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsExpanded(!isExpanded)
                    }}
                    className="text-accent hover:underline text-[10px] font-mono mt-1.5 block select-none"
                  >
                    {isExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}

                {showFirstAction && incident.first_action && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mt-2.5 pt-2 border-t border-border/20 text-accent font-semibold text-[11px] leading-relaxed uppercase tracking-wide select-text flex flex-col gap-0.5"
                  >
                    <span className="text-text-secondary text-[9px] font-bold tracking-wider">FIRST ACTION:</span>
                    <span className="normal-case font-medium">{incident.first_action}</span>
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 py-1">
                <div className="h-3 w-3/4 rounded bg-bg-base animate-pulse relative overflow-hidden">
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer"
                    style={{ backgroundSize: '200% 100%' }}
                  />
                </div>
                <span className="text-[10px] text-text-muted font-mono tracking-wider uppercase animate-pulse select-none">
                  analyzing…
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/30 flex-shrink-0">
            <div className="flex items-baseline gap-1 font-mono text-[11px] text-text-muted">
              <Odometer value={incident.alert_count} className="text-text-secondary font-semibold" />
              <span>alerts</span>
              <span className="text-text-muted mx-0.5">(×{incident.unique_count} unique)</span>
            </div>

            {/* Sparkline chart */}
            {sparklineData.length > 0 && (
              <div className="w-[60px] h-[20px] opacity-75">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparklineData}>
                    <Area
                      type="monotone"
                      dataKey="val"
                      stroke="#2DD4A7"
                      strokeWidth={1.5}
                      fill="transparent"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
})

// ── IncidentPanel component ─────────────────────────────────────────────

interface IncidentPanelProps {
  onIncidentSelect?: (id: string) => void
}

export function IncidentPanel({ onIncidentSelect }: IncidentPanelProps) {
  const incidents = useStreamStore(selectIncidentList)
  const activeCount = useStreamStore((s) => {
    if (s.stats) return s.stats.active_incidents
    return [...s.incidents.values()].filter((i) => i.status === 'active').length
  })

  return (
    <div className="flex flex-col h-full bg-bg-surface rounded-card border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <span className="text-ui font-semibold text-text-primary font-sans">Incidents</span>
        <div className="px-2 py-0.5 rounded bg-bg-elevated border border-border text-stream text-text-secondary font-mono tabular-nums select-none">
          {activeCount} active
        </div>
      </div>

      {/* Body */}
      {incidents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-accent text-ui-sm font-sans font-medium select-none">
          No active incidents
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="flex flex-col gap-3 p-4">
            <AnimatePresence mode="popLayout">
              {incidents.map((inc) => (
                <IncidentCard key={inc.id} incident={inc} onSelect={onIncidentSelect} />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  )
}
