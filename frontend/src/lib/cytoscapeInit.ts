/**
 * cytoscapeInit.ts — Shared Cytoscape plugin registration.
 *
 * Call this ONCE at app startup or import it before any CytoscapeComponent use.
 * Prevents "Cannot re-register plugin" console warnings when multiple components
 * import and call cytoscape.use(dagre).
 */
import cytoscape from 'cytoscape'
// @ts-ignore
import dagre from 'cytoscape-dagre'

let registered = false

export function registerCytoscapePlugins() {
  if (registered) return
  registered = true
  try {
    cytoscape.use(dagre)
  } catch {
    // Already registered — safe to ignore
  }
}

// Auto-register on import
registerCytoscapePlugins()
