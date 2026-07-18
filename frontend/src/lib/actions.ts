/**
 * actions.ts — operator REST actions against the incidents API.
 */

function apiBase(): string {
  return (import.meta.env.VITE_API_URL as string) || '/api'
}

export async function acknowledgeIncident(incidentId: string): Promise<void> {
  try {
    await fetch(`${apiBase()}/incidents/${incidentId}/acknowledge`, { method: 'POST' })
  } catch (err) {
    console.error('[actions] acknowledgeIncident failed:', err)
  }
}

export async function resolveIncident(incidentId: string): Promise<void> {
  try {
    await fetch(`${apiBase()}/incidents/${incidentId}/resolve`, { method: 'POST' })
  } catch (err) {
    console.error('[actions] resolveIncident failed:', err)
  }
}

export async function confirmRootCause(incidentId: string, alertId: string): Promise<void> {
  try {
    await fetch(`${apiBase()}/incidents/${incidentId}/confirm-root-cause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert_id: alertId }),
    })
  } catch (err) {
    console.error('[actions] confirmRootCause failed:', err)
  }
}
