import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStreamStore, selectIncidentList } from '@/store/stream'
import { ConfidenceBar } from '@/components/ui/ConfidenceBar'
import { Odometer } from '@/components/ui/Odometer'
import { Sparkline } from '@/components/ui/Sparkline'
import type { Incident } from '@/lib/types'
import { clsx } from 'clsx'
import { acknowledgeIncident, resolveIncident } from '@/lib/actions'
import { TopologyHealthMap } from '@/features/incidents/TopologyHealthMap'
import { CornerBrackets } from '@/components/ui/CornerBrackets'

// ── RelativeTime component ───────────────────────────────────────────────

function RelativeTime({ timestamp }: { timestamp: string }) {
  const [msAgo, setMsAgo] = useState<number>(0)

  useEffect(() => {
    const update = () => {
      setMsAgo(Date.now() - new Date(timestamp).getTime())
    }
    update()
    const timer = setInterval(update, 10000) // update every 10s
    return () => clearInterval(timer)
  }, [timestamp])

  const sec = Math.floor(msAgo / 1000)
  if (sec < 60) {
    return <span className="text-[11px] text-text-secondary font-mono select-none">just now</span>
  }
  const min = Math.floor(sec / 60)
  if (min < 60) {
    return (
      <span className="text-[11px] text-text-secondary font-mono inline-flex items-baseline gap-0.5 select-none">
        <Odometer value={min} easing="spring" className="text-[11px] text-text-secondary" />
        <span>m ago</span>
      </span>
    )
  }
  const hr = Math.floor(min / 60)
  return (
    <span className="text-[11px] text-text-secondary font-mono inline-flex items-baseline gap-0.5 select-none">
      <Odometer value={hr} easing="spring" className="text-[11px] text-text-secondary" />
      <span>h ago</span>
    </span>
  )
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

const IncidentCard = React.memo(({ incident, onSelect, index }: { incident: Incident; onSelect?: (id: string) => void; index: number }) => {
  const [isPulsing, setIsPulsing] = useState(false)
  const [showFirstAction, setShowFirstAction] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [confirmResolve, setConfirmResolve] = useState(false)

  // Local state for deferred/arrival-synced counts
  const [displayedAlertCount, setDisplayedAlertCount] = useState(incident.alert_count)
  const [displayedUniqueCount, setDisplayedUniqueCount] = useState(incident.unique_count)

  // Listen to the custom event triggered on particle arrival
  useEffect(() => {
    const handlePulse = () => {
      setIsPulsing(true)
      setDisplayedAlertCount(incident.alert_count)
      setDisplayedUniqueCount(incident.unique_count)
      const timer = setTimeout(() => setIsPulsing(false), 200)
      return () => clearTimeout(timer)
    }

    window.addEventListener(`stormlens-card-pulse-${incident.id}`, handlePulse)
    return () => window.removeEventListener(`stormlens-card-pulse-${incident.id}`, handlePulse)
  }, [incident.id, incident.alert_count, incident.unique_count])

  // Fallback sync (1200ms) to ensure count is never out of sync indefinitely
  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayedAlertCount(incident.alert_count)
      setDisplayedUniqueCount(incident.unique_count)
    }, 1200)
    return () => clearTimeout(timer)
  }, [incident.alert_count, incident.unique_count])

  const handleClick = () => {
    if (onSelect) onSelect(incident.id)
  }

  const topCandidate = incident.root_candidates?.[0]
  const rootService = topCandidate?.service

  // Sparkline data mapping
  const sparklineData = (incident.sparkline || []).map((val, idx) => ({ idx, val }))

  // Mouse Spotlight Tracking
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  // Compute live severity from alerts
  const alerts = useStreamStore((s) => s.alerts)
  const severity = React.useMemo(() => {
    const myAlerts = alerts.filter(a => a.cluster_id === incident.id)
    if (myAlerts.some(a => a.severity === 'critical')) return 'critical'
    if (myAlerts.some(a => a.severity === 'warning')) return 'warning'
    if (incident.title.toLowerCase().includes('critical') || incident.title.toLowerCase().includes('error') || incident.title.toLowerCase().includes('fail')) return 'critical'
    if (incident.title.toLowerCase().includes('warn')) return 'warning'
    return 'info'
  }, [alerts, incident.id, incident.title])

  // Spotlight and border colors based on severity
  const colors = React.useMemo(() => {
    switch (severity) {
      case 'critical':
        return {
          border: 'rgba(239, 68, 68, 0.4)',
          glow: 'rgba(239, 68, 68, 0.12)',
          rgb: '239, 68, 68',
        }
      case 'warning':
        return {
          border: 'rgba(245, 158, 11, 0.4)',
          glow: 'rgba(245, 158, 11, 0.12)',
          rgb: '245, 158, 11',
        }
      case 'info':
      default:
        return {
          border: 'rgba(59, 130, 246, 0.4)',
          glow: 'rgba(59, 130, 246, 0.12)',
          rgb: '59, 130, 246',
        }
    }
  }, [severity])

  // Render resolved cards in single-row compression format
  if (incident.status === 'resolved') {
    return (
      <motion.div
        layout
        custom={index}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
      >
        <div
          data-incident-id={incident.id}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            borderColor: isHovered ? colors.border : undefined,
            boxShadow: isHovered ? `0 0 10px ${colors.glow}` : undefined,
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s',
          }}
          className="bg-bg-elevated/40 border border-text-muted/20 hover:bg-bg-hover rounded-card px-3 py-2 flex items-center justify-between gap-3 text-text-secondary select-none text-[11px] relative overflow-hidden"
        >
          {isHovered && (
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-300 z-0"
              style={{
                background: `radial-gradient(150px circle at ${mousePos.x}px ${mousePos.y}px, rgba(${colors.rgb}, 0.04), transparent 80%)`,
              }}
            />
          )}
          <div className="flex items-center gap-2 min-w-0 flex-1 z-10 relative">
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

          <div className="flex items-center gap-2 flex-shrink-0 font-mono text-[10px] text-text-muted z-10 relative">
            <span className="inline-flex items-baseline gap-0.5">
              <Odometer value={incident.alert_count} easing="spring" className="text-text-muted" />
              <span>alerts</span>
            </span>
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

  const borderClass = incident.acknowledged
    ? 'border border-accent/25 bg-bg-elevated' // acknowledged = accent-dim
    : 'border border-border bg-bg-elevated' // active = hairline

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const cardVariants = {
    hidden: { opacity: 0 },
    visible: prefersReduced 
      ? { opacity: 1, transition: { duration: 0.1 } }
      : {
          opacity: 1,
          transition: {
            duration: 0.18,
            delay: 0.05,
            ease: 'easeOut'
          }
        }
  }

  const lineVariants = {
    hidden: { scaleX: 0 },
    visible: {
      scaleX: 1,
      transition: {
        duration: 0.12,
        ease: 'easeOut'
      }
    }
  }

  const titleVariants = {
    hidden: prefersReduced ? { opacity: 1 } : { opacity: 0, y: 4 },
    visible: prefersReduced 
      ? { opacity: 1, y: 0 }
      : {
          opacity: 1,
          y: 0,
          transition: { delay: 0.12, duration: 0.15, ease: 'easeOut' }
        }
  }

  const rootLineVariants = {
    hidden: prefersReduced ? { opacity: 1 } : { opacity: 0, y: 4 },
    visible: prefersReduced
      ? { opacity: 1, y: 0 }
      : {
          opacity: 1,
          y: 0,
          transition: { delay: 0.16, duration: 0.15, ease: 'easeOut' }
        }
  }

  const chipsVariants = {
    hidden: prefersReduced ? { opacity: 1 } : { opacity: 0, y: 4 },
    visible: prefersReduced
      ? { opacity: 1, y: 0 }
      : {
          opacity: 1,
          y: 0,
          transition: { delay: 0.20, duration: 0.15, ease: 'easeOut' }
        }
  }

  const summaryVariants = {
    hidden: prefersReduced ? { opacity: 1 } : { opacity: 0, y: 4 },
    visible: prefersReduced
      ? { opacity: 1, y: 0 }
      : {
          opacity: 1,
          y: 0,
          transition: { delay: 0.24, duration: 0.15, ease: 'easeOut' }
        }
  }

  const footerVariants = {
    hidden: prefersReduced ? { opacity: 1 } : { opacity: 0 },
    visible: prefersReduced
      ? { opacity: 1 }
      : {
          opacity: 1,
          transition: { delay: 0.28, duration: 0.15, ease: 'easeOut' }
        }
  }

  return (
    <motion.div
      layout
      custom={index}
      initial="hidden"
      animate={isPulsing ? { opacity: 1, scale: [1, 1.015, 1] } : "visible"}
      exit={{ opacity: 0, scale: 0.96 }}
      variants={cardVariants}
      className="w-full text-left cursor-pointer group/bracket relative"
    >
      <div
        data-incident-id={incident.id}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          borderColor: isHovered ? colors.border : undefined,
          boxShadow: isHovered ? `0 0 10px ${colors.glow}` : undefined,
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s',
        }}
        className={clsx(
          "rounded-card p-4 flex flex-col relative overflow-hidden select-none animate-border-pulse-entrance",
          borderClass
        )}
      >
        {/* Soft radial spotlight follow */}
        {isHovered && (
          <div
            className="absolute inset-0 pointer-events-none transition-opacity duration-300 z-0"
            style={{
              background: `radial-gradient(150px circle at ${mousePos.x}px ${mousePos.y}px, rgba(${colors.rgb}, 0.05), transparent 80%)`,
            }}
          />
        )}

        {/* Draw Accent Line across where the card will be */}
        {topCandidate && (
          <motion.div
            variants={lineVariants}
            style={{ originX: 0 }}
            className="absolute top-0 left-0 right-0 h-[1px] bg-accent pointer-events-none transition-opacity duration-200 z-10"
            animate={{ opacity: isPulsing ? 1.0 : topCandidate.confidence }}
          />
        )}

        {/* Cap inner content at max-width 720px, left-aligned */}
        <div className="w-full max-w-[720px] text-left flex flex-col h-full z-10 relative">
          {/* Header */}
          <motion.div variants={titleVariants} className="flex items-start justify-between gap-3 mb-2 flex-shrink-0">
            <h3 className="text-[13px] font-semibold text-text-primary leading-tight font-sans select-text line-clamp-2">
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
          </motion.div>

          {/* Root Cause Line & ConfidenceBar */}
          {topCandidate && (
            <motion.div variants={rootLineVariants} className="flex flex-col gap-1.5 my-1.5 pb-2.5 border-b border-border/40 flex-shrink-0">
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
            </motion.div>
          )}

          {/* Services blast-radius chips */}
          <motion.div variants={chipsVariants} className="flex flex-wrap gap-1.5 mb-2.5 flex-shrink-0">
            {visibleServices.map((svc) => {
              const isRoot = svc === rootService
              return (
                <span
                  key={svc}
                  className={clsx(
                    "text-[10px] font-mono px-2 py-0.5 rounded border leading-none transition-colors",
                    isRoot
                      ? "bg-severity-critical/10 border-severity-critical/30 text-severity-critical font-bold"
                      : "bg-bg-base/60 border-border text-text-secondary"
                  )}
                >
                  {svc}
                </span>
              )
            })}
            {extraServices > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-bg-base/30 text-text-muted font-bold leading-none">
                +{extraServices} more
              </span>
            )}
          </motion.div>

          {/* Summary / Diagnosis Brief */}
          <motion.div variants={summaryVariants} className="flex flex-col gap-1 my-1.5 flex-1 select-text">
            {incident.summary ? (
              <div className="flex flex-col h-full justify-between">
                <div className={clsx("transition-all duration-200 z-10 relative", !isExpanded && "line-clamp-4 overflow-hidden")}>
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
                    className="text-accent hover:underline text-[10px] font-mono mt-1.5 block select-none z-10 relative cursor-pointer"
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
          </motion.div>

          {/* Footer / Actions */}
          <motion.div variants={footerVariants} className="flex items-center justify-between mt-auto pt-2 border-t border-border/30 flex-shrink-0 relative min-h-[28px] z-10">
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
                  <Odometer value={displayedAlertCount} className="text-text-secondary font-semibold" easing="spring" />
                  <span>alerts</span>
                  <span className="text-text-muted mx-0.5">(×<Odometer value={displayedUniqueCount} easing="spring" /> unique)</span>
                </div>

                {/* Operator Actions - Hover visible */}
                <div className="opacity-0 group-hover/bracket:opacity-100 transition-opacity duration-150 flex items-center gap-1.5 absolute right-0 bg-bg-elevated pl-2">
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
                <div className="group-hover/bracket:opacity-0 transition-opacity duration-150 w-[60px] h-[20px] opacity-75">
                  {sparklineData.length > 0 && (
                    <Sparkline
                      data={sparklineData.map(d => d.val)}
                      width={60}
                      height={20}
                      color="#2DD4A7"
                    />
                  )}
                </div>
              </>
            )}
          </motion.div>
        </div>
      </div>
      <CornerBrackets />
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
    const stats = s.scrubMode && s.scrubState ? s.scrubState.stats : s.stats
    const incs = s.scrubMode && s.scrubState ? s.scrubState.incidents : s.incidents
    if (stats) return stats.active_incidents
    return [...incs.values()].filter((i) => i.status === 'active').length
  })

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <span className="font-mono text-[11px] font-bold tracking-wider uppercase text-text-muted">
          <span className="text-accent mr-1">▎02</span> Incidents
        </span>
        <div className="px-2 py-0.5 rounded bg-bg-elevated border border-border text-stream text-text-secondary font-mono select-none">
          <Odometer value={activeCount} easing="spring" className="text-text-secondary" /> active
        </div>
      </div>

      {/* Topology Health Map — collapsible, above incident cards */}
      <TopologyHealthMap onNodeClick={(incidentId) => onIncidentSelect?.(incidentId)} />

      {/* Body */}
      {incidents.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center select-none animate-fade-in">
          <div className="relative w-12 h-12 flex items-center justify-center">
            {/* Concentric rings */}
            <div className="absolute inset-0 rounded-full border border-accent/20 animate-concentric" />
            <div className="absolute inset-2.5 rounded-full border border-accent/40 animate-concentric" style={{ animationDelay: '1s' }} />
            <div className="w-3.5 h-3.5 rounded-full bg-accent" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-text-secondary font-sans">Monitoring — no active incidents</span>
            <span className="text-[10px] text-text-muted font-mono tracking-wide uppercase">
              System Nominal
            </span>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="flex flex-col gap-3 p-4">
            <AnimatePresence mode="popLayout">
              {activeIncidents.map((inc, index) => (
                <IncidentCard key={inc.id} incident={inc} onSelect={onIncidentSelect} index={index} />
              ))}
            </AnimatePresence>

            {/* Collapsible Resolved Section */}
            {resolvedIncidents.length > 0 && (
              <div className="mt-2 border-t border-border/20 pt-4">
                <button
                  onClick={() => setResolvedExpanded(!resolvedExpanded)}
                  className="flex items-center justify-between w-full text-text-muted hover:text-text-primary transition-colors text-[11px] font-mono uppercase font-bold tracking-wider select-none mb-3"
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
                      {resolvedIncidents.map((inc, index) => (
                        <IncidentCard key={inc.id} incident={inc} onSelect={onIncidentSelect} index={index} />
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
