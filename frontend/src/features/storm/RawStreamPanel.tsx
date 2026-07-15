import { useStreamStore } from '@/store/stream'

export function RawStreamPanel() {
  const alertsPerSec = useStreamStore((s) => s.stats?.alerts_per_sec)

  return (
    <div className="flex flex-col h-full bg-bg-surface rounded-card border border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-ui font-semibold text-text-primary font-sans">Raw Stream</span>
        </div>
        <div className="px-2 py-0.5 rounded bg-bg-elevated border border-border text-stream text-text-secondary font-mono tabular-nums">
          {alertsPerSec !== undefined ? `${alertsPerSec.toFixed(1)}/s` : '—/s'}
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center text-text-muted text-ui-sm font-sans select-none">
        awaiting alerts
      </div>
    </div>
  )
}
