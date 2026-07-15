/**
 * TokensPage — visual style guide for the StormLens design system.
 * Route: /tokens
 *
 * Shows: all color swatches, both fonts, type scale, Card, Badge (all variants),
 * Stat, ConfidenceBar. Used to verify the design system before building features.
 */

import { Card }           from '@/components/ui/Card'
import { Badge }          from '@/components/ui/Badge'
import { Stat }           from '@/components/ui/Stat'
import { ConfidenceBar }  from '@/components/ui/ConfidenceBar'

// ── Section wrapper ────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-ui font-semibold text-text-muted uppercase tracking-widest mb-4 pb-2 border-b border-border">
        {title}
      </h2>
      {children}
    </section>
  )
}

// ── Color swatch ────────────────────────────────────────────────────────────
function Swatch({ label, hex, className }: { label: string; hex: string; className?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={`w-full h-12 rounded-md border border-border ${className ?? ''}`}
        style={{ background: hex }}
      />
      <div className="text-[11px] font-medium text-text-secondary">{label}</div>
      <div className="text-[10px] font-mono text-text-muted">{hex}</div>
    </div>
  )
}

// ── Type specimen ────────────────────────────────────────────────────────────
function TypeRow({ label, className, sample }: { label: string; className: string; sample: string }) {
  return (
    <div className="flex items-baseline gap-4 py-2 border-b border-border last:border-0">
      <span className="w-32 text-[11px] text-text-muted font-mono flex-shrink-0">{label}</span>
      <span className={className}>{sample}</span>
    </div>
  )
}

