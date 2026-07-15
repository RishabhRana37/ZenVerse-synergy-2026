/**
 * RawStreamPanel — left panel of the War Room.
 * Shows live alert stream, auto-scrolling, with alert-rate counter.
 *
 * Status: placeholder — full implementation in next sprint.
 */

export function RawStreamPanel() {
  return (
    <div className="flex flex-col h-full bg-bg-surface border-r border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-severity-critical animate-pulse-dot" />
          <span className="text-ui font-semibold text-text-primary">Raw Alert Stream</span>
        </div>
        <span className="font-mono text-stream text-text-muted tabular">0 alerts/s</span>
      </div>
      <div className="flex-1 flex items-center justify-center text-text-muted text-ui-sm">
        Raw stream coming soon…
      </div>
    </div>
  )
}
