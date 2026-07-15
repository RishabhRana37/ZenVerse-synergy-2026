/**
 * IncidentPanel — right panel of the War Room.
 * Shows live incident cards, updating in-place via stable IDs.
 *
 * Status: placeholder — full implementation in next sprint.
 */

export function IncidentPanel() {
  return (
    <div className="flex flex-col h-full bg-bg-surface">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-ui font-semibold text-text-primary">Incidents</span>
        <span className="font-mono text-stream text-text-muted tabular">0 active</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted">
        {/* Radar placeholder */}
        <div className="w-16 h-16 rounded-full border-2 border-dashed border-border flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse-dot" />
        </div>
        <span className="text-ui-sm">Listening for incidents…</span>
      </div>
    </div>
  )
}
