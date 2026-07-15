import { useStreamStore } from '@/store/stream'

export function IncidentPanel() {
  const activeCount = useStreamStore((s) => {
    if (s.stats) return s.stats.active_incidents
    return [...s.incidents.values()].filter((i) => i.status === 'active').length
  })

  return (
    <div className="flex flex-col h-full bg-bg-surface rounded-card border border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <span className="text-ui font-semibold text-text-primary font-sans">Incidents</span>
        <div className="px-2 py-0.5 rounded bg-bg-elevated border border-border text-stream text-text-secondary font-mono tabular-nums">
          {activeCount} active
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center text-accent text-ui-sm font-sans font-medium select-none">
        No active incidents
      </div>
    </div>
  )
}
