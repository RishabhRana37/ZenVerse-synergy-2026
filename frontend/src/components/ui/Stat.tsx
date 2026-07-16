/**
 * Stat — hero numeric display with label.
 * Uses tabular numerals and JetBrains Mono to prevent counter jitter.
 */

import { clsx } from 'clsx'

interface StatProps {
  label: string
  value: string | number
  /** Optional unit displayed after the value in muted text */
  unit?: string
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Semantic color for the value */
  color?: 'primary' | 'accent' | 'critical' | 'warning' | 'muted'
  className?: string
  /** Show a subtle animated pulse when value changes */
  animate?: boolean
}

const sizeMap = {
  sm: 'text-hero-sm',
  md: 'text-hero',
  lg: 'text-hero-lg',
} as const

const colorMap = {
  primary:  'text-text-primary',
  accent:   'text-accent',
  critical: 'text-severity-critical',
  warning:  'text-severity-warning',
  muted:    'text-text-muted',
} as const

export function Stat({ label, value, unit, size = 'md', color = 'primary', className, animate: _animate }: StatProps) {
  return (
    <div className={clsx('flex flex-col gap-0.5', className)}>
      <span className="text-[11px] font-medium uppercase tracking-widest text-text-muted">
        {label}
      </span>
      <span
        className={clsx(
          'font-mono font-semibold tabular leading-none',
          sizeMap[size],
          colorMap[color],
        )}
      >
        {value}
        {unit && (
          <span className="text-text-muted text-ui ml-1 font-sans font-normal">
            {unit}
          </span>
        )}
      </span>
    </div>
  )
}
