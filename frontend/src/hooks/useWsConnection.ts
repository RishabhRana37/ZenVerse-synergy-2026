/**
 * useWsConnection — initializes the WS client once, wires all message handlers
 * to stream store actions. Call once in the app root.
 *
 * Reconnect on mount, disconnect on unmount. Snapshot on reconnect automatically
 * replaces incidents (per WS_CONTRACT.md §8).
 */

import { useEffect } from 'react'
import { createWsClient } from '@/lib/ws'
import { useStreamStore } from '@/store/stream'

export function useWsConnection() {
  useEffect(() => {
    const client = createWsClient({
      onAlertBatch:       (msg) => useStreamStore.getState().applyAlertBatch(msg),
      onAlertDedup:       (msg) => useStreamStore.getState().applyAlertDedup(msg),
      onIncidentCreated:  (msg) => useStreamStore.getState().applyIncidentCreated(msg),
      onIncidentUpdated:  (msg) => useStreamStore.getState().applyIncidentUpdated(msg),
      onIncidentSummary:  (msg) => useStreamStore.getState().applyIncidentSummary(msg),
      onStats:            (msg) => useStreamStore.getState().applyStats(msg),
      onSnapshot:         (msg) => useStreamStore.getState().applySnapshot(msg),
      onConnectionChange: (s)   => useStreamStore.getState().setConnection(s),
    })

    client.connect()
    return () => client.disconnect()
  }, [])
}
