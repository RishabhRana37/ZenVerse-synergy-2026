/**
 * DemoDriver — replay controls bar for the demo driver.
 * Controls: Play/Pause, speed selector, progress bar, reset.
 *
 * Status: placeholder — full implementation in next sprint.
 */

export function DemoDriver() {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-bg-elevated border-t border-border">
      <button
        className="px-3 py-1.5 rounded-md bg-accent text-text-inverse text-ui-sm font-semibold hover:opacity-90 transition-opacity"
        aria-label="Start replay"
      >
        ▶ Play
      </button>
      <span className="text-text-muted text-stream font-mono tabular">10× speed</span>
      <div className="flex-1 h-1 bg-bg-hover rounded-full overflow-hidden">
        <div className="h-full w-0 bg-accent transition-[width] duration-300" />
      </div>
      <span className="text-text-muted text-stream font-mono tabular">0 / 0</span>
    </div>
  )
}
