import { useStreamStore } from '@/store/stream'

function apiBase(): string {
  return (import.meta.env.VITE_API_URL as string) || '/api'
}

// Dataset filename -> topology scenario name. Only aiops-scn1 differs (the
// dataset is named after the specific labeled run, the topology YAML after
// the general trace-derived scenario); the three synthetic ones share a name.
// Sending scenario without a matching dataset (or vice versa) loads the
// wrong topology against the wrong alert data.
const SCENARIO_FOR_DATASET: Record<string, string> = {
  'aiops-scn1': 'aiops',
  'db-cascade': 'db-cascade',
  'network-partition': 'network-partition',
  'rolling-deploy': 'rolling-deploy',
}

/**
 * Acknowledge an active incident. Optimistically updates local state for a
 * snappy UI, and persists to the backend (source of truth — other clients
 * and the next WS broadcast need this) via POST /incidents/{id}/acknowledge.
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

  fetch(`${apiBase()}/incidents/${incidentId}/acknowledge`, { method: 'POST' }).catch((err) =>
    console.error('[actions] acknowledgeIncident failed to persist:', err)
  )
}

/**
 * Resolve an active incident. Optimistically updates local state and
 * persists to the backend via POST /incidents/{id}/resolve.
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

  fetch(`${apiBase()}/incidents/${incidentId}/resolve`, { method: 'POST' }).catch((err) =>
    console.error('[actions] resolveIncident failed to persist:', err)
  )
}

/**
 * Confirm root-cause candidate. Client-side only — the backend has no
 * confirm-root-cause endpoint (this is operator feedback for the demo's
 * "the system learns" story, not yet persisted server-side).
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

  candidates.splice(candidateIndex, 1)
  candidates.unshift(updatedCandidate)

  const updated = {
    ...inc,
    root_candidates: candidates,
    feedback_root_cause: alertId,
  }

  const newIncidents = new Map(store.incidents)
  newIncidents.set(incidentId, updated)

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
 * Start scenario replay. `dataset` is the .jsonl file to replay; the
 * matching topology scenario is resolved via SCENARIO_FOR_DATASET so the
 * two are never sent out of sync (sending only `scenario` left the backend
 * defaulting dataset to aiops-scn1 regardless of what was actually selected).
 */
export async function startReplay(dataset = 'db-cascade', speed = 1) {
  try {
    await fetch(`${apiBase()}/replay/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dataset,
        scenario: SCENARIO_FOR_DATASET[dataset] ?? dataset,
        speed,
      }),
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
    await fetch(`${apiBase()}/replay/stop`, { method: 'POST' })
  } catch (err) {
    console.error('[actions] Failed to stop replay:', err)
  }
}

/**
 * Reset scenario and store state.
 */
export async function resetReplay(dataset = 'db-cascade', speed = 1) {
  try {
    await stopReplay()
    const store = useStreamStore.getState()
    store.clearAllState()
    setTimeout(() => {
      startReplay(dataset, speed).catch((err) =>
        console.error('[actions] Failed to restart replay after reset:', err)
      )
    }, 300)
  } catch (err) {
    console.error('[actions] Failed to reset replay:', err)
  }
}

/**
 * Resolve all active incidents at once. Optimistically updates local state
 * and persists to the backend for each active incident.
 */
export function resolveAllIncidents() {
  const store = useStreamStore.getState()
  const activeIncidents = Array.from(store.incidents.values()).filter(
    (inc) => inc.status !== 'resolved'
  )
  if (activeIncidents.length === 0) return

  const newIncidents = new Map(store.incidents)
  activeIncidents.forEach((inc) => {
    const updated = {
      ...inc,
      status: 'resolved' as const,
      resolved_at: new Date().toISOString(),
    }
    newIncidents.set(inc.id, updated)

    store.addAuditLogEntry({
      type: 'incident_resolved',
      message: `Incident resolved: "${inc.title}" (${inc.alert_count} alerts)`,
      incidentId: inc.id,
    })

    fetch(`${apiBase()}/incidents/${inc.id}/resolve`, { method: 'POST' }).catch((err) =>
      console.error('[actions] resolveIncident failed to persist:', err)
    )
  })

  const newStats = store.stats
    ? {
        ...store.stats,
        active_incidents: Math.max(0, store.stats.active_incidents - activeIncidents.length),
      }
    : null

  useStreamStore.setState({
    incidents: newIncidents,
    stats: newStats,
  })
}
