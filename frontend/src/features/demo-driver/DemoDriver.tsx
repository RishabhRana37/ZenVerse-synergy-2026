import { useEffect, useState } from 'react'
import { useStreamStore } from '@/store/stream'
import { clsx } from 'clsx'

// dataset (the .jsonl file to replay) and scenario (the topology YAML to
// score root-cause against) are independent concepts that happen to share a
// name for db-cascade but not for aiops — aiops-scn1.jsonl pairs with
// data/scenarios/aiops.yaml, not a nonexistent aiops-scn1.yaml.
const SCENARIO_FOR_DATASET: Record<string, string> = {
  'db-cascade': 'db-cascade',
  'aiops-scn1': 'aiops',
}

export function DemoDriver() {
  const stats = useStreamStore((s) => s.stats)
  const replay = stats?.replay
  const running = replay?.running ?? false
  const progress = replay?.progress ?? 0
  const activeSpeed = replay?.speed ?? 1

  const [expanded, setExpanded] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [scenario, setScenario] = useState('db-cascade')

  // Auto-collapse when replay starts
  useEffect(() => {
    if (running) {
      setExpanded(false)
    }
  }, [running])

  const handleStart = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || '/api'
      await fetch(`${apiBase}/replay/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset: scenario,
          scenario: SCENARIO_FOR_DATASET[scenario] ?? scenario,
          speed,
        }),
      })
    } catch (e) {
      console.error('[replay] Failed to start:', e)
    }
  }

  const handleStop = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || '/api'
      await fetch(`${apiBase}/replay/stop`, { method: 'POST' })
    } catch (e) {
      console.error('[replay] Failed to stop:', e)
    }
  }

  return (
    <div
      className={clsx(
        "transition-all duration-300 select-none font-sans text-text-primary z-50",
        expanded
          ? "w-[260px] p-4 bg-bg-elevated border border-border rounded-lg shadow-elevated"
          : "w-auto opacity-20 hover:opacity-100 transition-opacity"
      )}
    >
      {expanded ? (
        // Expanded controls card
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
              Replay Harness
            </span>
            <button
              onClick={() => setExpanded(false)}
              className="text-text-muted hover:text-text-primary text-xs"
            >
              ✕
            </button>
          </div>

          {/* Scenario Select */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-text-muted font-mono uppercase">
              Scenario
            </label>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              className="w-full text-xs bg-bg-base border border-border rounded px-2 py-1 focus:outline-none"
            >
              <option value="db-cascade">db-cascade (90s DB fault)</option>
              <option value="aiops-scn1">aiops-scn1 (AIOps 2020 Data)</option>
            </select>
          </div>

          {/* Speed Select */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-text-muted font-mono uppercase">
              Multiplier
            </label>
            {/* aiops-scn1 spans 15 real days — needs 3+ orders of magnitude
                more speed than db-cascade's scripted 90s to finish in a
                demo-reasonable time (100x ≈ 5 min end-to-end). */}
            <div className="grid grid-cols-4 gap-1">
              {[1, 5, 50, 200].map((val) => (
                <button
                  key={val}
                  onClick={() => setSpeed(val)}
                  className={clsx(
                    "py-1 rounded text-[10px] font-mono border transition-colors",
                    speed === val
                      ? "bg-accent border-accent text-text-inverse font-bold"
                      : "bg-bg-base border-border hover:bg-bg-hover text-text-secondary"
                  )}
                >
                  {val}×
                </button>
              ))}
            </div>
          </div>

          {/* Start/Stop Buttons */}
          <div className="flex gap-2 mt-1">
            <button
              onClick={handleStart}
              className="flex-1 py-1.5 rounded bg-accent text-text-inverse text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              Start Replay
            </button>
            <button
              onClick={handleStop}
              className="flex-1 py-1.5 rounded bg-bg-base border border-border hover:bg-bg-hover text-xs font-semibold text-text-secondary"
            >
              Stop
            </button>
          </div>

          {/* Replay state / progress */}
          {running && (
            <div className="flex flex-col gap-1 pt-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-text-muted">
                <span>Speed: {activeSpeed}×</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="w-full h-1 bg-bg-base rounded-full overflow-hidden border border-border">
                <div
                  className="h-full bg-accent transition-[width] duration-300"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        // Collapsed mini pill
        <button
          onClick={() => setExpanded(true)}
          className={clsx(
            "px-3 py-1.5 rounded-full border text-[11px] font-semibold flex items-center gap-1.5 shadow-card transition-all",
            running
              ? "bg-accent-dim border-accent text-accent animate-pulse"
              : "bg-bg-elevated border-border text-text-secondary hover:text-text-primary"
          )}
        >
          {running ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Replay ({Math.round(progress * 100)}%)
            </>
          ) : (
            <>▶ Demo</>
          )}
        </button>
      )}
    </div>
  )
}
