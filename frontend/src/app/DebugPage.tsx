/**
 * DebugPage — /debug route.
 * Plain-text/pre view showing live stream state. No styling effort.
 * Used to verify: connection, alert count climbing, 3 incidents appearing,
 * dedup counts rising, stats ticking, summaries arriving.
 */

import { useStreamStore, selectIncidentList } from '@/store/stream'

export function DebugPage() {
  const connection = useStreamStore((s) => s.connection)
  const stats      = useStreamStore((s) => s.stats)
  const alertCount = useStreamStore((s) => s.alerts.length)
  const incidents  = useStreamStore(selectIncidentList)
  const lastDiff   = useStreamStore((s) => s.lastDiff)

  const connColor =
    connection === 'open'       ? '#2DD4A7' :
    connection === 'connecting' ? '#F5A623' : '#FF4D4F'

  return (
    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, padding: 16, backgroundColor: '#0A0E14', color: '#E6EDF3', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 16, marginBottom: 12, color: '#2DD4A7' }}>⚡ StormLens /debug</h1>

      {/* Connection */}
      <section style={{ marginBottom: 16 }}>
        <div style={{ color: '#8B98A9', marginBottom: 4 }}>── CONNECTION ──</div>
        <div>
          status: <span style={{ color: connColor, fontWeight: 'bold' }}>{connection}</span>
          {'  '}
          <span style={{ color: '#4D5866', fontSize: 11 }}>
            (kill mock server to test reconnect — should recover without page refresh)
          </span>
        </div>
      </section>

      {/* Stats */}
      <section style={{ marginBottom: 16 }}>
        <div style={{ color: '#8B98A9', marginBottom: 4 }}>── STATS (latest from server) ──</div>
        {stats ? (
          <pre style={{ margin: 0, color: '#E6EDF3' }}>
            {JSON.stringify({
              total_alerts:       stats.total_alerts,
              unique_alerts:      stats.unique_alerts,
              active_incidents:   stats.active_incidents,
              unclustered:        stats.unclustered,
              compression_ratio:  stats.compression_ratio,
              alerts_per_sec:     stats.alerts_per_sec,
              replay:             stats.replay,
            }, null, 2)}
          </pre>
        ) : (
          <span style={{ color: '#4D5866' }}>waiting for first stats tick…</span>
        )}
      </section>

      {/* Alert buffer */}
      <section style={{ marginBottom: 16 }}>
        <div style={{ color: '#8B98A9', marginBottom: 4 }}>── ALERT RING BUFFER ──</div>
        <div>
          buffered: <span style={{ color: '#E6EDF3', fontWeight: 'bold' }}>{alertCount}</span>
          <span style={{ color: '#4D5866' }}> / 500 cap (newest first, stream refills after reconnect)</span>
        </div>
      </section>

      {/* Incidents */}
      <section style={{ marginBottom: 16 }}>
        <div style={{ color: '#8B98A9', marginBottom: 4 }}>── INCIDENTS ({incidents.length}) ──</div>
        {incidents.length === 0 ? (
          <span style={{ color: '#4D5866' }}>none yet — watch for first at ~t=12s…</span>
        ) : incidents.map((inc) => {
          const diff = lastDiff.get(inc.id)
          const sevColor =
            inc.status === 'active' ? '#FF4D4F' : '#2DD4A7'
          return (
            <div key={inc.id} style={{ marginBottom: 12, borderLeft: `2px solid ${sevColor}`, paddingLeft: 8 }}>
              <div style={{ marginBottom: 2 }}>
                <span style={{ color: sevColor, fontWeight: 'bold' }}>[{inc.status.toUpperCase()}]</span>
                {' '}
                <span style={{ color: '#E6EDF3' }}>{inc.id}</span>
              </div>
              <div style={{ color: '#8B98A9' }}>title: {inc.title}</div>
              <div>
                alert_count: <span style={{ color: '#F5A623', fontWeight: 'bold' }}>{inc.alert_count}</span>
                {'  '}
                unique_count: <span style={{ color: '#F5A623' }}>{inc.unique_count}</span>
              </div>
              <div style={{ color: '#8B98A9' }}>
                services: [{inc.services.join(', ')}]
              </div>
              <div>
                root #1: <span style={{ color: '#2DD4A7' }}>{inc.root_candidates[0]?.service}</span>
                {' '}
                <span style={{ color: '#4D5866' }}>{((inc.root_candidates[0]?.confidence ?? 0) * 100).toFixed(0)}% conf</span>
              </div>
              {inc.summary ? (
                <div style={{ color: '#4D9FFF', marginTop: 2 }}>
                  summary: {inc.summary.slice(0, 80)}…
                </div>
              ) : (
                <div style={{ color: '#4D5866', marginTop: 2 }}>summary: (pending…)</div>
              )}
              {diff && (
                <div style={{ color: '#4D5866', fontSize: 11, marginTop: 2 }}>
                  last diff: +{diff.added_alert_ids.length} added, -{diff.removed_alert_ids.length} removed
                  {' '}at {new Date(diff.at).toISOString().slice(11, 23)}
                </div>
              )}
            </div>
          )
        })}
      </section>

      <div style={{ color: '#4D5866', fontSize: 11, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
        /debug — StormLens · Team ZenVerse · WS: {import.meta.env.VITE_WS_URL || 'ws://localhost:8787/ws/stream'}
      </div>
    </div>
  )
}
