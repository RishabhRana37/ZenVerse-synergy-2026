/**
 * src/store/stream.ts — real-time stream state (Zustand)
 *
 * Structure:
 *   alerts        ring buffer, newest-first, capped at ALERT_CAP (500)
 *   alertIndex    Map<id, Alert> for O(1) dedup-count lookups
 *   incidents     Map<id, Incident> — in-place updates, stable IDs
 *   lastDiff      Map<incidentId, IncidentDiff> — diff from last incident.updated
 *                 (the animation layer will consume this to animate alerts flying into cards)
 *   stats         latest WsStats payload from server
 *   connection    'connecting' | 'open' | 'closed'
 *
 * Actions cover every WS_CONTRACT.md message type plus a snapshot replace.
 */

import { create } from 'zustand'
import type {
  Alert,
  Incident,
  WsStats,
  WsSnapshot,
  WsAlertBatch,
  WsAlertDedup,
  WsIncidentCreated,
  WsIncidentUpdated,
  WsIncidentSummary,
  IncidentDiff,
} from '@/lib/types'
import type { ConnectionStatus } from '@/lib/ws'

const ALERT_CAP = 500

// ── State shape ───────────────────────────────────────────────────────────
export interface StreamState {
  // Ring buffer: newest first, capped at ALERT_CAP
  alerts: Alert[]
  // Map for O(1) id-based dedup updates
  alertIndex: Map<string, Alert>
  // Incident map — stable IDs, in-place updates
  incidents: Map<string, Incident>
  // Latest added/removed diff per incident (for animation layer)
  lastDiff: Map<string, IncidentDiff>
  // Latest stats payload
  stats: WsStats | null
  // WS connection state
  connection: ConnectionStatus

  // ── Actions ──────────────────────────────────────────────────────────────
  applySnapshot:       (msg: WsSnapshot)        => void
  applyAlertBatch:     (msg: WsAlertBatch)      => void
  applyAlertDedup:     (msg: WsAlertDedup)      => void
  applyIncidentCreated:(msg: WsIncidentCreated) => void
  applyIncidentUpdated:(msg: WsIncidentUpdated) => void
  applyIncidentSummary:(msg: WsIncidentSummary) => void
  applyStats:          (msg: WsStats)           => void
  setConnection:       (status: ConnectionStatus) => void
  clearAllState:       () => void
}

// ── Store ─────────────────────────────────────────────────────────────────
export const useStreamStore = create<StreamState>((set) => ({
  alerts:     [],
  alertIndex: new Map(),
  incidents:  new Map(),
  lastDiff:   new Map(),
  stats:      null,
  connection: 'closed',

  // ── snapshot: replace all incidents + stats, refill alerts naturally ──
  applySnapshot: (msg) => {
    const incidents = new Map<string, Incident>()
    for (const inc of msg.incidents) {
      incidents.set(inc.id, inc)
    }

    // Build WsStats-shaped object from snapshot stats payload
    const stats: WsStats = {
      type: 'stats',
      ...msg.stats,
    }

    set({
      incidents,
      lastDiff: new Map(),
      stats,
      // Raw stream intentionally NOT cleared — refills naturally per §8 of contract
    })
  },

  // ── alert.batch: prepend to ring buffer, newest first ────────────────
  applyAlertBatch: (msg) => {
    set((state) => {
      const newAlertIndex = new Map(state.alertIndex)
      const incoming = msg.alerts.map((a) => {
        newAlertIndex.set(a.id, a)
        return a
      })
      // Prepend newest, trim to cap
      const newAlerts = [...incoming, ...state.alerts].slice(0, ALERT_CAP)
      return { alerts: newAlerts, alertIndex: newAlertIndex }
    })
  },

  // ── alert.dedup: update dup_count in-place in both buffer and index ──
  applyAlertDedup: (msg) => {
    set((state) => {
      const existing = state.alertIndex.get(msg.alert_id)
      if (!existing) return {}   // unknown id — ignore

      const updated: Alert = { ...existing, dup_count: msg.dup_count }
      const newAlertIndex = new Map(state.alertIndex)
      newAlertIndex.set(msg.alert_id, updated)

      // Also update in the ring buffer (may be present, may have scrolled off)
      const newAlerts = state.alerts.map((a) =>
        a.id === msg.alert_id ? updated : a,
      )
      return { alerts: newAlerts, alertIndex: newAlertIndex }
    })
  },

  // ── incident.created: add to map, record initial member_alert_ids as diff
  applyIncidentCreated: (msg) => {
    set((state) => {
      const newIncidents = new Map(state.incidents)
      newIncidents.set(msg.incident.id, msg.incident)

      const newDiff = new Map(state.lastDiff)
      newDiff.set(msg.incident.id, {
        added_alert_ids: msg.member_alert_ids,
        removed_alert_ids: [],
        at: Date.now(),
      })
      return { incidents: newIncidents, lastDiff: newDiff }
    })

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('stormlens-convergence', {
          detail: {
            incidentId: msg.incident.id,
            alertIds: msg.member_alert_ids,
            isNew: true,
          },
        })
      )
    }
  },

  // ── incident.updated: in-place update + record diff ──────────────────
  applyIncidentUpdated: (msg) => {
    set((state) => {
      const newIncidents = new Map(state.incidents)
      newIncidents.set(msg.incident.id, msg.incident)

      const newDiff = new Map(state.lastDiff)
      newDiff.set(msg.incident.id, {
        added_alert_ids: msg.added_alert_ids,
        removed_alert_ids: msg.removed_alert_ids,
        at: Date.now(),
      })
      return { incidents: newIncidents, lastDiff: newDiff }
    })

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('stormlens-convergence', {
          detail: {
            incidentId: msg.incident.id,
            alertIds: msg.added_alert_ids,
            isNew: false,
          },
        })
      )
    }
  },

  // ── incident.summary: patch summary + first_action + title onto incident
  applyIncidentSummary: (msg) => {
    set((state) => {
      const existing = state.incidents.get(msg.incident_id)
      if (!existing) return {}

      const newIncidents = new Map(state.incidents)
      newIncidents.set(msg.incident_id, {
        ...existing,
        title: msg.title,
        summary: msg.summary,
        first_action: msg.first_action,
      })
      return { incidents: newIncidents }
    })
  },

  // ── stats: replace latest payload ────────────────────────────────────
  applyStats: (msg) => {
    set({ stats: msg })
  },

  // ── connection status ─────────────────────────────────────────────────
  setConnection: (status) => set({ connection: status }),

  clearAllState: () => set({
    alerts: [],
    alertIndex: new Map(),
    incidents: new Map(),
    lastDiff: new Map(),
    stats: null,
  }),
}))

// ── Derived selectors ─────────────────────────────────────────────────────

/** Sorted incident list — active first, then by created_at desc */
export function selectIncidentList(state: StreamState): Incident[] {
  return [...state.incidents.values()].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'active' ? -1 : 1
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

/** Buffered alert count */
export function selectAlertCount(state: StreamState): number {
  return state.alerts.length
}
