import { useStreamStore } from '@/store/stream'

/**
 * Acknowledge an active incident. Sets acknowledged status and adds an audit trail.
 */
export function acknowledgeIncident(incidentId: string) {
  const store = useStreamStore.getState()
  const inc = store.incidents.get(incidentId)
  if (!inc || inc.acknowledged) return

  const updated = {
    ...inc,
    acknowledged: true,
    acknowledged_by: 'you',
  }

  const newIncidents = new Map(store.incidents)
  newIncidents.set(incidentId, updated)

  store.addAuditLogEntry({
    type: 'incident_acknowledged',
    message: `Incident acknowledged: "${inc.title}" by you`,
    incidentId,
  })

  useStreamStore.setState({ incidents: newIncidents })
}

/**
 * Resolve an active incident. Changes status, sets timestamp, decrements active stats count, and logs audit entry.
 */
export function resolveIncident(incidentId: string) {
  const store = useStreamStore.getState()
  const inc = store.incidents.get(incidentId)
  if (!inc || inc.status === 'resolved') return

  const updated = {
    ...inc,
    status: 'resolved' as const,
    resolved_at: new Date().toISOString(),
  }

  const newIncidents = new Map(store.incidents)
  newIncidents.set(incidentId, updated)

  // Autoratively decrement the active incident stats locally
  const newStats = store.stats
    ? {
        ...store.stats,
        active_incidents: Math.max(0, store.stats.active_incidents - 1),
      }
    : null

  store.addAuditLogEntry({
    type: 'incident_resolved',
    message: `Incident resolved: "${inc.title}" (${inc.alert_count} alerts)`,
    incidentId,
  })

  useStreamStore.setState({
    incidents: newIncidents,
    stats: newStats,
  })
}

/**
 * Confirm root-cause candidate. Swaps chosen candidate to rank #1, sets confidence to 100%, and dispatches toast and audit trail.
 */
export function confirmRootCause(incidentId: string, alertId: string) {
  const store = useStreamStore.getState()
  const inc = store.incidents.get(incidentId)
  if (!inc) return

  const candidates = [...inc.root_candidates]
  const candidateIndex = candidates.findIndex((c) => c.alert_id === alertId)
  if (candidateIndex === -1) return

  const candidate = candidates[candidateIndex]
  const updatedCandidate = {
    ...candidate,
    confidence: 1.0,
    is_confirmed: true,
  }

  // Remove from old position and prepend to index 0
  candidates.splice(candidateIndex, 1)
  candidates.unshift(updatedCandidate)

  const updated = {
    ...inc,
    root_candidates: candidates,
    feedback_root_cause: alertId,
  }

  const newIncidents = new Map(store.incidents)
  newIncidents.set(incidentId, updated)

  // Dispatch toast custom event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('stormlens-toast', {
        detail: {
          message: `Feedback recorded — root cause confirmed: ${candidate.service}`,
        },
      })
    )
  }

  store.addAuditLogEntry({
    type: 'root_cause_confirmed',
    message: `Confirmed root cause for "${inc.title}": ${candidate.service}`,
    incidentId,
  })

  useStreamStore.setState({ incidents: newIncidents })
}

/**
 * Start scenario replay.
 */
export async function startReplay(scenario = 'db-cascade', speed = 1) {
  try {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8788'
    await fetch(`${apiBase}/replay/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, speed }),
    })
  } catch (err) {
    console.error('[actions] Failed to start replay:', err)
  }
}

/**
 * Stop active replay.
 */
export async function stopReplay() {
  try {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8788'
    await fetch(`${apiBase}/replay/stop`, { method: 'POST' })
  } catch (err) {
    console.error('[actions] Failed to stop replay:', err)
  }
}

/**
 * Reset scenario and store state.
 */
export async function resetReplay(scenario = 'db-cascade', speed = 1) {
  try {
    await stopReplay()
    const store = useStreamStore.getState()
    store.clearAllState()
    setTimeout(() => {
      startReplay(scenario, speed).catch((err) =>
        console.error('[actions] Failed to restart replay after reset:', err)
      )
    }, 300)
  } catch (err) {
    console.error('[actions] Failed to reset replay:', err)
  }
}

