/**
 * Global Zustand store — single source of truth for all real-time data.
 *
 * Design decisions:
 * - alerts[] is capped at MAX_ALERTS (500) for render performance.
 *   New alerts prepend; oldest drop from the tail.
 * - incidents[] uses upsert by ID — cards update in-place, never flicker.
 * - LiveStats derived on every mutation (cheap, avoids selectors).
 */

import { create } from 'zustand'
import type { Alert, Incident, LiveStats, ReplayState } from '@/lib/types'

const MAX_ALERTS = 500

// ── Rate tracking (alerts/sec) ────────────────────────────────────────────
const alertTimestamps: number[] = []

function recordAlert() {
  const now = Date.now()
  alertTimestamps.push(now)
  // Keep only last 10 seconds
  while (alertTimestamps.length > 0 && now - alertTimestamps[0]! > 10_000) {
    alertTimestamps.shift()
  }
}

function getAlertsPerSec(): number {
  const now = Date.now()
  const recent = alertTimestamps.filter(t => now - t < 1_000)
  return recent.length
}

// ── Derived stats ─────────────────────────────────────────────────────────
function deriveStats(state: Pick<StormState, 'totalAlertsReceived' | 'incidents'>): LiveStats {
  const incidentCount = state.incidents.filter(i => i.status === 'active').length
  const suppressionPct =
    state.totalAlertsReceived > 0
      ? Math.round(((state.totalAlertsReceived - incidentCount) / state.totalAlertsReceived) * 100)
      : 0

  return {
    total_alerts: state.totalAlertsReceived,
    incident_count: incidentCount,
    suppression_pct: Math.min(Math.max(suppressionPct, 0), 100),
    alerts_per_sec: getAlertsPerSec(),
  }
}

// ── State shape ───────────────────────────────────────────────────────────
interface StormState {
  // Raw alert stream (newest first, capped)
  alerts: Alert[]
  // Incident clusters (stable IDs, in-place updates)
  incidents: Incident[]
  // WebSocket connection status
  isConnected: boolean
  // Cumulative alert count (not capped — real total)
  totalAlertsReceived: number
  // Live derived stats
  stats: LiveStats
  // Replay / demo driver state
  replay: ReplayState

  // ── Actions ──────────────────────────────────────────────────────────
  addAlert: (alert: Alert) => void
  addAlerts: (alerts: Alert[]) => void
  upsertIncident: (incident: Incident) => void
  setConnected: (connected: boolean) => void
  setReplay: (replay: Partial<ReplayState>) => void
  resetStream: () => void
}

export const useStormStore = create<StormState>((set, get) => ({
  alerts: [],
  incidents: [],
  isConnected: false,
  totalAlertsReceived: 0,
  stats: {
    total_alerts: 0,
    incident_count: 0,
    suppression_pct: 0,
    alerts_per_sec: 0,
  },
  replay: {
    status: 'idle',
    speed: 10,
    elapsed_alerts: 0,
    total_alerts: 0,
  },

  addAlert: (alert) => {
    recordAlert()
    set((state) => {
      const newTotal = state.totalAlertsReceived + 1
      const newAlerts = [alert, ...state.alerts].slice(0, MAX_ALERTS)
      const newStats = deriveStats({ totalAlertsReceived: newTotal, incidents: state.incidents })
      return {
        alerts: newAlerts,
        totalAlertsReceived: newTotal,
        stats: newStats,
      }
    })
  },

  addAlerts: (alerts) => {
    alerts.forEach(recordAlert)
    set((state) => {
      const newTotal = state.totalAlertsReceived + alerts.length
      const newAlerts = [...alerts.reverse(), ...state.alerts].slice(0, MAX_ALERTS)
      const newStats = deriveStats({ totalAlertsReceived: newTotal, incidents: state.incidents })
      return {
        alerts: newAlerts,
        totalAlertsReceived: newTotal,
        stats: newStats,
      }
    })
  },

  upsertIncident: (incident) => {
    set((state) => {
      const idx = state.incidents.findIndex(i => i.id === incident.id)
      const newIncidents =
        idx >= 0
          ? state.incidents.map((i, n) => (n === idx ? incident : i))
          : [incident, ...state.incidents]
      const newStats = deriveStats({
        totalAlertsReceived: state.totalAlertsReceived,
        incidents: newIncidents,
      })
      return { incidents: newIncidents, stats: newStats }
    })
  },

  setConnected: (connected) => set({ isConnected: connected }),

  setReplay: (replay) =>
    set((state) => ({ replay: { ...state.replay, ...replay } })),

  resetStream: () => {
    alertTimestamps.length = 0
    set({
      alerts: [],
      incidents: [],
      totalAlertsReceived: 0,
      stats: { total_alerts: 0, incident_count: 0, suppression_pct: 0, alerts_per_sec: 0 },
      replay: { status: 'idle', speed: get().replay.speed, elapsed_alerts: 0, total_alerts: 0 },
    })
  },
}))
