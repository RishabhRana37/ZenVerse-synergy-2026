import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useVirtualizer } from '@tanstack/react-virtual'
import CytoscapeComponent from 'react-cytoscapejs'
import { useStreamStore } from '@/store/stream'
import { ConfidenceBar } from '@/components/ui/ConfidenceBar'
import { Badge } from '@/components/ui/Badge'
import { Odometer } from '@/components/ui/Odometer'
import type { Alert, Incident } from '@/lib/types'
import { clsx } from 'clsx'
import { CornerBrackets } from '@/components/ui/CornerBrackets'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Button } from '@/components/ui/Button'
import { acknowledgeIncident, resolveIncident, confirmRootCause } from '@/lib/actions'
import { useFPSStore, springPreset } from '@/lib/motion'
import '@/lib/cytoscapeInit'  // ensures dagre registered exactly once

interface CorrelationBeamsProps {
  incident: Incident
  alerts: Alert[]
  topology: { nodes: any[]; edges: any[] } | null
}

function CorrelationBeams({ incident, alerts, topology }: CorrelationBeamsProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  const fpsReduced = useFPSStore((s) => s.reducedMotion)
  const reducedMotion = (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || fpsReduced

  // Find the root alert (corresponds to the first root candidate, or the oldest alert in the list)
  const topCandidate = incident.root_candidates?.[0]
  const rootAlert = alerts.find(a => topCandidate && a.service === topCandidate.service) || alerts[0]

  // Affected alerts (excluding rootAlert, cap at 3 items for nice rendering)
  const affectedAlerts = alerts.filter(a => a.id !== rootAlert?.id).slice(0, 3)

  if (!rootAlert) {
    return (
      <div className="w-full h-full flex items-center justify-center text-text-muted font-mono text-[11px]">
        No correlation details available
      </div>
    )
  }

  return (
    <div className="w-full h-full flex items-center justify-between p-4 relative font-sans text-text-primary overflow-hidden">
      {/* Expanding Ripple Rings Behind Root cause node */}
      {!reducedMotion && (
        <div className="absolute left-[70px] top-[110px] -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0">
          <div className="w-20 h-20 rounded-full border border-accent/20 animate-ping absolute" style={{ animationDuration: '3s' }} />
          <div className="w-20 h-20 rounded-full border border-accent/10 animate-ping absolute [animation-delay:1.5s]" style={{ animationDuration: '3s' }} />
        </div>
      )}

      {/* Background SVG Beams */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="beamGradCritical" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(239, 68, 68, 0.1)" />
            <stop offset="50%" stopColor="rgba(239, 68, 68, 0.95)" />
            <stop offset="100%" stopColor="rgba(239, 68, 68, 0.1)" />
          </linearGradient>
          <linearGradient id="beamGradWarning" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(245, 158, 11, 0.1)" />
            <stop offset="50%" stopColor="rgba(245, 158, 11, 0.95)" />
            <stop offset="100%" stopColor="rgba(245, 158, 11, 0.1)" />
          </linearGradient>
          <linearGradient id="beamGradInfo" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(45, 212, 167, 0.1)" />
            <stop offset="50%" stopColor="rgba(45, 212, 167, 0.95)" />
            <stop offset="100%" stopColor="rgba(45, 212, 167, 0.1)" />
          </linearGradient>
        </defs>

        {affectedAlerts.map((targetAlert, idx) => {
          const h = 220
          const startX = 145
          const startY = h / 2
          
          const endX = 355
          let endY = h / 2
          if (affectedAlerts.length === 2) {
            endY = idx === 0 ? 55 : 165
          } else if (affectedAlerts.length === 3) {
            endY = idx === 0 ? 45 : idx === 1 ? 110 : 175
          }

          // Curved path
          const pathD = `M ${startX} ${startY} C ${(startX + endX) / 2} ${startY}, ${(startX + endX) / 2} ${endY}, ${endX} ${endY}`

          // Determine connection reason
          let reason = "Temporal window"
          if (rootAlert.service === targetAlert.service) {
            reason = "Shared Service"
          } else if (topology) {
            const hasEdge = topology.edges.some(e => 
              (e.source === rootAlert.service && e.target === targetAlert.service) ||
              (e.source === targetAlert.service && e.target === rootAlert.service)
            )
            if (hasEdge) {
              reason = "Downstream Cascade"
            }
          }

          // Choose gradient based on alert severity
          const gradId = 
            targetAlert.severity === 'critical' ? 'url(#beamGradCritical)' :
            targetAlert.severity === 'warning' ? 'url(#beamGradWarning)' :
            'url(#beamGradInfo)'

          // Highlight edge if either connected node is hovered
          const isHighlighted = hoveredNode === rootAlert.service || hoveredNode === targetAlert.service

          return (
            <g key={targetAlert.id}>
              {/* Background trace edge - Animates stroke draw */}
              <motion.path
                d={pathD}
                fill="none"
                stroke={isHighlighted ? 'var(--accent)' : 'rgba(255, 255, 255, 0.05)'}
                strokeWidth={isHighlighted ? 2.5 : 1.5}
                initial={{ pathLength: reducedMotion ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.7, ease: 'easeOut', delay: idx * 0.1 }}
                style={{ transition: 'stroke 0.15s ease, stroke-width 0.15s ease' }}
              />
              {/* Glowing animated beam overlay (disabled in reduced-motion) */}
              {!reducedMotion && (
                <path
                  d={pathD}
                  fill="none"
                  stroke={gradId}
                  strokeWidth="2"
                  strokeDasharray="20, 100"
                  className="animate-beam-flow"
                  style={{
                    animation: 'beam-flow 2.5s linear infinite',
                    animationDelay: `${idx * 0.6}s`
                  }}
                />
              )}
              {/* Text label over the beam path */}
              <text
                x={(startX + endX) / 2}
                y={(startY + endY) / 2 - 5}
                fill={isHighlighted ? 'var(--accent)' : 'rgba(255, 255, 255, 0.35)'}
                fontSize="7"
                fontFamily="JetBrains Mono"
                textAnchor="middle"
                className="select-none transition-colors duration-150"
              >
                {reason}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Root Node card on Left */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={reducedMotion ? { duration: 0.1 } : springPreset}
        onMouseEnter={() => setHoveredNode(rootAlert.service)}
        onMouseLeave={() => setHoveredNode(null)}
        className="w-[130px] border bg-[#090E11] rounded-md p-2.5 flex flex-col gap-1 z-10 shadow-elevated relative group/bracket hover:border-accent transition-colors duration-150 animate-pulse-edge-accent"
      >
        <CornerBrackets />
        <div className="flex items-center justify-between">
          <span className="text-[7px] font-mono text-accent uppercase font-bold tracking-wider leading-none">Root Alert</span>
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
        </div>
        <div className="text-[10px] font-semibold text-text-primary truncate font-sans">
          {rootAlert.service || 'unknown-service'}
        </div>
        <div className="text-[8px] font-mono text-text-muted truncate leading-none">
          {rootAlert.host || 'unknown-host'}
        </div>
        <div className="text-[9px] text-text-secondary line-clamp-2 mt-0.5 leading-snug font-sans select-text">
          {rootAlert.message}
        </div>
      </motion.div>

      {/* Affected Nodes cards on Right */}
      <div className="flex flex-col justify-around h-full py-1 z-10 w-[130px]">
        {affectedAlerts.map((alert, idx) => {
          const isCritical = alert.severity === 'critical'
          const borderStyle = 
            alert.severity === 'critical' ? 'border-severity-critical/30' :
            alert.severity === 'warning' ? 'border-severity-warning/30' :
            'border-severity-info/30'

          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={reducedMotion ? { duration: 0.1 } : { ...springPreset, delay: (idx + 1) * 0.1 }}
              onMouseEnter={() => setHoveredNode(alert.service)}
              onMouseLeave={() => setHoveredNode(null)}
              className={clsx(
                "border bg-[#090E11] rounded-md p-2 flex flex-col gap-0.5 shadow-elevated hover:border-border transition-colors duration-150 relative group/bracket cursor-pointer",
                borderStyle
              )}
            >
              <CornerBrackets />
              <div className="flex items-center justify-between">
                <span className={clsx(
                  "text-[7px] font-mono uppercase font-bold tracking-wider leading-none",
                  isCritical ? "text-severity-critical" : "text-text-muted"
                )}>
                  {alert.severity} alert
                </span>
                <span className={clsx(
                  "w-1.5 h-1.5 rounded-full",
                  alert.severity === 'critical' ? "bg-severity-critical" :
                  alert.severity === 'warning' ? "bg-severity-warning" : "bg-severity-info"
                )} />
              </div>
              <div className="text-[9px] font-semibold text-text-primary truncate font-sans leading-tight">
                {alert.service || 'unknown-service'}
              </div>
              <div className="text-[8px] text-text-secondary line-clamp-1 leading-snug font-sans select-text">
                {alert.message}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

interface DrillDownSlideOverProps {
  incidentId: string | null
  onClose: () => void
}

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

// ── MemberAlertRow component ─────────────────────────────────────────────

const MemberAlertRow = React.memo(({ alert, isRootCandidate }: { alert: Alert; isRootCandidate: boolean }) => {
  const sevBorderColor =
    alert.severity === 'critical' ? 'border-l-severity-critical' :
    alert.severity === 'warning'  ? 'border-l-severity-warning' :
    'border-l-severity-info'

  return (
    <div
      className={clsx(
        "flex items-center gap-3 px-4 border-l-[3px] border-b border-b-border/40 font-mono text-[12px] h-[44px] select-none bg-bg-surface",
        sevBorderColor,
        isRootCandidate ? "bg-bg-elevated/45 border-r border-r-accent/25" : ""
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
      <span className="text-text-secondary flex-shrink-0 truncate max-w-[140px]" title={alert.service || '—'}>
        {alert.service || '—'} <span className="text-text-muted">·</span> {alert.host || '—'}
      </span>
      <span className="text-text-primary flex-1 truncate pr-2 text-left select-text">
        {alert.message}
      </span>
      {alert.dup_count > 1 && (
        <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border border-border bg-bg-elevated text-text-secondary">
          ×{alert.dup_count}
        </span>
      )}
    </div>
  )
})

// ── Cytoscape style sheet ─────────────────────────────────────────────────

const CYTOSCAPE_STYLES = [
  {
    selector: 'node',
    style: {
      'label': 'data(id)',
      'width': 120,
      'height': 32,
      'shape': 'roundrectangle',
      'background-color': '#11161F',
      'border-color': 'rgba(255,255,255,0.08)',
      'border-width': 1,
      'color': '#E6EDF3',
      'font-size': 9,
      'font-family': 'JetBrains Mono',
      'text-valign': 'center',
      'text-halign': 'center',
      'content': 'data(id)',
      'transition-property': 'background-color, border-color, border-width, opacity',
      'transition-duration': 0.25,
    }
  },
  {
    selector: 'node.dimmed',
    style: {
      'opacity': 0.25
    }
  },
  {
    selector: 'node.affected',
    style: {
      'opacity': 1.0,
      'border-color': '#F5A623', // Amber default tint
      'border-width': 1.5
    }
  },
  {
    selector: 'node.root-cause',
    style: {
      'opacity': 1.0,
      'background-color': '#3A1010', // Dark red tint
      'border-color': '#FF4D4F', // Critical red border
      'border-width': 2.5
    }
  },
  {
    selector: 'node.active-node-blink',
    style: {
      'border-color': '#FF4D4F',
      'border-width': 2.0
    }
  },
  {
    selector: 'edge',
    style: {
      'width': 1.5,
      'line-color': 'rgba(255,255,255,0.08)',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': 'rgba(255,255,255,0.08)',
      'curve-style': 'bezier',
      'arrow-scale': 0.8,
      'transition-property': 'line-color, target-arrow-color, width',
      'transition-duration': 0.25
    }
  },
  {
    selector: 'edge.active-prop-edge',
    style: {
      'width': 2.0,
      'line-color': '#FF4D4F',
      'target-arrow-color': '#FF4D4F',
      'line-style': 'dashed',
      'line-dash-pattern': [4, 4]
    }
  }
]

// ── Main SlideOver Component ──────────────────────────────────────────────

export function DrillDownSlideOver({ incidentId, onClose }: DrillDownSlideOverProps) {
  const fpsReduced = useFPSStore((s) => s.reducedMotion)
  const reducedMotion = (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || fpsReduced

  const storeIncident = useStreamStore((s) => {
    const activeIncidents = s.scrubMode && s.scrubState ? s.scrubState.incidents : s.incidents
    return activeIncidents.get(incidentId || '')
  })
  const scrubMode = useStreamStore((s) => s.scrubMode)
  const scrubState = useStreamStore((s) => s.scrubState)
  const scrubTime = useStreamStore((s) => s.scrubTime)

  const [loading, setLoading] = useState(true)
  const [liveDetail, setLiveDetail] = useState<{
    members: Alert[]
    topology_path: string[][]
  } | null>(null)

  const detail = React.useMemo(() => {
    if (!liveDetail) return null
    if (scrubMode && scrubState) {
      const scrubbedMembers = Array.from(scrubState.alertIndex.values())
        .filter((a) => a.cluster_id === incidentId)
        .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())

      const activeServices = new Set(storeIncident?.services || [])
      const scrubbedTopoPath = (liveDetail.topology_path || []).filter(
        ([src, dest]) => activeServices.has(src) && activeServices.has(dest)
      )

      return {
        members: scrubbedMembers,
        topology_path: scrubbedTopoPath,
      }
    }
    return liveDetail
  }, [liveDetail, scrubMode, scrubState, incidentId, storeIncident])
  
  const [topology, setTopology] = useState<{
    nodes: { id: string }[]
    edges: { source: string; target: string }[]
  } | null>(null)

  const [hoveredNode, setHoveredNode] = useState<{
    service: string
    count: number
    x: number
    y: number
  } | null>(null)

  const [activeTab, setActiveTab] = useState<'blast' | 'beams'>('blast')

  const cyRef = useRef<any>(null)
  const membersParentRef = useRef<HTMLDivElement>(null)

  // Escape key & operator shortcuts support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in input
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return
      }

      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'a' || e.key === 'A') {
        if (incidentId) {
          acknowledgeIncident(incidentId)
        }
      } else if (e.key === 'R' && e.shiftKey) {
        if (incidentId) {
          resolveIncident(incidentId)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, incidentId])

  // Fetch topology + incident details
  useEffect(() => {
    if (!incidentId) return

    setLoading(true)
    setLiveDetail(null)

    const fetchAll = async () => {
      try {
        const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8788'
        
        // Fetch static topology if not yet populated
        let topoData = topology
        if (!topoData) {
          const tRes = await fetch(`${apiBase}/topology`)
          if (tRes.ok) {
            topoData = await tRes.json()
            setTopology(topoData)
          }
        }

        // Fetch incident detail
        const iRes = await fetch(`${apiBase}/incidents/${incidentId}`)
        if (iRes.ok) {
          const detailData = await iRes.json()
          setLiveDetail(detailData)
        }
      } catch (err) {
        console.error('[drilldown] API Fetch Error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
  }, [incidentId, topology])

  // Animate line-dash-offset for active edges
  useEffect(() => {
    let frameId: number
    let offset = 0

    const animateDash = () => {
      offset = (offset + 0.6) % 16
      if (cyRef.current) {
        cyRef.current.edges('.active-prop-edge').style('line-dash-offset', -offset)
      }
      frameId = requestAnimationFrame(animateDash)
    }

    frameId = requestAnimationFrame(animateDash)
    return () => cancelAnimationFrame(frameId)
  }, [detail])

  // Animate slow radar pulse for root cause node
  useEffect(() => {
    let intervalId: any
    let isPulseActive = true

    if (detail) {
      intervalId = setInterval(() => {
        if (cyRef.current) {
          const rcNode = cyRef.current.nodes('.root-cause')
          rcNode.style('border-width', isPulseActive ? 3.5 : 1.5)
          rcNode.style('border-color', isPulseActive ? '#FF4D4F' : 'rgba(255, 77, 79, 0.6)')
          isPulseActive = !isPulseActive
        }
      }, 1000)
    }

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [detail])

  // Run/stagger the edge propagation animation
  const runPropagationAnimation = (cy: any, path: string[][]) => {
    if (!cy || !path) return

    // 1. Reset edges and destinations
    cy.edges().removeClass('active-prop-edge')
    cy.nodes().removeClass('active-node-blink')

    const fpsReduced = useFPSStore.getState().reducedMotion
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || fpsReduced
    if (prefersReduced) {
      path.forEach((edge) => {
        const src = edge[0]
        const dest = edge[1]
        cy.edges(`[source="${src}"][target="${dest}"]`).addClass('active-prop-edge')
        cy.nodes(`#${dest}`).addClass('active-node-blink')
      })
      return
    }

    // 2. Stagger activation
    path.forEach((edge, idx) => {
      setTimeout(() => {
        const src = edge[0]
        const dest = edge[1]

        // Make edge red and dashed
        const cyEdge = cy.edges(`[source="${src}"][target="${dest}"]`)
        cyEdge.addClass('active-prop-edge')

        // Flash destination node
        const cyNode = cy.nodes(`#${dest}`)
        cyNode.addClass('active-node-blink')
      }, idx * 300)
    })
  }

  // Cytoscape initialization / configuration callback
  const handleCyInit = (cy: any) => {
    cyRef.current = cy
    cy.userZoomingEnabled(false)
    cy.userPanningEnabled(false)
    cy.boxSelectionEnabled(false)

    // Node tooltips
    cy.on('mouseover', 'node', (evt: any) => {
      const node = evt.target
      const id = node.id()
      const pos = node.renderedPosition()

      // Calculate matching alerts count in detail
      const alertCount = detail?.members
        ? detail.members.filter((m) => m.service === id).reduce((acc, m) => acc + (m.dup_count || 1), 0)
        : 0

      setHoveredNode({
        service: id,
        count: alertCount,
        x: pos.x,
        y: pos.y - 20,
      })
    })

    cy.on('mouseout', 'node', () => {
      setHoveredNode(null)
    })
  }

  // Configure Cytoscape nodes/edges classes when detail resolves
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !detail || !storeIncident) return

    cy.batch(() => {
      // Clear classes
      cy.nodes().removeClass('dimmed affected root-cause active-node-blink')
      cy.edges().removeClass('active-prop-edge')

      const affectedServices = new Set(storeIncident.services)
      const rootService = storeIncident.root_candidates?.[0]?.service

      cy.nodes().forEach((node: any) => {
        const id = node.id()
        if (id === rootService) {
          node.addClass('root-cause')
        } else if (affectedServices.has(id)) {
          node.addClass('affected')
        } else {
          node.addClass('dimmed')
        }
      })
    })

    runPropagationAnimation(cy, detail.topology_path)
  }, [detail, storeIncident])

  // Group and sort members (root candidates first)
  const sortedMembers = React.useMemo(() => {
    if (!detail?.members || !storeIncident) return []
    const rootIds = new Set(storeIncident.root_candidates.map((rc) => rc.alert_id))
    const candidateMembers = detail.members.filter((m) => rootIds.has(m.id))
    const otherMembers = detail.members.filter((m) => !rootIds.has(m.id))
    return [...candidateMembers, ...otherMembers]
  }, [detail, storeIncident])

  // Virtualized members list
  const rowVirtualizer = useVirtualizer({
    count: sortedMembers.length,
    getScrollElement: () => membersParentRef.current,
    estimateSize: () => 44,
    overscan: 5,
  })

  // Format elements list for Cytoscape Component
  const cyElements = React.useMemo(() => {
    if (!topology) return []
    const nodes = topology.nodes.map((n) => ({ data: { id: n.id } }))
    const edges = topology.edges.map((e) => ({ data: { source: e.source, target: e.target } }))
    return [...nodes, ...edges]
  }, [topology])

  if (!incidentId || !storeIncident) return null

  return (
    <>
      {/* Dimmed backdrop (War room remains visible and streaming behind) */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-[#0A0E14]/80 z-[60]"
      />

      {/* Slide-over panel (Right aligned, 720px wide) */}
      <motion.div
        initial={{ x: reducedMotion ? 0 : '100%', opacity: reducedMotion ? 0 : 1 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: reducedMotion ? 0 : '100%', opacity: reducedMotion ? 0 : 1 }}
        transition={reducedMotion ? { duration: 0.15 } : springPreset}
        className="fixed inset-y-0 right-0 w-full max-w-[720px] bg-bg-surface border-l border-border shadow-elevated z-[60] flex flex-col h-full overflow-visible group/bracket"
      >
        <CornerBrackets />
        {/* Header (Instantly populated from store data) */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border/40 flex-shrink-0 bg-transparent">
          <div className="flex flex-col gap-1 pr-6">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-text-secondary select-text">{storeIncident.id}</span>
              <span
                className={clsx(
                  "w-1.5 h-1.5 rounded-full",
                  storeIncident.status === 'active' ? "bg-severity-critical animate-pulse-dot" : "bg-accent"
                )}
              />
              <span className="text-[10px] font-mono uppercase font-semibold text-text-muted">{storeIncident.status}</span>
              {scrubMode && (
                <span className="text-[10px] font-mono font-bold text-accent px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 animate-pulse select-none">
                  as of t+{scrubTime.toFixed(1)}s
                </span>
              )}
            </div>
            <h2 className="text-[15px] font-semibold text-text-primary leading-snug select-text font-sans line-clamp-2">
              {storeIncident.title}
            </h2>
            <div className="flex items-center gap-1.5 text-[11px] text-text-muted font-mono mt-1 select-none">
              <span className="inline-flex items-baseline gap-0.5">
                <Odometer value={storeIncident.alert_count} easing="spring" />
                <span>alerts</span>
              </span>
              <span>(×<Odometer value={storeIncident.unique_count} easing="spring" /> unique)</span>
              <span>·</span>
              <span>created {new Date(storeIncident.created_at).toLocaleTimeString()}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 text-text-secondary hover:text-text-primary flex items-center justify-center"
            aria-label="Close details"
          >
            ✕
          </Button>
        </div>

        {/* Scrollable Content zone */}
        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-6 p-6 bg-transparent">
          
          {/* Section 1: Ranked Candidates (podium style) */}
          <section className="flex flex-col flex-shrink-0">
            <Eyebrow>Ranked candidates</Eyebrow>
            <div className="flex flex-col gap-2">
              {storeIncident.root_candidates.slice(0, 3).map((candidate, idx) => {
                const rank = idx + 1
                const isFirst = rank === 1
                return (
                  <motion.div
                    layout
                    key={candidate.alert_id}
                    className={clsx(
                      "flex items-center gap-3 transition-all duration-150 select-text group",
                      isFirst
                        ? "bg-bg-surface/80 border border-accent/45 rounded-[10px] p-3 shadow-md"
                        : "bg-bg-surface/30 border border-border/40 rounded-[10px] p-2.5"
                    )}
                  >
                    <span
                      className={clsx(
                        "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0 border",
                        isFirst ? "bg-accent border-accent text-[#0A0A0B]" : "bg-bg-surface border-border text-text-secondary"
                      )}
                    >
                      {rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[12px] font-semibold text-text-primary truncate">
                          {candidate.service}
                        </span>
                        {candidate.is_confirmed && (
                          <span className="text-[8px] font-bold text-accent bg-accent/15 px-1 py-0.2 rounded uppercase leading-none font-sans shrink-0">
                            Confirmed
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-text-secondary truncate mt-0.5">
                        {candidate.template}
                      </div>
                    </div>
                    <div className="w-[100px] flex-shrink-0">
                      <ConfidenceBar
                        confidence={candidate.confidence}
                        height="xs"
                        showLabel={true}
                        greenThreshold={0.6}
                        amberThreshold={0.3}
                      />
                    </div>
                    {rank > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          confirmRootCause(storeIncident.id, candidate.alert_id)
                        }}
                        title="Set as root cause"
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1.5 rounded hover:bg-bg-elevated border border-border text-text-muted hover:text-accent hover:border-accent/40 shrink-0"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </button>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </section>

          {/* Section 2: Propagation Graph & Beams */}
          <section className="flex flex-col flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex bg-bg-base p-0.5 rounded border border-border">
                <button
                  onClick={() => setActiveTab('blast')}
                  className={clsx(
                    "px-2.5 py-0.5 rounded text-[10px] font-mono font-medium transition-colors cursor-pointer",
                    activeTab === 'blast'
                      ? "bg-bg-surface text-text-primary border border-border shadow-sm font-semibold"
                      : "text-text-secondary hover:text-text-primary"
                  )}
                >
                  Blast Radius
                </button>
                <button
                  onClick={() => setActiveTab('beams')}
                  className={clsx(
                    "px-2.5 py-0.5 rounded text-[10px] font-mono font-medium transition-colors cursor-pointer",
                    activeTab === 'beams'
                      ? "bg-bg-surface text-text-primary border border-border shadow-sm font-semibold"
                      : "text-text-secondary hover:text-text-primary"
                  )}
                >
                  Correlation Beams
                </button>
              </div>

              {activeTab === 'blast' && detail && (
                <button
                  onClick={() => runPropagationAnimation(cyRef.current, detail.topology_path)}
                  className="px-2 py-0.5 rounded bg-bg-elevated border border-border text-[9px] font-mono text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1 cursor-pointer"
                >
                  replay propagation ↻
                </button>
              )}
            </div>
            
            <div className="relative h-[220px] bg-bg-base border border-border rounded overflow-hidden">
              {loading ? (
                // Shimmering skeleton loader for the graph
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 animate-pulse bg-bg-base/50">
                  <div className="w-32 h-6 rounded bg-bg-elevated" />
                  <div className="w-48 h-4 rounded bg-bg-elevated/80" />
                </div>
              ) : activeTab === 'blast' ? (
                topology && cyElements.length > 0 ? (
                  <>
                    <CytoscapeComponent
                      elements={cyElements}
                      stylesheet={CYTOSCAPE_STYLES as any}
                      cy={handleCyInit}
                      layout={{
                        name: 'dagre',
                        nodeSep: 35,
                        rankSep: 40,
                        rankDir: 'TB',
                      } as any}
                      style={{ width: '100%', height: '100%' }}
                    />

                    {/* Tooltip Overlay */}
                    {hoveredNode && (
                      <div
                        className="absolute px-2 py-1 rounded bg-bg-elevated border border-border/80 text-[10px] font-mono text-text-primary pointer-events-none z-10 shadow-elevated"
                        style={{
                          left: `${hoveredNode.x}px`,
                          top: `${hoveredNode.y}px`,
                          transform: 'translate(-50%, -100%)',
                        }}
                      >
                        <div className="font-semibold text-accent">{hoveredNode.service}</div>
                        <div className="text-[9px] text-text-secondary mt-0.5">
                          {hoveredNode.count} alerts in incident
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-text-muted text-stream">
                    No topology path loaded
                  </div>
                )
              ) : (
                <CorrelationBeams
                  incident={storeIncident}
                  alerts={sortedMembers}
                  topology={topology}
                />
              )}
            </div>
          </section>

          {/* Section 3: Summary details */}
          <section className="flex flex-col flex-shrink-0 select-text">
            <h4 className="text-[11px] text-text-muted font-mono font-bold tracking-wider uppercase mb-2 select-none">
              Incident summary
            </h4>
            {storeIncident.summary ? (
              <div className="p-4 bg-bg-elevated/40 border border-border/60 rounded text-[12px] font-sans text-text-primary leading-relaxed">
                <div>{storeIncident.summary}</div>
                {storeIncident.first_action && (
                  <div className="mt-3 pt-3 border-t border-border/20 text-accent font-semibold flex flex-col gap-0.5">
                    <span className="text-text-secondary text-[9px] font-bold tracking-wider">FIRST ACTION:</span>
                    <span className="normal-case font-medium">{storeIncident.first_action}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-bg-elevated/20 border border-border/40 rounded flex flex-col gap-2 animate-pulse">
                <div className="h-3 w-full rounded bg-bg-elevated/65" />
                <div className="h-3 w-4/5 rounded bg-bg-elevated/65" />
                <span className="text-[10px] text-text-muted font-mono tracking-wider uppercase select-none">
                  analyzing…
                </span>
              </div>
            )}
          </section>

          {/* Section 4: Members list (virtualized) */}
          <section className="flex flex-col flex-1 min-h-[220px]">
            <h4 className="text-[11px] text-text-muted font-mono font-bold tracking-wider uppercase mb-2 select-none">
              Correlated alerts (<Odometer value={sortedMembers.length} easing="spring" />)
            </h4>
            
            <div className="flex-1 border border-border rounded bg-bg-base overflow-hidden flex flex-col min-h-0">
              {loading ? (
                // Shimmering skeleton rows for alerts list
                <div className="flex flex-col divide-y divide-border/30 overflow-hidden">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-[44px] flex items-center justify-between px-4 animate-pulse bg-bg-surface/30">
                      <div className="w-16 h-3 rounded bg-bg-elevated/80" />
                      <div className="w-24 h-3 rounded bg-bg-elevated/80" />
                      <div className="w-32 h-3 rounded bg-bg-elevated/85" />
                    </div>
                  ))}
                </div>
              ) : sortedMembers.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-text-muted text-stream select-none">
                  No member alerts loaded
                </div>
              ) : (
                <div ref={membersParentRef} className="flex-1 overflow-y-auto min-h-0">
                  <div
                    style={{
                      height: `${rowVirtualizer.getTotalSize()}px`,
                      width: '100%',
                      position: 'relative',
                    }}
                  >
                    {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                      const alert = sortedMembers[virtualItem.index]
                      if (!alert) return null
                      const isRC = storeIncident.root_candidates.some(
                        (rc) => rc.alert_id === alert.id
                      )
                      return (
                        <div
                          key={alert.id}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: `${virtualItem.size}px`,
                            transform: `translateY(${virtualItem.start}px)`,
                          }}
                        >
                          <MemberAlertRow alert={alert} isRootCandidate={isRC} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer Action Bar */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-bg-surface flex-shrink-0 z-15">
          <div className="flex items-center gap-3 text-[10px] text-text-secondary font-mono">
            <span>Shortcut: <kbd className="bg-bg-base border border-border px-1.5 py-0.5 rounded font-mono font-bold text-accent">A</kbd> Ack</span>
            <span className="text-border/40 select-none">·</span>
            <span>Shortcut: <kbd className="bg-bg-base border border-border px-1.5 py-0.5 rounded font-mono font-bold text-accent">Shift+R</kbd> Resolve</span>
          </div>

          <div className="flex items-center gap-2">
            {storeIncident.status === 'active' && (
              <>
                <Button
                  size="sm"
                  variant={storeIncident.acknowledged ? "secondary" : "accent"}
                  onClick={() => acknowledgeIncident(storeIncident.id)}
                  disabled={storeIncident.acknowledged}
                >
                  {storeIncident.acknowledged ? "Acknowledged" : "Acknowledge"}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => resolveIncident(storeIncident.id)}
                >
                  Resolve
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </>
  )
}
