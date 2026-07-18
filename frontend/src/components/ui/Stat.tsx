import { Card } from '@/components/ui/Card'
import { Eyebrow } from '@/components/ui/Eyebrow'
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
  /** Optional trend pill metadata */
  trend?: {
    value: string | number
    direction: 'up' | 'down' | 'neutral'
  }
}

const sizeMap = {
  sm: 'text-[22px]',
  md: 'text-[28px]',
  lg: 'text-[36px]',
} as const

const colorMap = {
  primary:  'text-text-primary',
  accent:   'text-accent',
  critical: 'text-severity-critical',
  warning:  'text-severity-warning',
  muted:    'text-text-muted',
} as const

export function Stat({ label, value, unit, size = 'md', color = 'primary', className, trend }: StatProps) {
  return (
    <Card className={clsx("flex flex-col gap-1.5 min-w-[120px]", className)}>
      <Eyebrow>{label}</Eyebrow>
      <div className="flex items-baseline justify-between gap-2 select-text">
        <span
          className={clsx(
            'font-mono font-semibold tabular leading-none tracking-tight',
            sizeMap[size],
            colorMap[color],
          )}
        >
          {value}
          {unit && (
            <span className="text-text-muted text-[13px] ml-1 font-sans font-normal">
              {unit}
            </span>
          )}
        </span>
        {trend && (
          <span
            className={clsx(
              "text-[9.5px] px-1.5 py-0.5 rounded-full font-mono font-bold select-none leading-none tracking-wider uppercase flex items-center gap-0.5",
              trend.direction === 'up' && "bg-severity-critical/10 text-severity-critical border border-severity-critical/20",
              trend.direction === 'down' && "bg-severity-info/10 text-severity-info border border-severity-info/20",
              trend.direction === 'neutral' && "bg-bg-elevated text-text-secondary border border-border"
            )}
          >
            <span>{trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '■'}</span>
            <span>{trend.value}</span>
          </span>
        )}
      </div>
    </Card>
  )
}
