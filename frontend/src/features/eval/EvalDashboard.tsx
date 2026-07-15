/**
 * EvalDashboard — metrics table from GET /eval/results.
 * Shows per-scenario: compression ratio, cluster purity, ARI,
 * Hit@1/Hit@3, p50/p95 latency.
 *
 * Status: placeholder — full implementation in next sprint.
 */

export function EvalDashboard() {
  return (
    <div className="flex flex-col min-h-screen bg-bg-base p-6">
      <div className="mb-6">
        <h1 className="text-hero-sm font-semibold text-text-primary">Evaluation Dashboard</h1>
        <p className="text-ui-sm text-text-secondary mt-1">
          Measured against labeled ground truth — compression, cluster purity, root-cause hit rate.
        </p>
      </div>
      <div className="bg-bg-surface border border-border rounded-card p-8 flex items-center justify-center text-text-muted text-ui-sm">
        Eval metrics table coming soon…
      </div>
    </div>
  )
}
