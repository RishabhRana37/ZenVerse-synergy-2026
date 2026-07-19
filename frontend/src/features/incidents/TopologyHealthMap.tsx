/**
 * TopologyHealthMap — compact always-visible Cytoscape service health graph.
 *
 * Renders the full service dependency topology with nodes live-colored by
 * their current health, derived exclusively from the store's incidents Map.
 * No new WS subscriptions — health is computed by useMemo on every incidents change.
 *
 * Health states:
 *   healthy   – service not in any active incident → muted fill, thin border
 *   root-cause – service is root_candidates[0].service of an active incident → red + radar pulse
 *   degraded  – service in incident.services but not root cause → amber border
 *
 * When an incident resolves, its nodes transition back to healthy over 800ms via
 * Cytoscape's built-in CSS transition support.
 */
import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import CytoscapeComponent from 'react-cytoscapejs'
import { useStreamStore } from '@/store/stream'
import { Odometer } from '@/components/ui/Odometer'
import '@/lib/cytoscapeInit'  // ensures dagre registered exactly once

// ── API base ───────────────────────────────────────────────────────────────
const API_BASE = (import.meta.env.VITE_API_URL as string) || '/api'

// ── Cytoscape stylesheet for compact mode ─────────────────────────────────

const COMPACT_STYLES = [
  {
    selector: 'node',
    style: {
      'label': '',                      // no label by default in compact mode
      'width': 72,
      'height': 22,
      'shape': 'roundrectangle',
      'background-color': '#11161F',
      'border-color': 'rgba(255,255,255,0.08)',
      'border-width': 1,
      'color': '#8B98A9',
      'font-size': 10,
      'font-family': 'JetBrains Mono',
      'text-valign': 'center',
      'text-halign': 'center',
      'transition-property': 'background-color, border-color, border-width, opacity',
      'transition-duration': '0.8s',
    }
  },
  {
    selector: 'node.healthy',
    style: {
      'background-color': '#131312',
      'border-color': 'rgba(255,255,255,0.06)',
      'border-width': 1,
      'opacity': 1,
    }
  },
  {
    selector: 'node.degraded',
    style: {
      'background-color': 'rgba(232, 163, 61, 0.08)',
      'border-color': '#E8A33D',
      'border-width': 1.5,
      'opacity': 1,
    }
  },
  {
    selector: 'node.root-cause',
    style: {
      'background-color': 'rgba(229, 72, 77, 0.15)',
      'border-color': '#E5484D',
      'border-width': 2,
      'opacity': 1,
    }
  },
  {
    selector: 'node.label-visible',
    style: {
      'label': 'data(id)',
    }
  },
  {
    selector: 'edge',
    style: {
      'width': 1,
      'line-color': 'rgba(255,255,255,0.05)',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': 'rgba(255,255,255,0.05)',
      'curve-style': 'bezier',
      'arrow-scale': 0.6,
      'transition-property': 'line-color, target-arrow-color',
      'transition-duration': '0.8s',
    }
  },
  {
    selector: 'edge.affected',
    style: {
      'line-color': 'rgba(232, 163, 61, 0.3)',
      'target-arrow-color': 'rgba(232, 163, 61, 0.3)',
    }
  },
  {
    selector: 'edge.edge-pulse',
    style: {
      'width': 2.5,
      'line-color': '#F5A524',
      'target-arrow-color': '#F5A524',
      'transition-property': 'width, line-color, target-arrow-color',
      'transition-duration': '0.15s',
    }
  },
]

// ── Topology types ─────────────────────────────────────────────────────────

interface TopologyData {
  nodes: { id: string }[]
  edges: { source: string; target: string }[]
}

// ── Service health state ───────────────────────────────────────────────────

type ServiceHealth = 'healthy' | 'degraded' | 'root-cause'

interface ServiceHealthInfo {
  health: ServiceHealth
  incidentId?: string
}

