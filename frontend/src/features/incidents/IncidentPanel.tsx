import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { useStreamStore, selectIncidentList } from '@/store/stream'
import { ConfidenceBar } from '@/components/ui/ConfidenceBar'
import { Odometer } from '@/components/ui/Odometer'
import type { Incident } from '@/lib/types'
import { clsx } from 'clsx'
import { acknowledgeIncident, resolveIncident } from '@/lib/actions'
import { TopologyHealthMap } from '@/features/incidents/TopologyHealthMap'

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
  const [confirmResolve, setConfirmResolve] = useState(false)

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
    if (onSelect) onSelect(incident.id)
  }

  const topCandidate = incident.root_candidates?.[0]
  const rootService = topCandidate?.service

  // Sparkline data mapping
  const sparklineData = (incident.sparkline || []).map((val, idx) => ({ idx, val }))

  // Render resolved cards in single-row compression format
  if (incident.status === 'resolved') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{
          duration: 0.25,
          layout: { type: 'spring', stiffness: 200, damping: 25 },
        }}
        className="w-full text-left cursor-pointer"
      >
        <div
          data-incident-id={incident.id}
          onClick={handleClick}
          className="bg-bg-elevated/40 border border-border/40 hover:border-border hover:bg-bg-hover rounded-card px-3 py-2 transition-colors duration-200 flex items-center justify-between gap-3 text-text-secondary select-none text-[11px]"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
            <span className="font-semibold text-text-muted truncate max-w-[200px] font-sans">
              {incident.title}
            </span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-bg-base border border-border/30 text-text-muted font-mono leading-none flex-shrink-0 uppercase font-bold">
              Resolved
            </span>
            {topCandidate && (
              <span className="font-mono text-text-muted truncate max-w-[150px] hidden sm:inline">
                rc: <span className="text-text-secondary font-semibold">{topCandidate.service}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 font-mono text-[10px] text-text-muted">
            <span>{incident.alert_count} alerts</span>
            {incident.resolved_at && (
              <span className="opacity-80">
                (<RelativeTime timestamp={incident.resolved_at} />)
              </span>
            )}
          </div>
        </div>
      </motion.div>
    )
  }

  // Visible services limit (max 4 + '+N more')
  const visibleServices = incident.services.slice(0, 4)
  const extraServices = incident.services.length - 4

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
      className="w-full text-left cursor-pointer group"
    >
      <div
        data-incident-id={incident.id}
        onClick={handleClick}
        className="bg-bg-elevated border border-border rounded-card p-4 transition-colors duration-200 hover:border-border-strong hover:bg-bg-hover flex flex-col relative overflow-hidden select-none animate-border-pulse-entrance"
      >
        {/* Cap inner content at max-width 720px, left-aligned */}
        <div className="w-full max-w-[720px] text-left flex flex-col h-full">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-2 flex-shrink-0">
            <h3 className="text-[13px] font-semibold text-text-primary leading-tight font-sans select-text">
              {incident.title}
            </h3>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {incident.acknowledged ? (
                <span className="text-[9px] font-mono font-bold text-accent bg-accent/15 border border-accent/30 px-1 py-0.5 rounded uppercase leading-none">
                  Ack
                </span>
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-severity-critical animate-pulse-dot" />
              )}
              <RelativeTime timestamp={incident.created_at} />
            </div>
          </div>

          {/* Root Cause Line & ConfidenceBar */}
          {topCandidate && (
            <div className="flex flex-col gap-1.5 my-1.5 pb-2.5 border-b border-border/40 flex-shrink-0">
              <div className="flex items-baseline gap-1 text-[11px] font-mono text-text-secondary truncate select-text">
                <span className="text-text-muted font-semibold uppercase text-[9px] tracking-wider">Root cause:</span>
                <span className={clsx("font-bold", topCandidate.is_confirmed ? "text-accent" : "text-severity-critical")}>
                  {topCandidate.service}
                </span>
                {topCandidate.is_confirmed && (
                  <span className="text-[8px] font-bold text-accent bg-accent/15 px-1 py-0.2 rounded uppercase leading-none font-sans shrink-0">
                    Confirmed
                  </span>
                )}
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

          {/* Footer / Actions */}
          <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/30 flex-shrink-0 relative min-h-[28px]">
            {confirmResolve ? (
              <div className="flex items-center gap-2 text-[11px] font-mono" onClick={(e) => e.stopPropagation()}>
                <span className="text-severity-warning font-bold uppercase text-[9px] tracking-wider">Resolve incident?</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    resolveIncident(incident.id)
                    setConfirmResolve(false)
                  }}
                  className="px-2 py-0.5 rounded bg-severity-critical/20 hover:bg-severity-critical/30 border border-severity-critical/40 text-severity-critical text-[10px] font-bold"
                >
                  Yes, Resolve
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setConfirmResolve(false)
                  }}
                  className="px-2 py-0.5 rounded bg-bg-base border border-border text-text-secondary text-[10px]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-1 font-mono text-[11px] text-text-muted">
                  <Odometer value={incident.alert_count} className="text-text-secondary font-semibold" />
                  <span>alerts</span>
                  <span className="text-text-muted mx-0.5">(×{incident.unique_count} unique)</span>
                </div>

                {/* Operator Actions - Hover visible */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1.5 absolute right-0 bg-bg-elevated pl-2">
                  {!incident.acknowledged && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        acknowledgeIncident(incident.id)
                      }}
                      className="px-2 py-0.5 rounded bg-bg-base hover:bg-bg-hover border border-border text-text-primary text-[10px] font-mono font-semibold"
                    >
                      Ack
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmResolve(true)
                    }}
                    className="px-2 py-0.5 rounded bg-severity-critical/10 hover:bg-severity-critical/20 border border-severity-critical/30 text-severity-critical text-[10px] font-mono font-semibold"
                  >
                    Resolve
                  </button>
                </div>

                {/* Sparkline chart */}
                <div className="group-hover:opacity-0 transition-opacity duration-150 w-[60px] h-[20px] opacity-75">
                  {sparklineData.length > 0 && (
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
                  )}
                </div>
              </>
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
  const [resolvedExpanded, setResolvedExpanded] = useState(false)

  const activeIncidents = incidents.filter((i) => i.status === 'active')
  const resolvedIncidents = incidents.filter((i) => i.status === 'resolved')

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

      {/* Topology Health Map — collapsible, above incident cards */}
      <TopologyHealthMap onNodeClick={(incidentId) => onIncidentSelect?.(incidentId)} />

      {/* Body */}
      {incidents.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center select-none">
          <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-accent/60" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-text-secondary font-sans">No incidents detected</span>
            <span className="text-[11px] text-text-muted font-mono leading-relaxed max-w-[220px]">
              System nominal — start a replay to begin monitoring
            </span>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="flex flex-col gap-3 p-4">
            <AnimatePresence mode="popLayout">
              {activeIncidents.map((inc) => (
                <IncidentCard key={inc.id} incident={inc} onSelect={onIncidentSelect} />
              ))}
            </AnimatePresence>

            {/* Collapsible Resolved Section */}
            {resolvedIncidents.length > 0 && (
              <div className="mt-2 border-t border-border/20 pt-4">
                <button
                  onClick={() => setResolvedExpanded(!resolvedExpanded)}
                  className="flex items-center justify-between w-full text-text-muted hover:text-text-primary transition-colors text-[10px] font-mono uppercase font-bold tracking-wider select-none mb-3"
                >
                  <span className="flex items-center gap-1.5">
                    <svg
                      className={clsx("w-3 h-3 transition-transform duration-200", resolvedExpanded ? "rotate-90" : "")}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                    Resolved ({resolvedIncidents.length})
                  </span>
                </button>
                <AnimatePresence mode="popLayout">
                  {resolvedExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden flex flex-col gap-2"
                    >
                      {resolvedIncidents.map((inc) => (
                        <IncidentCard key={inc.id} incident={inc} onSelect={onIncidentSelect} />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
