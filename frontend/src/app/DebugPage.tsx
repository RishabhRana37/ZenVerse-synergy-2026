import { useStreamStore, selectIncidentList } from '@/store/stream'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CornerBrackets } from '@/components/ui/CornerBrackets'

export function DebugPage() {
  const connection = useStreamStore((s) => s.connection)
  const stats      = useStreamStore((s) => s.stats)
  const alertCount = useStreamStore((s) => s.alerts.length)
  const incidents  = useStreamStore(selectIncidentList)
  const lastDiff   = useStreamStore((s) => s.lastDiff)

  const connColor =
    connection === 'open'       ? 'text-accent' :
    connection === 'connecting' ? 'text-severity-warning' : 'text-severity-critical'

  return (
    <div className="w-full min-h-full bg-bg-base text-text-primary font-mono text-[12px] flex flex-col p-6 gap-6 select-text relative overflow-hidden">
      {/* Background lasers */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 opacity-40">
        <div className="absolute -top-[10%] left-[5%] w-[160px] h-[140%] bg-gradient-to-b from-[#FF2B2E]/0 via-[#FF2B2E]/18 to-[#FF2B2E]/0 rotate-[35deg] blur-[90px]" />
        <div className="absolute -top-[25%] left-[38%] w-[260px] h-[150%] bg-gradient-to-b from-[#FF2B2E]/0 via-[#FF2B2E]/25 to-[#FF4D4F]/8 rotate-[35deg] blur-[130px]" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-4 shrink-0 z-10">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[15px] font-bold text-accent flex items-center gap-1.5 uppercase tracking-wider font-sans">
            <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse-dot" />
            StormLens Diagnostics Console
          </h1>
          <span className="text-[10px] text-text-muted">Direct read-only buffer inspection</span>
        </div>
        <Link to="/">
          <Button variant="secondary" size="sm" className="font-mono text-[10px]">
            ← Return to War Room
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Left column: Connection & Stats */}
        <div className="flex flex-col gap-6">
          {/* Connection Card */}
          <Card className="p-5 flex flex-col gap-3 relative group/bracket bg-bg-surface/80 backdrop-blur-md z-10 border border-border/80 shadow-lg">
            <CornerBrackets />
            <div className="text-[10px] font-bold tracking-wider text-text-muted uppercase">
              ▎WebSocket Channel Status
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-[13px]">
                Status: <span className={`font-bold uppercase ${connColor}`}>{connection}</span>
              </div>
              <div className="text-[10px] text-text-muted leading-relaxed">
                To test reconnection resilience, kill the mock server process (`npm run mock`). The frontend will automatically recover and fetch logs when back online without needing page refresh.
              </div>
            </div>
          </Card>

          {/* Stats Card */}
          <Card className="p-5 flex flex-col gap-3 relative group/bracket bg-bg-surface/80 backdrop-blur-md z-10 border border-border/80 shadow-lg">
            <CornerBrackets />
            <div className="text-[10px] font-bold tracking-wider text-text-muted uppercase">
              ▎Latest Telemetry Metrics
            </div>
            {stats ? (
              <pre className="text-text-secondary leading-relaxed bg-bg-base/50 p-3 rounded border border-border/40 overflow-x-auto text-[11px]">
                {JSON.stringify(
                  {
                    total_alerts: stats.total_alerts,
                    unique_alerts: stats.unique_alerts,
                    active_incidents: stats.active_incidents,
                    unclustered: stats.unclustered,
                    compression_ratio: stats.compression_ratio,
                    alerts_per_sec: stats.alerts_per_sec,
                    replay: stats.replay,
                  },
                  null,
                  2
                )}
              </pre>
            ) : (
              <span className="text-text-muted">Waiting for first telemetry tick…</span>
            )}
          </Card>

          {/* Buffer Capacity Card */}
          <Card className="p-5 flex flex-col gap-3 relative group/bracket bg-bg-surface/80 backdrop-blur-md z-10 border border-border/80 shadow-lg">
            <CornerBrackets />
            <div className="text-[10px] font-bold tracking-wider text-text-muted uppercase">
              ▎Alert Ring Buffer
            </div>
            <div>
              Buffered alerts count: <span className="text-text-primary font-bold text-[13px]">{alertCount}</span>
              <span className="text-text-muted"> / 500 max capacity (ring buffer format, discards oldest entries when full)</span>
            </div>
          </Card>
        </div>

        {/* Right column: Incidents */}
        <Card className="p-5 flex flex-col gap-3 relative group/bracket bg-bg-surface/80 backdrop-blur-md h-full min-h-[400px] z-10 border border-border/80 shadow-lg">
          <CornerBrackets />
          <div className="text-[10px] font-bold tracking-wider text-text-muted uppercase border-b border-border/30 pb-2">
            ▎Live Incident Registry ({incidents.length})
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto max-h-[500px] pr-2">
            {incidents.length === 0 ? (
              <span className="text-text-muted">No incidents detected in current buffer window. Launch scenario and wait for alerts at t+12s.</span>
            ) : (
              incidents.map((inc) => {
                const diff = lastDiff.get(inc.id)
                const isIncActive = inc.status === 'active'
                const statusBorder = isIncActive ? 'border-l-2 border-l-severity-critical' : 'border-l-2 border-l-accent'
                const badgeColor = isIncActive ? 'text-severity-critical bg-severity-critical/15 border-severity-critical/20' : 'text-accent bg-accent/15 border-accent/20'
                
                return (
                  <div key={inc.id} className={`pl-4 py-1 flex flex-col gap-1.5 ${statusBorder}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border font-sans uppercase shrink-0 ${badgeColor}`}>
                        {inc.status}
                      </span>
                      <span className="text-text-primary font-bold">{inc.id}</span>
                    </div>
                    <div className="text-text-secondary font-sans leading-snug">Title: {inc.title}</div>
                    <div className="text-text-muted flex items-center gap-3">
                      <span>alerts: <strong className="text-text-primary">{inc.alert_count}</strong></span>
                      <span>unique: <strong className="text-text-primary">{inc.unique_count}</strong></span>
                    </div>
                    <div className="text-[11px] text-text-secondary truncate">
                      services: <span className="text-text-primary">{inc.services.join(', ')}</span>
                    </div>
                    <div className="text-[11px]">
                      root candidate: <span className="text-accent font-semibold">{inc.root_candidates[0]?.service}</span>
                      {' '}
                      <span className="text-text-muted">({((inc.root_candidates[0]?.confidence ?? 0) * 100).toFixed(0)}% confidence)</span>
                    </div>
                    {inc.summary && (
                      <div className="text-severity-info bg-severity-info/10 border border-severity-info/20 px-2 py-1 rounded text-[11px]">
                        AI summary: {inc.summary}
                      </div>
                    )}
                    {diff && (
                      <div className="text-[10px] text-text-muted bg-bg-base/30 px-2 py-1 rounded border border-border/30">
                        delta sync: +{diff.added_alert_ids.length} added, -{diff.removed_alert_ids.length} removed at {new Date(diff.at).toISOString().slice(11, 23)}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </Card>
      </div>

      <div className="mt-auto pt-6 border-t border-border/30 text-text-muted flex justify-between text-[10px]">
        <span>StormLens Diagnostics /debug · Team ZenVerse</span>
        <span>WS: {import.meta.env.VITE_WS_URL || 'ws://localhost:8787/ws/stream'}</span>
      </div>
    </div>
  )
}
