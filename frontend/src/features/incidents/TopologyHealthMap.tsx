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
import cytoscape from 'cytoscape'
// @ts-ignore
import dagre from 'cytoscape-dagre'
import CytoscapeComponent from 'react-cytoscapejs'
import { useStreamStore } from '@/store/stream'

// Register dagre once (safe to call multiple times)
try { cytoscape.use(dagre) } catch {}

// ── API base ───────────────────────────────────────────────────────────────
const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8788'

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
      'font-size': 8,
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
      'background-color': '#11161F',
      'border-color': 'rgba(255,255,255,0.08)',
      'border-width': 1,
      'opacity': 1,
    }
  },
  {
    selector: 'node.degraded',
    style: {
      'background-color': 'rgba(245, 166, 35, 0.08)',
      'border-color': '#F5A623',
      'border-width': 1.5,
      'opacity': 1,
    }
  },
  {
    selector: 'node.root-cause',
    style: {
      'background-color': 'rgba(255, 77, 79, 0.15)',
      'border-color': '#FF4D4F',
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
      'line-color': 'rgba(245, 166, 35, 0.3)',
      'target-arrow-color': 'rgba(245, 166, 35, 0.3)',
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

// ── Main component ─────────────────────────────────────────────────────────

interface TopologyHealthMapProps {
  onNodeClick: (incidentId: string) => void
}

export function TopologyHealthMap({ onNodeClick }: TopologyHealthMapProps) {
  const [topology, setTopology] = useState<TopologyData | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [hoveredNode, setHoveredNode] = useState<{ id: string; x: number; y: number } | null>(null)
  const cyRef = useRef<any>(null)

  // Read incidents from store (reactive)
  const incidents = useStreamStore(s => s.incidents)

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

  // ── Apply Cytoscape class changes when health map changes ────────────────
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !topology) return

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

      // Highlight edges that connect affected services
      cy.edges().forEach((edge: any) => {
        const src = edge.source().id()
        const tgt = edge.target().id()
        edge.removeClass('affected')
        if (serviceHealthMap.has(src) || serviceHealthMap.has(tgt)) {
          edge.addClass('affected')
        }
      })
    })
  }, [serviceHealthMap, topology])

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

    // Show label on hover
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

    // Click — open drill-down for the incident that owns this node
    cy.on('tap', 'node', (evt: any) => {
      const nodeId = evt.target.id()
      // Find the incident that has this service
      const incidents = useStreamStore.getState().incidents
      let targetIncidentId: string | null = null
      incidents.forEach((incident) => {
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

  // ── Counts for legend labels ─────────────────────────────────────────────
  const rootCauseCount = [...serviceHealthMap.values()].filter(h => h.health === 'root-cause').length
  const degradedCount  = [...serviceHealthMap.values()].filter(h => h.health === 'degraded').length

  return (
    <div className="flex-shrink-0 bg-bg-surface border-b border-border select-none">
      {/* Section header / collapse toggle */}
      <div
        className="flex items-center justify-between px-4 h-[30px] cursor-pointer hover:bg-bg-elevated/40 transition-colors"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-3 h-3 text-text-muted transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
            fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          <span className="text-[10px] font-mono font-bold text-text-muted tracking-wider uppercase">
            Topology Health
          </span>
        </div>
        <div className="flex items-center gap-2 text-[9px] font-mono">
          {rootCauseCount > 0 && (
            <span className="text-severity-critical">{rootCauseCount} critical</span>
          )}
          {degradedCount > 0 && (
            <span className="text-severity-warning">{degradedCount} degraded</span>
          )}
          {rootCauseCount === 0 && degradedCount === 0 && (
            <span className="text-accent">all healthy</span>
          )}
        </div>
      </div>

      {/* Graph + legend */}
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
                {/* Node tooltip */}
                {hoveredNode && (
                  <div
                    className="absolute pointer-events-none z-10 px-2 py-1 rounded bg-bg-elevated border border-border text-[9px] font-mono text-text-primary shadow-elevated"
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

          {/* Legend */}
          <div className="flex items-center gap-4 px-4 py-1.5 text-[9px] font-mono text-text-muted">
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
