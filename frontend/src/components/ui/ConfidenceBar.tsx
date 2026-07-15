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
}

function confidenceColor(c: number): string {
  if (c >= 0.8) return '#2DD4A7'
  if (c >= 0.5) return '#F5A623'
  return '#FF4D4F'
}

function confidenceGlow(c: number): string {
  if (c >= 0.8) return '0 0 6px rgba(45,212,167,0.4)'
  if (c >= 0.5) return '0 0 6px rgba(245,166,35,0.4)'
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
}: ConfidenceBarProps) {
  const pct = Math.round(Math.min(Math.max(confidence, 0), 1) * 100)
  const color = confidenceColor(confidence)
  const glow = confidenceGlow(confidence)

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      {/* Track */}
      <div
        className={clsx(
          'flex-1 rounded-full overflow-hidden',
          'bg-bg-elevated border border-border',
          heightMap[height],
        )}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* Fill */}
        <div
          className={clsx(
            'h-full rounded-full',
            animated && 'transition-[width] duration-700 ease-out',
          )}
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            boxShadow: glow,
          }}
        />
      </div>

      {/* Label */}
      {showLabel && (
        <span
          className="font-mono text-[11px] tabular font-medium w-8 text-right"
          style={{ color }}
        >
          {pct}%
        </span>
      )}
    </div>
  )
}
