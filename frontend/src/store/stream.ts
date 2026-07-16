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
  AuditEntry,
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
  // Audit log
  auditLog: AuditEntry[]
  unreadAuditCount: number

  // ── Actions ──────────────────────────────────────────────────────────────
  applySnapshot:       (msg: WsSnapshot)        => void
  applyAlertBatch:     (msg: WsAlertBatch)      => void
  applyAlertDedup:     (msg: WsAlertDedup)      => void
  applyIncidentCreated:(msg: WsIncidentCreated) => void
  applyIncidentUpdated:(msg: WsIncidentUpdated) => void
  applyIncidentSummary:(msg: WsIncidentSummary) => void
  applyStats:          (msg: WsStats)           => void
  setConnection:       (status: ConnectionStatus) => void
  addAuditLogEntry:    (entry: Omit<AuditEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: string }) => void
  clearUnreadAuditCount: () => void
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
  auditLog:   [],
  unreadAuditCount: 0,

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

    set((state) => {
      const prevRunning = state.stats?.replay?.running
      const nextRunning = stats.replay?.running
      let newAuditLog = state.auditLog
      let newUnreadCount = state.unreadAuditCount

      if (prevRunning !== nextRunning && nextRunning !== undefined) {
        const entry: AuditEntry = {
          id: `audit-${Date.now()}-${Math.random()}`,
          timestamp: new Date().toISOString(),
          type: nextRunning ? 'replay_started' : 'replay_stopped',
          message: nextRunning
            ? `Replay started: dataset "${stats.replay.dataset}" at speed ${stats.replay.speed}x`
            : 'Replay stopped',
        }
        newAuditLog = [entry, ...state.auditLog].slice(0, 100)
        newUnreadCount += 1
      }

      return {
        incidents,
        lastDiff: new Map(),
        stats,
        auditLog: newAuditLog,
        unreadAuditCount: newUnreadCount,
      }
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

      const entry: AuditEntry = {
        id: `audit-${Date.now()}-${Math.random()}`,
        timestamp: new Date().toISOString(),
        type: 'incident_created',
        message: `Incident created: "${msg.incident.title}" (${msg.member_alert_ids.length} alerts)`,
        incidentId: msg.incident.id,
      }
      const newAuditLog = [entry, ...state.auditLog].slice(0, 100)

      return {
        incidents: newIncidents,
        lastDiff: newDiff,
        auditLog: newAuditLog,
        unreadAuditCount: state.unreadAuditCount + 1,
      }
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
    set((state) => {
      const prevRunning = state.stats?.replay?.running
      const nextRunning = msg.replay?.running
      let newAuditLog = state.auditLog
      let newUnreadCount = state.unreadAuditCount

      if (prevRunning !== nextRunning && nextRunning !== undefined) {
        const entry: AuditEntry = {
          id: `audit-${Date.now()}-${Math.random()}`,
          timestamp: new Date().toISOString(),
          type: nextRunning ? 'replay_started' : 'replay_stopped',
          message: nextRunning
            ? `Replay started: dataset "${msg.replay.dataset}" at speed ${msg.replay.speed}x`
            : 'Replay stopped',
        }
        newAuditLog = [entry, ...state.auditLog].slice(0, 100)
        newUnreadCount += 1
      }

      return {
        stats: msg,
        auditLog: newAuditLog,
        unreadAuditCount: newUnreadCount,
      }
    })
  },

  // ── connection status ─────────────────────────────────────────────────
  setConnection: (status) => set({ connection: status }),

  // ── add audit log entry manually ──────────────────────────────────────
  addAuditLogEntry: (entry) => {
    set((state) => {
      const fullEntry: AuditEntry = {
        id: entry.id || `audit-${Date.now()}-${Math.random()}`,
        timestamp: entry.timestamp || new Date().toISOString(),
        type: entry.type,
        message: entry.message,
        incidentId: entry.incidentId,
      }
      return {
        auditLog: [fullEntry, ...state.auditLog].slice(0, 100),
        unreadAuditCount: state.unreadAuditCount + 1,
      }
    })
  },

  clearUnreadAuditCount: () => set({ unreadAuditCount: 0 }),

  clearAllState: () => set({
    alerts: [],
    alertIndex: new Map(),
    incidents: new Map(),
    lastDiff: new Map(),
    stats: null,
    auditLog: [],
    unreadAuditCount: 0,
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
