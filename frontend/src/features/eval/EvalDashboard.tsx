import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import fallbackData from './eval-results.fallback.json'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from 'recharts'
import { Odometer } from '@/components/ui/Odometer'
import { clsx } from 'clsx'
import { CornerBrackets } from '@/components/ui/CornerBrackets'
import { motion } from 'framer-motion'
import { useFPSStore, springPreset, DUR_ENTER, EASE } from '@/lib/motion'

// ── Types ─────────────────────────────────────────────────────────────────

interface BackendResult {
  backend: string
  compression_ratio: number
  purity: number
  ari: number
  hit_at_1: number
  hit_at_3: number
  latency_p50_ms: number
  latency_p95_ms: number
  total_alerts: number
  incidents_out: number
  [key: string]: any
}

interface ScenarioResult {
  name: string
  backends: BackendResult[]
}

interface EvalData {
  generated_at: string
  dataset: string
  scenarios: ScenarioResult[]
  targets: {
    compression_ratio: number
    purity: number
    hit_at_1: number
    hit_at_3: number
    latency_p95_ms: number
    [key: string]: number
  }
}

export function EvalDashboard() {
  const [data, setData] = useState<EvalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFallback, setIsFallback] = useState(false)

  const fpsReduced = useFPSStore((s) => s.reducedMotion)
  const reducedMotion = (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || fpsReduced

  // Odometer value states (will be triggered on viewport enter)
  const [odoValues, setOdoValues] = useState({
    compression: 0,
    purity: 0,
    ari: 0,
    hit1: 0,
    hit3: 0,
  })

  // Fetch eval results
  useEffect(() => {
    const fetchResults = async () => {
      try {
        const apiBase = import.meta.env.VITE_API_URL || '/api'
        const res = await fetch(`${apiBase}/eval/results`)
        if (!res.ok) {
          throw new Error(`HTTP Error ${res.status}`)
        }
        const json = await res.json()
        setData(json)
        setError(null)
        setIsFallback(false)
      } catch (err: any) {
        console.warn('[eval] Failed to load results, loading fallback JSON:', err)
        setData(fallbackData as EvalData)
        setIsFallback(true)
        setError(null)
      } finally {
        setLoading(false)
      }
    }
    fetchResults()
  }, [])

  // Identify best backend on primary scenario (db-cascade)
  const primaryScenario = data?.scenarios.find((s) => s.name === 'db-cascade')
  const bestBackend = primaryScenario?.backends.find(
    (b) => b.backend === 'DenStream (streaming)',
  )

  const handleViewportEnter = () => {
    if (bestBackend) {
      setOdoValues({
        compression: bestBackend.compression_ratio,
        purity: bestBackend.purity,
        ari: bestBackend.ari,
        hit1: bestBackend.hit_at_1,
        hit3: bestBackend.hit_at_3,
      })
    }
  }

  // Custom cell highlight utility
  const isBestInScenario = (
    scenarioName: string,
    backendName: string,
    field: string,
  ) => {
    if (!data) return false
    const sc = data.scenarios.find((s) => s.name === scenarioName)
    if (!sc) return false

    const values = sc.backends.map((b) => b[field])
    const current = sc.backends.find((b) => b.backend === backendName)?.[field]

    if (field.startsWith('latency')) {
      const min = Math.min(...values)
      return current === min
    } else {
      const max = Math.max(...values)
      return current === max
    }
  }

  // Grouped bar chart data formatting
  const chartData = useMemo(() => {
    return primaryScenario?.backends.map((b) => ({
      name: b.backend.split(' ')[0], // 'DenStream' or 'DBSCAN'
      'Hit@1': parseFloat((b.hit_at_1 * 100).toFixed(1)),
      'Hit@3': parseFloat((b.hit_at_3 * 100).toFixed(1)),
    })) || []
  }, [primaryScenario])

  // Check target pass/fail status
  const evaluateTarget = (field: string, val: number) => {
    if (!data?.targets) return { pass: true, label: '' }
    
    // Add custom fallback for ARI target
    let target = data.targets[field]
    if (field === 'ari') {
      target = 0.8
    }

    if (target === undefined) return { pass: true, label: '' }

    if (field.startsWith('latency')) {
      return {
        pass: val <= target,
        label: `target ≤ ${target}ms`,
      }
    } else {
      const pct = Math.round(target * 100)
      return {
        pass: val >= target,
        label: `target ≥ ${pct}%`,
      }
    }
  }

  // Loader Skeleton
  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-bg-base p-6 text-text-primary select-none font-sans">
        <div className="mb-4">
          <div className="h-8 w-24 rounded bg-bg-surface border border-border animate-pulse" />
        </div>
        <div className="flex justify-between items-start mb-6 animate-pulse">
          <div className="flex flex-col gap-2">
            <div className="h-5 w-48 rounded bg-bg-surface" />
            <div className="h-4 w-96 rounded bg-bg-surface" />
          </div>
        </div>
        <div className="grid grid-cols-5 gap-4 mb-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 rounded bg-bg-surface border border-border animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-6 animate-pulse">
          <div className="col-span-2 h-48 rounded bg-bg-surface border border-border" />
          <div className="h-48 rounded bg-bg-surface border border-border" />
        </div>
      </div>
    )
  }

  // Graceful Error State
  if (error || !data) {
    return (
      <div className="flex flex-col min-h-screen bg-bg-base p-8 text-text-primary font-sans items-center justify-center select-none">
        <div className="w-full max-w-md p-6 bg-bg-surface rounded border border-severity-critical/20 flex flex-col gap-4 text-center">
          <span className="text-severity-critical text-2xl font-bold">✗ Evaluation Link Failed</span>
          <p className="text-ui-sm text-text-secondary">
            Could not fetch ablation metrics. Ensure the backend is running (uvicorn app.api.main:app, port 8000).
          </p>
          <code className="text-[11px] bg-bg-base p-2.5 rounded font-mono text-severity-warning text-left">
            {error || 'ENDPOINT_NOT_RESOLVED'}
          </code>
          <div className="flex justify-center gap-3 mt-2">
            <button
              onClick={() => window.location.reload()}
              className="px-3.5 py-1.5 rounded bg-bg-elevated border border-border hover:bg-bg-hover text-ui-sm font-semibold transition-colors"
            >
              Retry Connection
            </button>
            <Link
              to="/war-room"
              className="px-3.5 py-1.5 rounded bg-accent text-text-inverse font-semibold hover:opacity-90 text-ui-sm transition-opacity"
            >
              Back to War Room
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Framer Motion staggered reveals configuration
  const gridContainerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: reducedMotion ? 0 : 0.06,
      },
    },
  }

  const metricCardVariants = {
    hidden: { opacity: 0, y: reducedMotion ? 0 : 10 },
    show: {
      opacity: 1,
      y: 0,
      transition: reducedMotion ? { duration: 0.1 } : springPreset,
    },
  }

  const mainSectionsVariants = {
    hidden: { opacity: 0, y: reducedMotion ? 0 : 16 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: DUR_ENTER, ease: EASE, delay: reducedMotion ? 0 : 0.25 },
    },
  }

  return (
    <div className="w-full min-h-full bg-bg-base p-6 text-text-primary font-sans select-text relative overflow-hidden z-10">
      <div className="relative z-10 flex flex-col">
        {/* Back Link Row */}
        <div className="mb-4">
          <Link
            to="/war-room"
            className="inline-block px-3.5 py-1.5 rounded bg-bg-elevated border border-border hover:bg-bg-hover hover:border-border-hover hover:-translate-y-[1px] text-ui-sm font-semibold text-text-primary transition-all duration-150"
          >
            ← War Room
          </Link>
        </div>

        {/* Header */}
        <header className="flex justify-between items-start mb-6 flex-shrink-0">
          <div className="flex flex-col gap-1">
            <h1 className="text-hero-sm font-semibold text-text-primary leading-tight">
              Evaluation — measured on labeled ground truth
            </h1>
            <div className="flex items-center gap-2 text-ui-sm text-text-secondary select-none">
              <span className="font-mono text-accent">{data.dataset}</span>
              <span>·</span>
              <span className="text-text-muted font-mono">
                generated {new Date(data.generated_at).toLocaleDateString()}
              </span>
              {isFallback && (
                <>
                  <span>·</span>
                  <span className="px-1.5 py-0.5 rounded border border-border/80 bg-bg-surface text-[10px] text-text-secondary font-mono leading-none select-none">
                    cached results
                  </span>
                </>
              )}
            </div>
            <p className="text-[11px] text-text-muted mt-1 select-none">
              All numbers reproducible via eval harness.
            </p>
          </div>
        </header>

        {/* HERO ROW (Best backend on primary scenario, staggered scroll reveal) */}
        {bestBackend && (
          <motion.section
            variants={gridContainerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-20px' }}
            onViewportEnter={handleViewportEnter}
            className="grid grid-cols-5 gap-4 mb-6 flex-shrink-0"
          >
            {[
              {
                name: 'Compression',
                val: odoValues.compression,
                field: 'compression_ratio',
                format: 'percent1' as const,
              },
              {
                name: 'Purity',
                val: odoValues.purity,
                field: 'purity',
                format: 'percent1' as const,
              },
              {
                name: 'ARI',
                val: odoValues.ari,
                field: 'ari',
                format: 'percent1' as const,
              },
              {
                name: 'Hit@1',
                val: odoValues.hit1,
                field: 'hit_at_1',
                format: 'percent1' as const,
              },
              {
                name: 'Hit@3',
                val: odoValues.hit3,
                field: 'hit_at_3',
                format: 'percent1' as const,
              },
            ].map((metric) => {
              const { pass, label } = evaluateTarget(metric.field, metric.val)
              return (
                <motion.div
                  key={metric.name}
                  variants={metricCardVariants}
                  className="bg-bg-surface border border-border rounded-card p-4 flex flex-col justify-between relative group/bracket hover:border-border-hover hover:-translate-y-[1px] transition-all duration-150"
                >
                  <CornerBrackets />
                  <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider select-none">
                    {metric.name}
                  </span>
                  
                  <div className="my-2.5">
                    <Odometer
                      value={metric.val}
                      format={metric.format}
                      className="text-hero-sm font-bold text-text-primary tracking-tight font-mono"
                    />
                  </div>

                  <div className="flex items-center justify-between mt-1 text-[10px] select-none">
                    <span className="text-text-muted font-mono">{label || '—'}</span>
                    {label && (
                      <span
                        className={clsx(
                          "px-1.5 py-0.5 rounded-badge text-[10px] font-bold border font-mono tracking-wider",
                          pass
                            ? "bg-accent-dim border-accent/20 text-accent"
                            : "bg-severity-warning/10 border-severity-warning/20 text-severity-warning"
                        )}
                      >
                        {pass ? '✓ PASS' : '✗ FAIL'}
                      </span>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </motion.section>
        )}

        {/* Main Layout (Table & Charts side-by-side with scroll-in-view transition) */}
        <motion.div
          variants={mainSectionsVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-20px' }}
          className="grid grid-cols-1 lg:grid-cols-[65%_35%] gap-6 items-start w-full"
        >
          {/* Left Column: Ablation Results Table (65% width) */}
          <section className="bg-bg-surface border border-border rounded-card p-5 flex flex-col min-w-0">
            <h3 className="text-[11px] text-text-muted font-mono font-bold tracking-wider uppercase mb-3 select-none">
              Ablation Metrics Table
            </h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] text-left border-collapse font-mono select-text">
                <thead>
                  <tr className="border-b border-border/80 text-text-muted font-sans font-semibold uppercase text-[10px] tracking-wider select-none">
                    <th className="py-2.5 pr-4">Scenario</th>
                    <th className="py-2.5 pr-4">Backend</th>
                    <th className="py-2.5 text-right">Comp. Ratio</th>
                    <th className="py-2.5 text-right">Purity</th>
                    <th className="py-2.5 text-right">ARI</th>
                    <th className="py-2.5 text-right">Hit@1</th>
                    <th className="py-2.5 text-right">Hit@3</th>
                    <th className="py-2.5 text-right">p50 Latency</th>
                    <th className="py-2.5 text-right">p95 Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {data.scenarios.flatMap((sc) =>
                    sc.backends.map((b, bIdx) => {
                      const showScenarioLabel = bIdx === 0
                      return (
                        <tr key={`${sc.name}-${b.backend}`} className="hover:bg-bg-hover/30 transition-colors">
                          <td className="py-3 pr-4 font-sans text-text-secondary select-all font-medium">
                            {showScenarioLabel ? sc.name : ''}
                          </td>
                          <td className="py-3 pr-4 font-sans text-text-secondary select-all">
                            {b.backend}
                          </td>
                          
                          {/* Compression */}
                          <td className={clsx(
                            "py-3 text-right tabular-nums select-all",
                            isBestInScenario(sc.name, b.backend, 'compression_ratio')
                              ? "text-accent font-semibold"
                              : "text-text-primary"
                          )}>
                            <Odometer value={b.compression_ratio} format="percent1" easing="spring" />
                          </td>

                          {/* Purity */}
                          <td className={clsx(
                            "py-3 text-right tabular-nums select-all",
                            isBestInScenario(sc.name, b.backend, 'purity')
                              ? "text-accent font-semibold"
                              : "text-text-primary"
                          )}>
                            <Odometer value={b.purity} format="percent1" easing="spring" />
                          </td>

                          {/* ARI */}
                          <td className={clsx(
                            "py-3 text-right tabular-nums select-all",
                            isBestInScenario(sc.name, b.backend, 'ari')
                              ? "text-accent font-semibold"
                              : "text-text-primary"
                          )}>
                            <Odometer value={b.ari} format="percent1" easing="spring" />
                          </td>

                          {/* Hit@1 */}
                          <td className={clsx(
                            "py-3 text-right tabular-nums select-all",
                            isBestInScenario(sc.name, b.backend, 'hit_at_1')
                              ? "text-accent font-semibold"
                              : "text-text-primary"
                          )}>
                            <Odometer value={b.hit_at_1} format="percent1" easing="spring" />
                          </td>

                          {/* Hit@3 */}
                          <td className={clsx(
                            "py-3 text-right tabular-nums select-all",
                            isBestInScenario(sc.name, b.backend, 'hit_at_3')
                              ? "text-accent font-semibold"
                              : "text-text-primary"
                          )}>
                            <Odometer value={b.hit_at_3} format="percent1" easing="spring" />
                          </td>

                          {/* p50 Latency */}
                          <td className={clsx(
                            "py-3 text-right tabular-nums select-all",
                            isBestInScenario(sc.name, b.backend, 'latency_p50_ms')
                              ? "text-accent font-semibold"
                              : "text-text-primary"
                          )}>
                            <Odometer value={b.latency_p50_ms} format="integer" easing="spring" />ms
                          </td>

                          {/* p95 Latency */}
                          <td className={clsx(
                            "py-3 text-right tabular-nums select-all",
                            isBestInScenario(sc.name, b.backend, 'latency_p95_ms')
                              ? "text-accent font-semibold"
                              : "text-text-primary"
                          )}>
                            <Odometer value={b.latency_p95_ms} format="integer" easing="spring" />ms
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Right Column: Recharts Hit Rate Bar Chart (35% width) */}
          <section className="bg-bg-surface border border-border rounded-card p-5 flex flex-col w-full">
            <h3 className="text-[11px] text-text-muted font-mono font-bold tracking-wider uppercase mb-3 select-none">
              Primary Scenario Hit Rate
            </h3>
            
            <div className="w-full h-[220px]">
              {chartData.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 15, right: 10, left: -25, bottom: 5 }}
                  >
                    <XAxis
                      dataKey="name"
                      stroke="#4D5866"
                      fontSize={10}
                      fontFamily="JetBrains Mono"
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#4D5866"
                      fontSize={10}
                      fontFamily="JetBrains Mono"
                      tickLine={false}
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#161D29',
                        borderColor: 'rgba(255,255,255,0.08)',
                        borderRadius: '4px',
                      }}
                      labelStyle={{ color: '#8B98A9', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                      itemStyle={{ color: '#E6EDF3', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                      formatter={(v) => [`${v}%`]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#8B98A9' }}
                      iconType="rect"
                      iconSize={8}
                    />
                    
                    {/* Hit@1 Bar: Accent Green */}
                    <Bar
                      dataKey="Hit@1"
                      fill="#2DD4A7"
                      name="Hit@1"
                      radius={[2, 2, 0, 0]}
                    >
                      <LabelList
                        dataKey="Hit@1"
                        position="top"
                        fill="#E6EDF3"
                        fontSize={9}
                        fontFamily="JetBrains Mono"
                        formatter={(v: number) => `${v}%`}
                      />
                    </Bar>
                    
                    {/* Hit@3 Bar: Info Blue */}
                    <Bar
                      dataKey="Hit@3"
                      fill="#4D9FFF"
                      name="Hit@3"
                      radius={[2, 2, 0, 0]}
                    >
                      <LabelList
                        dataKey="Hit@3"
                        position="top"
                        fill="#E6EDF3"
                        fontSize={9}
                        fontFamily="JetBrains Mono"
                        formatter={(v: number) => `${v}%`}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        </motion.div>

        {/* Metric-definition footnotes */}
        <footer className="mt-8 bg-bg-surface border border-border rounded-card p-5 text-[11px] text-text-muted font-mono leading-relaxed select-none">
          <div className="text-text-primary font-bold mb-2">
            * Metric Definitions
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
            <div>
              <span className="text-text-secondary font-bold mr-1">Compression Ratio:</span>
              1 − (active_incidents / total_alerts). Measures alert volume reduction rate.
            </div>
            <div>
              <span className="text-text-secondary font-bold mr-1">Purity & ARI:</span>
              Clustering accuracy against labeled ground truth. Adjusted Rand Index (ARI) controls for random splits.
            </div>
            <div>
              <span className="text-text-secondary font-bold mr-1">Hit@k Root Cause:</span>
              True root cause service present within the top-k suggested candidate list.
            </div>
            <div>
              <span className="text-text-secondary font-bold mr-1">Latency:</span>
              End-to-end elapsed time from raw alert ingestion to the converged incident creation.
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
