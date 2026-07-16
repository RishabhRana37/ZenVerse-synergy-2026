/**
 * ConfidenceBar — animated fill bar for root-cause confidence scores.
 *
 * Color interpolates:
 *   ≥ 0.8  → accent green   (#2DD4A7)
 *   0.5–0.8 → warning amber  (#F5A623)
 *   < 0.5  → critical red   (#FF4D4F)
 */

import { clsx } from 'clsx'

interface ConfidenceBarProps {
  /** 0 – 1 */
  confidence: number
  /** Show percentage label */
  showLabel?: boolean
  /** Bar height */
  height?: 'xs' | 'sm' | 'md'
  className?: string
  animated?: boolean
  greenThreshold?: number
  amberThreshold?: number
}

function confidenceColor(c: number, green: number = 0.6, amber: number = 0.3): string {
  if (c >= green) return '#2DD4A7'
  if (c >= amber) return '#F5A623'
  return '#FF4D4F'
}

function confidenceGlow(c: number, green: number = 0.6, amber: number = 0.3): string {
  if (c >= green) return '0 0 6px rgba(45,212,167,0.4)'
  if (c >= amber) return '0 0 6px rgba(245,166,35,0.4)'
  return '0 0 6px rgba(255,77,79,0.4)'
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
  animated = true,
  greenThreshold = 0.6,
  amberThreshold = 0.3,
}: ConfidenceBarProps) {
  const pct = Math.round(Math.min(Math.max(confidence, 0), 1) * 100)
  const color = confidenceColor(confidence, greenThreshold, amberThreshold)
  const glow = confidenceGlow(confidence, greenThreshold, amberThreshold)
  const isShimmering = confidence < 0.4

  return (
    // relative + pt-4 ensures room for the floating text bubble above the bar
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
        {/* Fine tick marks at 25/50/75% behind the fill (1px, low alpha) */}
        <div className="absolute inset-0 pointer-events-none flex justify-between z-0">
          <div className="absolute left-[25%] top-0 bottom-0 w-px bg-white/5" />
          <div className="absolute left-[50%] top-0 bottom-0 w-px bg-white/5" />
          <div className="absolute left-[75%] top-0 bottom-0 w-px bg-white/5" />
        </div>

        {/* Fill */}
        <div
          className={clsx(
            'h-full rounded-full relative overflow-hidden z-10',
            animated && 'transition-[width] duration-700 ease-out',
          )}
          style={{
            width: `${pct}%`,
            minWidth: 0,
            backgroundColor: color,
            boxShadow: glow,
          }}
        >
          {/* Subtle animated shimmer for low confidence */}
          {isShimmering && (
            <div className="absolute inset-0 animate-conf-shimmer pointer-events-none" />
          )}
        </div>

        {/* Floating Indicator Label (Leading Edge) */}
        {showLabel && (
          <div
            className={clsx(
              'absolute -top-4 -translate-x-1/2 font-mono text-[9px] font-bold tabular-nums px-1.5 py-0.2 rounded bg-bg-surface border border-border/80 shadow-card z-20 transition-[left] duration-700 ease-out',
            )}
            style={{
              left: `${pct}%`,
              color,
              borderColor: `${color}40`,
            }}
          >
            {pct}%
          </div>
        )}
      </div>
    </div>
  )
}