export function TokensPage() {
  return (
    <div className="min-h-screen bg-bg-base p-8 max-w-4xl mx-auto">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-accent text-hero font-bold">⚡</span>
          <h1 className="text-hero font-bold text-text-primary tracking-tight">
            StormLens Design System
          </h1>
        </div>
        <p className="text-ui-sm text-text-secondary">
          Visual token reference — verify all colours, type, and components before building features.
        </p>
      </div>

      {/* ── Backgrounds & surfaces ────────────────────────────────────── */}
      <Section title="Backgrounds & Surfaces">
        <div className="grid grid-cols-4 gap-3">
          <Swatch label="Base"     hex="#0A0E14" className="border-2" />
          <Swatch label="Surface"  hex="#11161F" />
          <Swatch label="Elevated" hex="#161D29" />
          <Swatch label="Hover"    hex="#1C2535" />
        </div>
      </Section>

      {/* ── Borders ──────────────────────────────────────────────────── */}
      <Section title="Borders">
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 bg-bg-surface rounded-card border border-border">
            <span className="text-stream text-text-muted font-mono">hairline (0.06)</span>
          </div>
          <div className="p-4 bg-bg-surface rounded-card border border-[rgba(255,255,255,0.04)]">
            <span className="text-stream text-text-muted font-mono">subtle (0.04)</span>
          </div>
          <div className="p-4 bg-bg-surface rounded-card border border-[rgba(255,255,255,0.12)]">
            <span className="text-stream text-text-muted font-mono">strong (0.12)</span>
          </div>
        </div>
      </Section>

      {/* ── Text colours ─────────────────────────────────────────────── */}
      <Section title="Text">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="w-20 text-[11px] font-mono text-text-muted">primary</span>
            <span className="text-ui text-text-primary font-medium">E6EDF3 — The on-call engineer's screen</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-20 text-[11px] font-mono text-text-muted">secondary</span>
            <span className="text-ui text-text-secondary">8B98A9 — Supporting labels and metadata</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-20 text-[11px] font-mono text-text-muted">muted</span>
            <span className="text-ui text-text-muted">4D5866 — Section headers, timestamps, de-emphasized</span>
          </div>
        </div>
      </Section>

      {/* ── Severity ─────────────────────────────────────────────────── */}
      <Section title="Severity">
        <div className="grid grid-cols-3 gap-3">
          <Swatch label="Critical" hex="#FF4D4F" />
          <Swatch label="Warning"  hex="#F5A623" />
          <Swatch label="Info"     hex="#4D9FFF" />
        </div>
      </Section>

      {/* ── Accent ───────────────────────────────────────────────────── */}
      <Section title="Accent / Correlated">
        <div className="grid grid-cols-2 gap-3">
          <Swatch label="Accent"     hex="#2DD4A7" />
          <Swatch label="Accent dim" hex="rgba(45,212,167,0.15)" className="border-[rgba(45,212,167,0.3)]" />
        </div>
      </Section>

      {/* ── Confidence gradient ───────────────────────────────────────── */}
      <Section title="Confidence Gradient">
        <div className="space-y-2">
          <div className="h-4 rounded-full confidence-gradient" />
          <div className="flex justify-between text-[11px] font-mono text-text-muted">
            <span>Low (red) #FF4D4F</span>
            <span>Mid (amber) #F5A623</span>
            <span>High (green) #2DD4A7</span>
          </div>
        </div>
      </Section>

      {/* ── Typography ───────────────────────────────────────────────── */}
      <Section title="Typography — Inter (UI)">
        <div className="space-y-0 bg-bg-surface rounded-card p-4">
          <TypeRow label="hero-lg / 36px"   className="text-hero-lg font-bold text-text-primary"   sample="2,143 Alerts Correlated" />
          <TypeRow label="hero / 32px"      className="text-hero font-bold text-text-primary"       sample="99.86% Noise Suppressed" />
          <TypeRow label="hero-sm / 28px"   className="text-hero-sm font-semibold text-text-primary" sample="Incident Blast Radius" />
          <TypeRow label="ui-md / 15px"     className="text-ui-md font-medium text-text-primary"   sample="Incident #1 — postgres failure" />
          <TypeRow label="ui / 14px"        className="text-ui text-text-secondary"                 sample="Root cause: postgres-primary · 87% confidence" />
          <TypeRow label="ui-sm / 13px"     className="text-ui-sm text-text-muted"                  sample="alert_count: 1,412 · services: order-svc, api-gateway" />
        </div>
      </Section>

      <Section title="Typography — JetBrains Mono (Stream / Numbers)">
        <div className="space-y-0 bg-bg-surface rounded-card p-4">
          <TypeRow
            label="stream / 12px"
            className="font-mono text-stream text-text-primary tabular"
            sample="2026-07-14T02:14:23Z  CRIT  postgres-primary  disk latency spike: 850ms p99"
          />
          <TypeRow
            label="mono tabular"
            className="font-mono text-ui text-text-secondary tabular"
            sample="Alerts: 2,143  →  Incidents: 3  ·  Suppressed: 99.86%"
          />
          <TypeRow
            label="hero num"
            className="font-mono text-hero font-bold text-accent tabular"
            sample="2,143"
          />
        </div>
      </Section>

      {/* ── Card component ─────────────────────────────────────────────── */}
      <Section title="Card">
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <div className="text-ui-sm font-medium text-text-primary mb-1">Surface (default)</div>
            <div className="text-stream text-text-muted font-mono">bg: #11161F</div>
          </Card>

          <Card variant="elevated">
            <div className="text-ui-sm font-medium text-text-primary mb-1">Elevated</div>
            <div className="text-stream text-text-muted font-mono">bg: #161D29</div>
          </Card>

          <Card interactive accent="#FF4D4F">
            <div className="text-ui-sm font-medium text-severity-critical mb-1">Interactive + accent</div>
            <div className="text-stream text-text-muted font-mono">hover → #1C2535</div>
          </Card>
        </div>
      </Section>

      {/* ── Badge component ────────────────────────────────────────────── */}
      <Section title="Badge">
        <div className="flex flex-wrap gap-2 items-center">
          <Badge variant="critical" dot>CRITICAL</Badge>
          <Badge variant="warning"  dot>WARNING</Badge>
          <Badge variant="info"     dot>INFO</Badge>
          <Badge variant="accent"   dot>CORRELATED</Badge>
          <Badge variant="resolved" dot>RESOLVED</Badge>
          <Badge variant="neutral">NEUTRAL</Badge>
          <Badge variant="critical">×14 dupes</Badge>
          <Badge variant="warning">api-gateway</Badge>
          <Badge variant="info">order-svc</Badge>
        </div>
      </Section>

      {/* ── Stat component ─────────────────────────────────────────────── */}
      <Section title="Stat">
        <div className="grid grid-cols-4 gap-4">
          <Card padding="sm">
            <Stat label="Total Alerts" value="2,143" size="md" color="primary" />
          </Card>
          <Card padding="sm">
            <Stat label="Incidents"    value="3"     size="md" color="accent" />
          </Card>
          <Card padding="sm">
            <Stat label="Suppressed"   value="99.86" unit="%" size="md" color="accent" />
          </Card>
          <Card padding="sm">
            <Stat label="Alert Rate"   value="48"    unit="/s" size="md" color="warning" />
          </Card>
        </div>
      </Section>

      {/* ── ConfidenceBar component ────────────────────────────────────── */}
      <Section title="ConfidenceBar">
        <Card>
          <div className="space-y-4">
            <div>
              <div className="text-stream text-text-muted font-mono mb-2">High confidence (≥ 0.8)</div>
              <ConfidenceBar confidence={0.87} height="md" />
            </div>
            <div>
              <div className="text-stream text-text-muted font-mono mb-2">Mid confidence (0.5–0.8)</div>
              <ConfidenceBar confidence={0.61} height="md" />
            </div>
            <div>
              <div className="text-stream text-text-muted font-mono mb-2">Low confidence (&lt; 0.5)</div>
              <ConfidenceBar confidence={0.32} height="md" />
            </div>
            <div>
              <div className="text-stream text-text-muted font-mono mb-2">XS height (for dense lists)</div>
              <ConfidenceBar confidence={0.74} height="xs" showLabel={false} />
            </div>
          </div>
        </Card>
      </Section>

      {/* ── Sample incident card (composite) ──────────────────────────── */}
      <Section title="Sample Incident Card (Composite)">
        <Card interactive accent="#FF4D4F" className="max-w-md">
          <div className="flex items-start justify-between mb-3">
            <div>
              <Badge variant="critical" dot className="mb-2">Critical</Badge>
              <h3 className="text-ui-md font-semibold text-text-primary leading-tight">
                postgres-primary disk latency spike
              </h3>
            </div>
            <div className="text-right ml-4 flex-shrink-0">
              <div className="font-mono text-hero-sm font-bold text-text-primary tabular">1,412</div>
              <div className="text-[10px] text-text-muted">alerts</div>
            </div>
          </div>

          {/* Root cause */}
          <div className="mb-3">
            <div className="text-[11px] text-text-muted mb-1.5 font-medium uppercase tracking-wide">Root Cause</div>
            <div className="text-ui-sm text-text-secondary font-mono mb-1">
              disk latency on &lt;HOST&gt; — postgres-primary
            </div>
            <ConfidenceBar confidence={0.87} height="sm" />
          </div>

          {/* Services */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge variant="neutral">postgres-primary</Badge>
            <Badge variant="neutral">order-svc</Badge>
            <Badge variant="neutral">api-gateway</Badge>
            <Badge variant="neutral">checkout</Badge>
          </div>
        </Card>
      </Section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div className="mt-8 pt-6 border-t border-border text-[11px] text-text-muted font-mono">
        StormLens · Team ZenVerse · Synergy 2026 · HPE PS #10 · /tokens route
      </div>
    </div>
  )
}
