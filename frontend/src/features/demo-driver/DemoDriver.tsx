import { useEffect, useState } from 'react'
import { useStreamStore } from '@/store/stream'
import { clsx } from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'
import { useFPSStore } from '@/lib/motion'
import { X } from 'lucide-react'

// Dataset filename -> topology scenario name. Only aiops-scn1 differs (the
// dataset is named after the specific labeled run, the topology YAML after
// the general trace-derived scenario); the three synthetic ones share a name.
// Sending scenario without a matching dataset (or vice versa) loads the
// wrong topology against the wrong alert data — this caused the aiops
// alerts / db-cascade incident-titles mismatch seen earlier.
const SCENARIO_FOR_DATASET: Record<string, string> = {
  'aiops-scn1': 'aiops',
  'db-cascade': 'db-cascade',
  'network-partition': 'network-partition',
  'rolling-deploy': 'rolling-deploy',
}

export function DemoDriver() {
  const stats = useStreamStore((s) => s.stats)
  const replay = stats?.replay
  const running = replay?.running ?? false
  const progress = replay?.progress ?? 0
  const activeSpeed = replay?.speed ?? 1

  const [expanded, setExpanded] = useState(false)
  const speed = useStreamStore((s) => s.demoSpeed)
  const setSpeed = useStreamStore((s) => s.setDemoSpeed)
  const dataset = useStreamStore((s) => s.demoDataset)
  const setDataset = useStreamStore((s) => s.setDemoDataset)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const fpsReduced = useFPSStore((s) => s.reducedMotion)
  const reducedMotion = (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || fpsReduced

  // Auto-collapse when replay starts
  useEffect(() => {
    if (running) {
      setExpanded(false)
    }
  }, [running])

  // Monitor physical keystrokes and update visual register
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'select' || tag === 'textarea') {
        return
      }

      const key = e.key.toUpperCase()
      if (['S', 'X', 'R', 'E', 'W', 'M'].includes(key)) {
        setActiveKey(key)
        const t = setTimeout(() => setActiveKey(null), 300)
        return () => clearTimeout(t)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleStart = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || '/api'
      await fetch(`${apiBase}/replay/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset, scenario: SCENARIO_FOR_DATASET[dataset], speed }),
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
    <div className="flex items-center gap-2 select-none font-sans text-text-primary z-50">
      {/* Keystroke Visual Register */}
      <AnimatePresence>
        {activeKey && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className={clsx(
              "px-2.5 h-8 rounded border border-accent bg-[#11161F] text-accent font-mono text-[10px] font-bold shadow-elevated flex items-center justify-center min-w-[32px]",
              !reducedMotion && "animate-press-down"
            )}
          >
            {activeKey}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={clsx(
          "transition-all duration-300",
          expanded
            ? "w-[260px] p-4 bg-bg-surface border border-border rounded-card shadow-elevated"
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
                className="text-text-muted hover:text-text-primary text-xs cursor-pointer"
                aria-label="Close replay harness"
              >
                <X size={14} />
              </button>
            </div>

            {/* Scenario Select */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-text-muted font-mono uppercase">
                Scenario
              </label>
              <select
                value={dataset}
                onChange={(e) => setDataset(e.target.value)}
                className="w-full text-xs bg-bg-base border border-border rounded px-2 py-1 focus:outline-none"
              >
                <option value="aiops-scn1">aiops-scn1 (real, 15-day)</option>
                <option value="db-cascade">db-cascade (90s DB fault)</option>
                <option value="network-partition">network-partition (dc-b outage)</option>
                <option value="rolling-deploy">rolling-deploy (bad canary)</option>
              </select>
            </div>

            {/* Speed Multiplier */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-text-muted font-mono uppercase">
                Multiplier
              </label>
              <div className="grid grid-cols-4 gap-1">
                {[1, 5, 50, 200].map((val) => (
                  <button
                    key={val}
                    onClick={() => setSpeed(val)}
                    aria-label={`Set speed multiplier to ${val} times`}
                    className={clsx(
                      "py-1 rounded text-[10px] font-mono border transition-all duration-100 active:scale-[0.97] cursor-pointer",
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
                className="flex-1 py-1.5 rounded-md bg-accent text-text-inverse text-xs font-semibold hover:opacity-90 active:scale-[0.97] transition-all duration-100 cursor-pointer"
              >
                Start Replay
              </button>
              <button
                onClick={handleStop}
                className="flex-1 py-1.5 rounded-md bg-bg-base border border-border hover:bg-bg-hover active:scale-[0.97] text-xs font-semibold text-text-secondary transition-all duration-100 cursor-pointer"
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
            aria-label={running ? "View replay progress" : "Open demo controls"}
            className={clsx(
              "px-3 py-1.5 rounded-full border text-[11px] font-semibold flex items-center gap-1.5 shadow-card transition-all duration-100 active:scale-[0.95] cursor-pointer",
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
    </div>
  )
}