// Helper: BFS calculation for propagation delays
const getCascadeDelays = (rootSvc: string, services: string[], edges: { source: string; target: string }[]) => {
  const delays = new Map<string, number>()
  delays.set(rootSvc, 0)
  
  const queue = [rootSvc]
  const visited = new Set([rootSvc])
  
  while (queue.length > 0) {
    const curr = queue.shift()!
    const currDelay = delays.get(curr) || 0
    
    const children = edges
      .filter(e => e.source === curr && services.includes(e.target))
      .map(e => e.target)
      
    for (const child of children) {
      if (!visited.has(child)) {
        visited.add(child)
        delays.set(child, currDelay + 120) // 120ms cascade step
        queue.push(child)
      }
    }
  }
  
  services.forEach(svc => {
    if (!delays.has(svc)) {
      delays.set(svc, 120)
    }
  })
  
  return delays
}

// ── Main component ─────────────────────────────────────────────────────────

interface TopologyHealthMapProps {
  onNodeClick: (incidentId: string) => void
}

export function TopologyHealthMap({ onNodeClick }: TopologyHealthMapProps) {
  const [topology, setTopology] = useState<TopologyData | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [hoveredNode, setHoveredNode] = useState<{ id: string; x: number; y: number } | null>(null)
  const [rootNodePos, setRootNodePos] = useState<{ x: number; y: number } | null>(null)
  const cyRef = useRef<any>(null)
  const timeoutsRef = useRef<number[]>([])

  // Read incidents from store (reactive), throttled to ~6/s. The raw store
  // Map gets a new reference on every WS incident update — at replay speeds
  // of 35-60+ alerts/sec that fired the Cytoscape batch + cascade-timer
  // effects below dozens of times a second, which froze the tab (repeated
  // "Maximum update depth exceeded" — not a real infinite loop, just far
  // more renders than the browser could keep up with).
  const rawIncidents = useStreamStore(s => s.incidents)
  const [incidents, setIncidents] = useState(rawIncidents)
  const pendingIncidentsRef = useRef(rawIncidents)
  pendingIncidentsRef.current = rawIncidents

  useEffect(() => {
    const id = window.setInterval(() => {
      setIncidents(pendingIncidentsRef.current)
    }, 150)
    return () => window.clearInterval(id)
  }, [])

  // ── Fetch topology once ──────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/topology`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setTopology(data) })
      .catch(console.error)
  }, [])

  // ── Derive service health from incidents ─────────────────────────────────
  const serviceHealthMap = useMemo(() => {
    const map = new Map<string, ServiceHealthInfo>()

    incidents.forEach((incident) => {
      if (incident.status !== 'active') return

      const rootSvc = incident.root_candidates?.[0]?.service
      const allServices = incident.services ?? []

      // Root cause (strongest priority)
      if (rootSvc) {
        map.set(rootSvc, { health: 'root-cause', incidentId: incident.id })
      }

      // Degraded: in blast radius but not root cause
      for (const svc of allServices) {
        if (svc !== rootSvc && !map.has(svc)) {
          map.set(svc, { health: 'degraded', incidentId: incident.id })
        }
      }
    })

    return map
  }, [incidents])

  // ── Apply Cytoscape class changes with Cascade Ignites ────────────────────
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !topology) return

    // Clean up ongoing timers
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const activeIncidents = [...incidents.values()].filter(i => i.status === 'active')

    if (activeIncidents.length === 0 || prefersReduced) {
      // ── Instant State Apply (Calm or Reduced Motion) ───────────────────────
      cy.batch(() => {
        cy.nodes().forEach((node: any) => {
          const id = node.id()
          const health = serviceHealthMap.get(id)
          node.removeClass('healthy degraded root-cause')
          if (health?.health === 'root-cause') {
            node.addClass('root-cause')
          } else if (health?.health === 'degraded') {
            node.addClass('degraded')
          } else {
            node.addClass('healthy')
          }
        })

        cy.edges().forEach((edge: any) => {
          const src = edge.source().id()
          const tgt = edge.target().id()
          edge.removeClass('affected edge-pulse')
          if (serviceHealthMap.has(src) || serviceHealthMap.has(tgt)) {
            edge.addClass('affected')
          }
        })
      })
      return
    }

    // ── Cascade failure spreading outward ────────────────────────────────────
    const activeIncident = activeIncidents[0]
    const rootSvc = activeIncident.root_candidates?.[0]?.service
    const services = activeIncident.services || []
    const delays = getCascadeDelays(rootSvc, services, topology.edges)

    // Reset affected nodes to healthy state first
    cy.batch(() => {
      cy.nodes().forEach((node: any) => {
        const id = node.id()
        if (!services.includes(id) && id !== rootSvc) {
          const health = serviceHealthMap.get(id)
          node.removeClass('healthy degraded root-cause').addClass(health?.health || 'healthy')
        } else {
          node.removeClass('healthy degraded root-cause').addClass('healthy')
        }
      })
      cy.edges().forEach((edge: any) => {
        const src = edge.source().id()
        const tgt = edge.target().id()
        if (!services.includes(src) && !services.includes(tgt) && src !== rootSvc && tgt !== rootSvc) {
          const hasEdge = serviceHealthMap.has(src) || serviceHealthMap.has(tgt)
          edge.removeClass('affected edge-pulse')
          if (hasEdge) edge.addClass('affected')
        } else {
          edge.removeClass('affected edge-pulse')
        }
      })
    })

    // Cascade delays node-by-node
    delays.forEach((delay, svc) => {
      const t = window.setTimeout(() => {
        cy.batch(() => {
          const node = cy.getElementById(svc)
          if (node.length > 0) {
            node.removeClass('healthy degraded root-cause')
            const health = serviceHealthMap.get(svc)
            node.addClass(health?.health || 'healthy')
          }

          // traveling edge highlights
          cy.edges().forEach((edge: any) => {
            if (edge.target().id() === svc && (edge.source().id() === rootSvc || delays.has(edge.source().id()))) {
              edge.addClass('affected edge-pulse')
              // remove traveling highlight pulse after 180ms
              const edgeTimer = window.setTimeout(() => {
                edge.removeClass('edge-pulse')
              }, 180)
              timeoutsRef.current.push(edgeTimer)
            }
          })
        })
      }, delay)
      timeoutsRef.current.push(t)
    })

    return () => {
      timeoutsRef.current.forEach(clearTimeout)
    }
  }, [serviceHealthMap, topology, incidents])

  // ── Track Root Cause position for absolute pulse ring overlay ──────────
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !topology) {
      setRootNodePos(null)
      return
    }

    const updatePos = () => {
      const activeIncidents = [...incidents.values()].filter(i => i.status === 'active')
      if (activeIncidents.length === 0) {
        setRootNodePos(null)
        return
      }
      const rootSvc = activeIncidents[0].root_candidates?.[0]?.service
      // cy.getElementById() always returns a (possibly empty) collection —
      // it's truthy even when no matching node exists, e.g. when the root
      // cause's service isn't one of the topology's declared nodes (common
      // once real data surfaces faults on hosts outside that set).
      // .renderedPosition() on an empty collection returns undefined, so
      // check .length, not truthiness.
      const rootNode = rootSvc ? cy.getElementById(rootSvc) : null
      if (rootNode && rootNode.length > 0) {
        const pos = rootNode.renderedPosition()
        setRootNodePos({ x: pos.x, y: pos.y })
      } else {
        setRootNodePos(null)
      }
    }

    updatePos()
    cy.on('pan zoom resize position', updatePos)
    return () => {
      cy.off('pan zoom resize position', updatePos)
    }
  }, [topology, incidents, serviceHealthMap])

  // ── Build Cytoscape elements ─────────────────────────────────────────────
  const cyElements = useMemo(() => {
    if (!topology) return []
    const nodes = topology.nodes.map(n => ({ data: { id: n.id } }))
    const edges = topology.edges.map(e => ({ data: { source: e.source, target: e.target } }))
    return [...nodes, ...edges]
  }, [topology])

  // ── Cytoscape init ───────────────────────────────────────────────────────
  const handleCyInit = useCallback((cy: any) => {
    cyRef.current = cy
    cy.userZoomingEnabled(false)
    cy.userPanningEnabled(false)
    cy.boxSelectionEnabled(false)

    cy.on('mouseover', 'node', (evt: any) => {
      const node = evt.target
      node.addClass('label-visible')
      const pos = node.renderedPosition()
      setHoveredNode({ id: node.id(), x: pos.x, y: pos.y })
    })
    cy.on('mouseout', 'node', (evt: any) => {
      evt.target.removeClass('label-visible')
      setHoveredNode(null)
    })

    cy.on('tap', 'node', (evt: any) => {
      const nodeId = evt.target.id()
      const incidentsMap = useStreamStore.getState().incidents
      let targetIncidentId: string | null = null
      incidentsMap.forEach((incident) => {
        if (incident.status === 'active') {
          const rootSvc = incident.root_candidates?.[0]?.service
          if (rootSvc === nodeId || incident.services.includes(nodeId)) {
            targetIncidentId = incident.id
          }
        }
      })
      if (targetIncidentId) onNodeClick(targetIncidentId)
    })
  }, [onNodeClick])

  const rootCauseCount = [...serviceHealthMap.values()].filter(h => h.health === 'root-cause').length
  const degradedCount  = [...serviceHealthMap.values()].filter(h => h.health === 'degraded').length

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <div className="flex-shrink-0 bg-bg-surface border-b border-border select-none">
      <button
        className="flex items-center justify-between px-4 h-[30px] w-full cursor-pointer hover:bg-bg-elevated/40 transition-colors border-none bg-transparent"
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-3 h-3 text-text-muted transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
            fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          <span className="text-[11px] font-mono font-bold text-text-muted tracking-wider uppercase select-none">
            Topology Health
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          {rootCauseCount > 0 && (
            <span className="text-severity-critical inline-flex items-baseline gap-0.5 select-all">
              <Odometer value={rootCauseCount} easing="spring" className="text-severity-critical" /> critical
            </span>
          )}
          {degradedCount > 0 && (
            <span className="text-severity-warning inline-flex items-baseline gap-0.5 select-all">
              <Odometer value={degradedCount} easing="spring" className="text-severity-warning" /> degraded
            </span>
          )}
          {rootCauseCount === 0 && degradedCount === 0 && (
            <span className="text-accent">all healthy</span>
          )}
        </div>
      </button>

      {!collapsed && (
        <>
          <div className="relative h-[168px] bg-bg-base mx-2 mb-0 rounded overflow-hidden border border-border/40">
            {!topology ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-2 animate-pulse">
                  <div className="w-32 h-4 rounded bg-bg-elevated" />
                  <div className="w-20 h-3 rounded bg-bg-elevated/80" />
                </div>
              </div>
            ) : cyElements.length > 0 ? (
              <>
                <CytoscapeComponent
                  elements={cyElements}
                  stylesheet={COMPACT_STYLES as any}
                  cy={handleCyInit}
                  layout={{
                    name: 'dagre',
                    nodeSep: 20,
                    rankSep: 30,
                    rankDir: 'LR',
                    padding: 12,
                  } as any}
                  style={{ width: '100%', height: '100%' }}
                />

                {rootNodePos && !prefersReduced && (
                  <div
                    className="absolute pointer-events-none rounded-[5px] border border-severity-critical animate-radar-pulse z-20"
                    style={{
                      left: `${rootNodePos.x}px`,
                      top: `${rootNodePos.y}px`,
                      width: '72px',
                      height: '22px',
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                )}

                {hoveredNode && (
                  <div
                    className="absolute pointer-events-none z-10 px-2 py-1 rounded bg-bg-elevated border border-border text-[10px] font-mono text-text-primary shadow-elevated"
                    style={{
                      left: hoveredNode.x,
                      top: hoveredNode.y - 32,
                      transform: 'translateX(-50%)',
                    }}
                  >
                    {hoveredNode.id}
                    {serviceHealthMap.has(hoveredNode.id) && (
                      <span
                        className={`ml-1.5 font-bold ${
                          serviceHealthMap.get(hoveredNode.id)?.health === 'root-cause'
                            ? 'text-severity-critical'
                            : 'text-severity-warning'
                        }`}
                      >
                        ●
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-text-muted text-[11px] font-mono">
                No topology data
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 px-4 py-1.5 text-[10px] font-mono text-text-muted">
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-bg-elevated border border-border/40 flex-shrink-0" />
              <span>healthy</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-severity-warning/10 border border-severity-warning flex-shrink-0" />
              <span>degraded</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-severity-critical/15 border border-severity-critical flex-shrink-0" />
              <span>root cause</span>
            </div>
            <span className="ml-auto text-text-muted/50">click to drill down</span>
          </div>
        </>
      )}
    </div>
  )
}
