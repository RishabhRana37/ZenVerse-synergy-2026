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
 * Time Machine addition:
 *   journal       append-only event log of all incoming WS messages since replay start,
 *                 capped at 5,000 events.
 *   baselineTime  unix timestamp when the replay started (used for relative time offsets).
 *   scrubMode     boolean indicating if review mode is active.
 *   scrubTime     current playhead position in relative seconds.
 *   scrubState    reconstructed state corresponding to scrubTime.
 *   newIncidentsCount  count of new incidents created since scrubbing began.
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

export interface JournalEvent {
  type: 'alert.batch' | 'alert.dedup' | 'incident.created' | 'incident.updated' | 'incident.summary' | 'stats' | 'snapshot'
  timestamp: number
  relativeTime: number
  data: any
}

export interface ReconstructedState {
  alerts: Alert[]
  alertIndex: Map<string, Alert>
  incidents: Map<string, Incident>
  stats: WsStats | null
  lastDiff: Map<string, IncidentDiff>
}

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

  // ── Time Machine State ───────────────────────────────────────────────────
  journal: JournalEvent[]
  baselineTime: number | null
  scrubMode: boolean
  scrubTime: number // relative seconds
  scrubState: ReconstructedState | null
  newIncidentsCount: number
  scrubPosition: number | null

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

  // ── Scrubbing Actions ────────────────────────────────────────────────────
  startScrubbing:      (t: number)              => void
  updateScrubbing:     (t: number)              => void
  stopScrubbing:       () => void
  setScrubPosition:    (pos: number | null)     => void

  // ── Global UI Settings ───────────────────────────────────────────────────
  view: 'stream' | 'lens'
  setView: (v: 'stream' | 'lens') => void
  showIntro: boolean
  setShowIntro: (show: boolean) => void
}

// ── Helper: Record event in journal ───────────────────────────────────────
function recordJournalEvent(state: StreamState, type: JournalEvent['type'], data: any) {
  const now = Date.now()
  let baseline = state.baselineTime
  if (baseline === null) {
    baseline = now
  }
  const relativeTime = (now - baseline) / 1000

  // Track incidents created during review
  let newIncidentsCount = state.newIncidentsCount
  if (state.scrubMode && type === 'incident.created') {
    newIncidentsCount += 1
  }

  const newEvent: JournalEvent = {
    type,
    timestamp: now,
    relativeTime,
    data,
  }

  const journal = [...state.journal, newEvent]
  if (journal.length > 5000) {
    journal.shift()
  }

  return {
    baselineTime: baseline,
    journal,
    newIncidentsCount,
  }
}

// ── Binary Search for relativeTime ────────────────────────────────────────
function findLastEventIndexBefore(journal: JournalEvent[], t: number): number {
  let low = 0
  let high = journal.length - 1
  let result = -1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (journal[mid].relativeTime <= t) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return result
}

