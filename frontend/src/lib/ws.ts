/**
 * ws.ts — WebSocket client for /ws/stream. Dispatches parsed messages to
 * per-type handlers (contract: docs/WS_CONTRACT.md). Auto-reconnects on drop.
 */

import type {
  WsSnapshot,
  WsAlertBatch,
  WsAlertDedup,
  WsIncidentCreated,
  WsIncidentUpdated,
  WsIncidentSummary,
  WsStats,
} from '@/lib/types'

export type ConnectionStatus = 'connecting' | 'open' | 'closed'

interface WsClientHandlers {
  onSnapshot: (msg: WsSnapshot) => void
  onAlertBatch: (msg: WsAlertBatch) => void
  onAlertDedup: (msg: WsAlertDedup) => void
  onIncidentCreated: (msg: WsIncidentCreated) => void
  onIncidentUpdated: (msg: WsIncidentUpdated) => void
  onIncidentSummary: (msg: WsIncidentSummary) => void
  onStats: (msg: WsStats) => void
  onConnectionChange: (status: ConnectionStatus) => void
}

const RECONNECT_DELAY_MS = 1500

function resolveWsUrl(): string {
  const override = import.meta.env.VITE_WS_URL as string | undefined
  if (override) return override
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/stream`
}

export function createWsClient(handlers: WsClientHandlers) {
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let closedByCaller = false

  function handleMessage(event: MessageEvent) {
    let msg: { type: string; [key: string]: unknown }
    try {
      msg = JSON.parse(event.data)
    } catch {
      return
    }

    switch (msg.type) {
      case 'snapshot':
        handlers.onSnapshot(msg as unknown as WsSnapshot)
        break
      case 'alert.batch':
        handlers.onAlertBatch(msg as unknown as WsAlertBatch)
        break
      case 'alert.dedup':
        handlers.onAlertDedup(msg as unknown as WsAlertDedup)
        break
      case 'incident.created':
        handlers.onIncidentCreated(msg as unknown as WsIncidentCreated)
        break
      case 'incident.updated':
        handlers.onIncidentUpdated(msg as unknown as WsIncidentUpdated)
        break
      case 'incident.summary':
        handlers.onIncidentSummary(msg as unknown as WsIncidentSummary)
        break
      case 'stats':
        handlers.onStats(msg as unknown as WsStats)
        break
    }
  }

  function open() {
    if (closedByCaller) return
    handlers.onConnectionChange('connecting')
    socket = new WebSocket(resolveWsUrl())

    socket.onopen = () => handlers.onConnectionChange('open')
    socket.onmessage = handleMessage
    socket.onerror = () => socket?.close()
    socket.onclose = () => {
      handlers.onConnectionChange('closed')
      if (!closedByCaller) {
        reconnectTimer = setTimeout(open, RECONNECT_DELAY_MS)
      }
    }
  }

  return {
    connect() {
      closedByCaller = false
      open()
    },
    disconnect() {
      closedByCaller = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
      socket = null
    },
  }
}
