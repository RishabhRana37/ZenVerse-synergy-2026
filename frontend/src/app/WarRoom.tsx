/**
 * WarRoom — the demo view. Split-screen: raw alert stream (left) vs incidents (right).
 * TopBar shows live counters.
 */

import { RawStreamPanel } from '@/features/storm/RawStreamPanel'
import { IncidentPanel }  from '@/features/incidents/IncidentPanel'
import { DemoDriver }     from '@/features/demo-driver/DemoDriver'

export function WarRoom() {
  return (
    <div className="flex flex-col h-screen bg-bg-base overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="flex items-center gap-6 px-5 py-3 bg-bg-surface border-b border-border flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-4">
          <span className="text-accent font-bold text-ui-md tracking-tight">⚡ StormLens</span>
        </div>

        {/* Live stats */}
        <div className="flex items-center gap-1 font-mono text-stream tabular text-text-secondary">
          <span className="text-text-primary font-semibold tabular">0</span>
          <span className="mx-1 text-text-muted">alerts</span>
          <span className="mx-1 text-text-muted">→</span>
          <span className="text-accent font-semibold tabular">0</span>
          <span className="mx-1 text-text-muted">incidents</span>
          <span className="mx-2 text-border-strong">·</span>
          <span className="text-accent font-semibold tabular">—</span>
          <span className="text-text-muted ml-1">noise suppressed</span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-text-muted" />
            <span className="text-stream text-text-muted">Offline</span>
          </div>
        </div>
      </header>

      {/* ── Main split ──────────────────────────────────────────────── */}
      <main className="flex flex-1 min-h-0">
        {/* Left — raw stream */}
        <div className="flex-1 min-w-0">
          <RawStreamPanel />
        </div>

        {/* Right — incident cards */}
        <div className="w-[480px] flex-shrink-0">
          <IncidentPanel />
        </div>
      </main>

      {/* ── Demo driver ─────────────────────────────────────────────── */}
      <DemoDriver />

    </div>
  )
}
