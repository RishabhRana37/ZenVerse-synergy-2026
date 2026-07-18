/**
 * StormLens WebSocket client — src/lib/ws.ts
 *
 * Connects to ws://localhost:8787/ws/stream (override via VITE_WS_URL).
 * Auto-reconnects with exponential backoff: 500ms → doubles → 5s cap.
 * Routes each contract message type to the provided handler callbacks.
 *
 * Contract: docs/WS_CONTRACT.md
 *
 * Usage:
 *   const client = createWsClient(handlers)
 *   client.connect()
 *   // ...
 *   client.disconnect()
 */

import type {
  WsMessage,
  WsAlertBatch,
  WsAlertDedup,
  WsIncidentCreated,
  WsIncidentUpdated,
  WsIncidentSummary,
  WsStats,
  WsSnapshot,
} from '@/lib/types'

// ── Config ────────────────────────────────────────────────────────────────
const DEFAULT_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8787/ws/stream'
const BACKOFF_INITIAL_MS = 500
const BACKOFF_MAX_MS     = 5_000
const BACKOFF_FACTOR     = 2

// ── Handler map ───────────────────────────────────────────────────────────
export interface WsHandlers {
  onAlertBatch:       (msg: WsAlertBatch)       => void
  onAlertDedup:       (msg: WsAlertDedup)       => void
  onIncidentCreated:  (msg: WsIncidentCreated)  => void
  onIncidentUpdated:  (msg: WsIncidentUpdated)  => void
  onIncidentSummary:  (msg: WsIncidentSummary)  => void
  onStats:            (msg: WsStats)            => void
  onSnapshot:         (msg: WsSnapshot)         => void
  onConnectionChange: (status: ConnectionStatus) => void
}

export type ConnectionStatus = 'connecting' | 'open' | 'closed'

// ── Client interface ──────────────────────────────────────────────────────
export interface WsClient {
  connect:      () => void
  disconnect:   () => void
  getStatus:    () => ConnectionStatus
}

// ── Factory ───────────────────────────────────────────────────────────────
export function createWsClient(
  handlers: WsHandlers,
  url: string = DEFAULT_URL,
): WsClient {
  let ws: WebSocket | null = null
  let status: ConnectionStatus = 'closed'
  let shouldConnect = false
  let backoffMs = BACKOFF_INITIAL_MS
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function setStatus(s: ConnectionStatus) {
    status = s
    handlers.onConnectionChange(s)
  }

  function clearReconnect() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function scheduleReconnect() {
    if (!shouldConnect) return
    clearReconnect()
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      openSocket()
    }, backoffMs)
    backoffMs = Math.min(backoffMs * BACKOFF_FACTOR, BACKOFF_MAX_MS)
  }

  function openSocket() {
    if (!shouldConnect) return
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return

    setStatus('connecting')
    ws = new WebSocket(url)

    ws.onopen = () => {
      backoffMs = BACKOFF_INITIAL_MS   // reset backoff on successful connect
      setStatus('open')
    }

    ws.onclose = () => {
      ws = null
      setStatus('closed')
      scheduleReconnect()
    }

    ws.onerror = () => {
      // onclose always fires after onerror — reconnect logic there
    }

    ws.onmessage = (event: MessageEvent<string>) => {
      let msg: WsMessage
      try {
        msg = JSON.parse(event.data) as WsMessage
      } catch {
        console.warn('[ws] Failed to parse message:', event.data.slice(0, 200))
        return
      }
      dispatch(msg)
    }
  }

  function dispatch(msg: WsMessage) {
    switch (msg.type) {
      case 'alert.batch':        handlers.onAlertBatch(msg);       break
      case 'alert.dedup':        handlers.onAlertDedup(msg);       break
      case 'incident.created':   handlers.onIncidentCreated(msg);  break
      case 'incident.updated':   handlers.onIncidentUpdated(msg);  break
      case 'incident.summary':   handlers.onIncidentSummary(msg);  break
      case 'stats':              handlers.onStats(msg);            break
      case 'snapshot':           handlers.onSnapshot(msg);         break
      default:
        console.warn('[ws] Unknown message type:', (msg as { type: string }).type)
    }
  }

  return {
    connect() {
      shouldConnect = true
      openSocket()
    },
    disconnect() {
      shouldConnect = false
      clearReconnect()
      if (ws) {
        ws.close()
        ws = null
      }
      setStatus('closed')
    },
    getStatus() {
      return status
    },
  }
}