// ── Pure State Reconstruction ──────────────────────────────────────────────
export function reconstructAt(journal: JournalEvent[], t: number): ReconstructedState {
  const alerts: Alert[] = []
  const alertIndex = new Map<string, Alert>()
  const incidents = new Map<string, Incident>()
  const lastDiff = new Map<string, IncidentDiff>()
  let stats: WsStats | null = null

  const lastIdx = findLastEventIndexBefore(journal, t)
  if (lastIdx === -1) {
    return { alerts, alertIndex, incidents, stats, lastDiff }
  }

  // Optimized replay loop using shallow copies for speed (runs in < 1ms)
  for (let i = 0; i <= lastIdx; i++) {
    const event = journal[i]
    const msg = event.data

    switch (event.type) {
      case 'snapshot': {
        incidents.clear()
        lastDiff.clear()
        for (const inc of msg.incidents) {
          incidents.set(inc.id, { ...inc })
        }
        stats = {
          type: 'stats',
          ...msg.stats,
        }
        break
      }

      case 'alert.batch': {
        const incoming = msg.alerts.map((a: Alert) => {
          const clone = { ...a }
          alertIndex.set(clone.id, clone)
          return clone
        })
        alerts.unshift(...incoming.reverse())
        if (alerts.length > ALERT_CAP) {
          alerts.length = ALERT_CAP
        }
        break
      }

      case 'alert.dedup': {
        const existing = alertIndex.get(msg.alert_id)
        if (existing) {
          const updated = { ...existing, dup_count: msg.dup_count }
          alertIndex.set(msg.alert_id, updated)
        }
        break
      }

      case 'incident.created': {
        const incClone = { ...msg.incident }
        incidents.set(incClone.id, incClone)
        lastDiff.set(incClone.id, {
          added_alert_ids: msg.member_alert_ids,
          removed_alert_ids: [],
          at: event.timestamp,
        })
        msg.member_alert_ids.forEach((id: string) => {
          const a = alertIndex.get(id)
          if (a) {
            alertIndex.set(id, { ...a, cluster_id: incClone.id })
          }
        })
        break
      }

      case 'incident.updated': {
        const incClone = { ...msg.incident }
        incidents.set(incClone.id, incClone)
        lastDiff.set(incClone.id, {
          added_alert_ids: msg.added_alert_ids,
          removed_alert_ids: msg.removed_alert_ids,
          at: event.timestamp,
        })
        msg.added_alert_ids.forEach((id: string) => {
          const a = alertIndex.get(id)
          if (a) {
            alertIndex.set(id, { ...a, cluster_id: incClone.id })
          }
        })
        msg.removed_alert_ids.forEach((id: string) => {
          const a = alertIndex.get(id)
          if (a) {
            alertIndex.set(id, { ...a, cluster_id: null })
          }
        })
        break
      }

      case 'incident.summary': {
        const existing = incidents.get(msg.incident_id)
        if (existing) {
          incidents.set(msg.incident_id, {
            ...existing,
            title: msg.title,
            summary: msg.summary,
            first_action: msg.first_action,
          })
        }
        break
      }

      case 'stats': {
        stats = msg
        break
      }
    }
  }

  // Align active alerts in the ring buffer array with their reconstructed properties
  const syncedAlerts = alerts.map((a) => {
    const indexed = alertIndex.get(a.id)
    return indexed ? { ...a, cluster_id: indexed.cluster_id, dup_count: indexed.dup_count } : a
  })

  return {
    alerts: syncedAlerts,
    alertIndex,
    incidents,
    stats,
    lastDiff,
  }
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

  // Time Machine initial state
  journal: [],
  baselineTime: null,
  scrubMode: false,
  scrubTime: 0,
  scrubState: null,
  newIncidentsCount: 0,
  scrubPosition: null,

  // Global UI settings initial state
  view: 'stream',
  showIntro: (() => {
    try {
      return typeof window !== 'undefined' && sessionStorage.getItem('intro_seen') !== 'true'
    } catch {
      return true
    }
  })(),

  // ── snapshot: replace all incidents + stats, refill alerts naturally ──
  applySnapshot: (msg) => {
    const incidents = new Map<string, Incident>()
    for (const inc of msg.incidents) {
      incidents.set(inc.id, inc)
    }

    const stats: WsStats = {
      type: 'stats',
      ...msg.stats,
    }

    set((state) => {
      const now = Date.now()
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

      // Snapshot establishes baseline relative time (t = 0)
      const snapshotEvent: JournalEvent = {
        type: 'snapshot',
        timestamp: now,
        relativeTime: 0,
        data: msg,
      }

      return {
        incidents,
        lastDiff: new Map(),
        stats,
        auditLog: newAuditLog,
        unreadAuditCount: newUnreadCount,
        // Reset Time Machine on snapshot
        baselineTime: now,
        journal: [snapshotEvent],
        newIncidentsCount: 0,
      }
    })
  },

  // ── alert.batch: prepend to ring buffer, newest first ────────────────
  applyAlertBatch: (msg) => {
    if (typeof window !== 'undefined' && msg.alerts.length > 0) {
      // Dispatch events for toast notifications, capped to at most 3 from this batch
      const maxToasts = 3
      msg.alerts.slice(0, maxToasts).forEach((alert) => {
        window.dispatchEvent(
          new CustomEvent('stormlens-new-alert', {
            detail: alert
          })
        )
      })
    }

    set((state) => {
      const journalUpdates = recordJournalEvent(state, 'alert.batch', msg)
      const newAlertIndex = new Map(state.alertIndex)
      const incoming = msg.alerts.map((a) => {
        newAlertIndex.set(a.id, a)
        return a
      })
      const newAlerts = [...incoming, ...state.alerts].slice(0, ALERT_CAP)
      
      return {
        ...journalUpdates,
        alerts: newAlerts,
        alertIndex: newAlertIndex,
      }
    })
  },

  // ── alert.dedup: update dup_count in-place in both buffer and index ──
  applyAlertDedup: (msg) => {
    set((state) => {
      const journalUpdates = recordJournalEvent(state, 'alert.dedup', msg)
      const existing = state.alertIndex.get(msg.alert_id)
      if (!existing) return { ...journalUpdates }

      const updated: Alert = { ...existing, dup_count: msg.dup_count }
      const newAlertIndex = new Map(state.alertIndex)
      newAlertIndex.set(msg.alert_id, updated)

      const newAlerts = state.alerts.map((a) =>
        a.id === msg.alert_id ? updated : a,
      )
      
      return {
        ...journalUpdates,
        alerts: newAlerts,
        alertIndex: newAlertIndex,
      }
    })
  },

  // ── incident.created: add to map, record initial member_alert_ids as diff
  applyIncidentCreated: (msg) => {
    set((state) => {
      const journalUpdates = recordJournalEvent(state, 'incident.created', msg)
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
        ...journalUpdates,
        incidents: newIncidents,
        lastDiff: newDiff,
        auditLog: newAuditLog,
        unreadAuditCount: state.unreadAuditCount + 1,
      }
    })

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('stormlens-incident-born', {
          detail: {
            incident: msg.incident,
            memberAlertIds: msg.member_alert_ids,
          },
        })
      )
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
      const journalUpdates = recordJournalEvent(state, 'incident.updated', msg)
      const newIncidents = new Map(state.incidents)
      newIncidents.set(msg.incident.id, msg.incident)

      const newDiff = new Map(state.lastDiff)
      newDiff.set(msg.incident.id, {
        added_alert_ids: msg.added_alert_ids,
        removed_alert_ids: msg.removed_alert_ids,
        at: Date.now(),
      })
      return {
        ...journalUpdates,
        incidents: newIncidents,
        lastDiff: newDiff,
      }
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
      const journalUpdates = recordJournalEvent(state, 'incident.summary', msg)
      const existing = state.incidents.get(msg.incident_id)
      if (!existing) return { ...journalUpdates }

      const newIncidents = new Map(state.incidents)
      newIncidents.set(msg.incident_id, {
        ...existing,
        title: msg.title,
        summary: msg.summary,
        first_action: msg.first_action,
      })
      return {
        ...journalUpdates,
        incidents: newIncidents,
      }
    })
  },

  // ── stats: replace latest payload ────────────────────────────────────
  applyStats: (msg) => {
    set((state) => {
      const journalUpdates = recordJournalEvent(state, 'stats', msg)
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
        ...journalUpdates,
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
    // Reset Time Machine state
    journal: [],
    baselineTime: null,
    scrubMode: false,
    scrubTime: 0,
    scrubState: null,
    newIncidentsCount: 0,
  }),

  // ── Scrubbing Actions ────────────────────────────────────────────────────
  startScrubbing: (t) => {
    set((state) => {
      const scrubState = reconstructAt(state.journal, t)
      return {
        scrubMode: true,
        scrubTime: t,
        scrubState,
        newIncidentsCount: 0,
      }
    })
  },

  updateScrubbing: (t) => {
    set((state) => {
      const scrubState = reconstructAt(state.journal, t)
      return {
        scrubTime: t,
        scrubState,
      }
    })
  },

  stopScrubbing: () => {
    set({
      scrubMode: false,
      scrubTime: 0,
      scrubState: null,
      newIncidentsCount: 0,
      scrubPosition: null,
    })
  },

  setScrubPosition: (pos) => {
    set({ scrubPosition: pos })
  },

  setView: (v) => set({ view: v }),
  setShowIntro: (show) => set({ showIntro: show }),
}))

// ── Derived selectors ─────────────────────────────────────────────────────

/** Active incidents list sorted - active first, then by created_at desc */
export function selectIncidentList(state: StreamState): Incident[] {
  const activeIncidents = state.scrubMode && state.scrubState ? state.scrubState.incidents : state.incidents
  return [...activeIncidents.values()].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'active' ? -1 : 1
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

/** Active buffered alert count */
export function selectAlertCount(state: StreamState): number {
  const activeAlerts = state.scrubMode && state.scrubState ? state.scrubState.alerts : state.alerts
  return activeAlerts.length
}
