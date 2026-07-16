import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useVirtualizer } from '@tanstack/react-virtual'
import cytoscape from 'cytoscape'
// @ts-ignore
import dagre from 'cytoscape-dagre'
import CytoscapeComponent from 'react-cytoscapejs'
import { useStreamStore } from '@/store/stream'
import { ConfidenceBar } from '@/components/ui/ConfidenceBar'
import { Badge } from '@/components/ui/Badge'
import type { Alert } from '@/lib/types'
import { clsx } from 'clsx'

// Register dagre layout extension in cytoscape
cytoscape.use(dagre)

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
  const storeIncident = useStreamStore((s) => s.incidents.get(incidentId || ''))

  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<{
    members: Alert[]
    topology_path: string[][]
  } | null>(null)
  
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

  const cyRef = useRef<any>(null)
  const membersParentRef = useRef<HTMLDivElement>(null)

  // Escape key support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Fetch topology + incident details
  useEffect(() => {
    if (!incidentId) return

    setLoading(true)
    setDetail(null)

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
          setDetail(detailData)
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
        className="fixed inset-0 bg-bg-base/60 backdrop-blur-[3px] z-40"
      />

      {/* Slide-over panel (Right aligned, 720px wide) */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 26, stiffness: 220 }}
        className="fixed inset-y-0 right-0 w-full max-w-[720px] bg-bg-surface border-l border-border shadow-elevated z-50 flex flex-col h-full overflow-hidden"
      >
        {/* Header (Instantly populated from store data) */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border flex-shrink-0 bg-bg-surface">
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
            </div>
            <h2 className="text-[15px] font-semibold text-text-primary leading-snug select-text font-sans">
              {storeIncident.title}
            </h2>
            <div className="flex items-center gap-1.5 text-[11px] text-text-muted font-mono mt-1">
              <span>{storeIncident.alert_count} alerts (×{storeIncident.unique_count} unique)</span>
              <span>·</span>
              <span>created {new Date(storeIncident.created_at).toLocaleTimeString()}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors p-1.5 rounded hover:bg-bg-elevated text-ui flex-shrink-0"
            aria-label="Close details"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content zone */}
        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-5 p-6 bg-bg-surface/50">
          
          {/* Section 1: Ranked Candidates (podium style) */}
          <section className="flex flex-col flex-shrink-0">
            <h4 className="text-[10px] text-text-muted font-mono font-bold tracking-wider uppercase mb-2 select-none">
              Ranked candidates
            </h4>
            <div className="flex flex-col gap-2">
              {storeIncident.root_candidates.slice(0, 3).map((candidate, idx) => {
                const rank = idx + 1
                const isFirst = rank === 1
                return (
                  <div
                    key={candidate.alert_id}
                    className={clsx(
                      "flex items-center gap-3 transition-all duration-200 select-text",
                      isFirst
                        ? "bg-bg-elevated border border-accent/30 ring-1 ring-accent/30 rounded p-3"
                        : "bg-bg-base/30 border border-border/50 rounded p-2.5"
                    )}
                  >
                    <span
                      className={clsx(
                        "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0",
                        isFirst ? "bg-accent text-text-inverse" : "bg-bg-elevated border border-border text-text-secondary"
                      )}
                    >
                      {rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[12px] font-semibold text-text-primary truncate">
                          {candidate.service}
                        </span>
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
                  </div>
                )
              })}
            </div>
          </section>

          {/* Section 2: Propagation Graph */}
          <section className="flex flex-col flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] text-text-muted font-mono font-bold tracking-wider uppercase select-none">
                Propagation graph
              </h4>
              {detail && (
                <button
                  onClick={() => runPropagationAnimation(cyRef.current, detail.topology_path)}
                  className="px-2 py-0.5 rounded bg-bg-elevated border border-border text-[9px] font-mono text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
                >
                  replay propagation ↻
                </button>
              )}
            </div>
            
            <div className="relative h-[180px] bg-bg-base border border-border rounded overflow-hidden">
              {loading ? (
                // Shimmering skeleton loader for the graph
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 animate-pulse bg-bg-base/50">
                  <div className="w-32 h-6 rounded bg-bg-elevated" />
                  <div className="w-48 h-4 rounded bg-bg-elevated/80" />
                </div>
              ) : topology && cyElements.length > 0 ? (
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
              )}
            </div>
          </section>

          {/* Section 3: Summary details */}
          <section className="flex flex-col flex-shrink-0 select-text">
            <h4 className="text-[10px] text-text-muted font-mono font-bold tracking-wider uppercase mb-2 select-none">
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
            <h4 className="text-[10px] text-text-muted font-mono font-bold tracking-wider uppercase mb-2 select-none">
              Correlated alerts ({sortedMembers.length})
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
      </motion.div>
    </>
  )
}
