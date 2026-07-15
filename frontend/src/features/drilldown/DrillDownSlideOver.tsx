/**
 * DrillDownSlideOver — slide-over panel for incident drill-down view.
 * Shows: root candidates + confidence bars, dependency graph,
 * LLM summary, full alert member list.
 *
 * Status: placeholder — full implementation in next sprint.
 */

interface DrillDownSlideOverProps {
  incidentId: string | null
  onClose: () => void
}

export function DrillDownSlideOver({ incidentId, onClose }: DrillDownSlideOverProps) {
  if (!incidentId) return null

  return (
    <div className="fixed inset-y-0 right-0 w-[640px] bg-bg-elevated border-l border-border shadow-elevated z-50 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <span className="text-ui-md font-semibold text-text-primary">Incident Detail</span>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary transition-colors p-1"
          aria-label="Close drill-down"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center text-text-muted text-ui-sm">
        Drill-down for <code className="mx-1 font-mono text-accent">{incidentId}</code> coming soon…
      </div>
    </div>
  )
}
