/**
 * ConfidenceBar — animated fill bar for root-cause confidence scores.
 *
 * Color interpolates:
 *   ≥ 0.8  → accent green   (#2DD4A7)
 *   0.5–0.8 → warning amber  (#F5A623)
 *   < 0.5  → critical red   (#FF4D4F)
 */

import { clsx } from 'clsx'
import { motion } from 'framer-motion'
import { useFPSStore } from '@/lib/motion'

interface ConfidenceBarProps {
  /** 0 – 1 */
  confidence: number
  /** Show percentage label */
  showLabel?: boolean
  /** Bar height */
  height?: 'xs' | 'sm' | 'md'
  className?: string
  greenThreshold?: number
  amberThreshold?: number
  status?: 'active' | 'resolved'
}

function confidenceColor(c: number, status: 'active' | 'resolved' = 'active', green: number = 0.6, amber: number = 0.3): string {
  if (c >= green) return status === 'resolved' ? 'var(--ok)' : 'var(--brand)'
  if (c >= amber) return 'var(--sev-warn)'
  return 'var(--sev-crit)'
}

function confidenceGlow(c: number, status: 'active' | 'resolved' = 'active', green: number = 0.6, amber: number = 0.3): string {
  if (c >= green) return status === 'resolved' ? '0 0 6px var(--ok)' : '0 0 6px var(--brand)'
  if (c >= amber) return '0 0 6px var(--sev-warn)'
  return '0 0 6px var(--sev-crit)'
}

const heightMap = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
} as const

export function ConfidenceBar({
  confidence,
  showLabel = true,
  height = 'sm',
  className,
  greenThreshold = 0.6,
  amberThreshold = 0.3,
  status = 'active',
}: ConfidenceBarProps) {
  const pct = Math.round(Math.min(Math.max(confidence, 0), 1) * 100)
  const color = confidenceColor(confidence, status, greenThreshold, amberThreshold)
  const glow = confidenceGlow(confidence, status, greenThreshold, amberThreshold)
  const isShimmering = confidence < 0.4

  const fpsReduced = useFPSStore((s) => s.reducedMotion)
  const prefersReduced = (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || fpsReduced

  return (
    <div className={clsx('relative w-full pt-4 flex items-center', className)}>
      {/* Track */}
      <div
        className={clsx(
          'flex-1 rounded-full relative',
          'bg-bg-elevated border border-border',
          heightMap[height],
        )}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* Tick marks behind the fill */}
        <div className="absolute inset-0 pointer-events-none flex justify-between z-0">
          <div className="absolute left-[25%] top-0 bottom-0 w-px bg-white/5" />
          <div className="absolute left-[50%] top-0 bottom-0 w-px bg-white/5" />
          <div className="absolute left-[75%] top-0 bottom-0 w-px bg-white/5" />
        </div>

        {/* Fill */}
        <motion.div
          initial={{ width: prefersReduced ? `${pct}%` : 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
          className="h-full rounded-full relative overflow-hidden z-10"
          style={{
            backgroundColor: color,
            boxShadow: glow,
          }}
        >
          {isShimmering && (
            <div className="absolute inset-0 animate-conf-shimmer pointer-events-none" />
          )}
        </motion.div>

        {/* Floating Indicator Label */}
        {showLabel && (
          <motion.div
            initial={{ left: prefersReduced ? `${pct}%` : '0%' }}
            animate={{ left: `${pct}%` }}
            transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
            className="absolute -top-4 -translate-x-1/2 font-mono text-[10px] font-bold tabular-nums px-1.5 py-0.2 rounded bg-bg-surface border border-border/80 shadow-card z-20"
            style={{
              color,
              borderColor: `${color}40`,
            }}
          >
            {pct}%
          </motion.div>
        )}
      </div>
    </div>
  )
}
