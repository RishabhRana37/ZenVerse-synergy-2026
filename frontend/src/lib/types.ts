/**
 * types.ts — canonical frontend types, mirroring docs/WS_CONTRACT.md.
 */

export type Severity = 'critical' | 'warning' | 'info'
export type IncidentStatus = 'active' | 'resolved'

export interface Alert {
  id: string
  ts: string
  source?: string
  host: string | null
  service: string | null
  severity: Severity
  message: string
  template?: string
  dup_count: number
  cluster_id: string | null
}

export interface RootCandidate {
  alert_id: string
  service: string
  template: string
  score?: number
  confidence: number
  is_confirmed?: boolean
}

export interface Incident {
  id: string
  created_at: string
  updated_at: string
  resolved_at?: string | null
  status: IncidentStatus
  acknowledged: boolean
  title: string
  alert_count: number
  unique_count: number
  services: string[]
  root_candidates: RootCandidate[]
  sparkline: number[]
  summary: string | null
  first_action: string | null
}

export interface ReplayStateWs {
  running: boolean
  dataset?: string
  scenario?: string
  speed?: number
  progress?: number
}

export interface WsStats {
  type: 'stats'
  total_alerts: number
  unique_alerts: number
  active_incidents: number
  unclustered: number
  compression_ratio: number
  alerts_per_sec: number
  replay: ReplayStateWs
}

export interface WsSnapshot {
  type: 'snapshot'
  incidents: Incident[]
  stats: Omit<WsStats, 'type'>
}

export interface WsAlertBatch {
  type: 'alert.batch'
  alerts: Alert[]
}

export interface WsAlertDedup {
  type: 'alert.dedup'
  alert_id: string
  dup_count: number
}

export interface WsIncidentCreated {
  type: 'incident.created'
  incident: Incident
  member_alert_ids: string[]
}

export interface WsIncidentUpdated {
  type: 'incident.updated'
  incident: Incident
  added_alert_ids: string[]
  removed_alert_ids: string[]
}

export interface WsIncidentSummary {
  type: 'incident.summary'
  incident_id: string
  title: string
  summary: string
  first_action: string
  generated_by?: 'llm' | 'template'
}

export interface IncidentDiff {
  added_alert_ids: string[]
  removed_alert_ids: string[]
  at: number
}

export interface AuditEntry {
  id: string
  timestamp: string
  type: string
  message: string
  incidentId?: string
}

export interface ReplayState {
  status: 'idle' | 'running' | 'stopped'
  speed: number
  elapsed_alerts: number
  total_alerts: number
}

export interface LiveStats {
  total_alerts: number
  incident_count: number
  suppression_pct: number
  alerts_per_sec: number
}
