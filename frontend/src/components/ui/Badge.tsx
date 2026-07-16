/**
 * Badge — small pill label. Three severity variants + generic.
 */

import { clsx } from 'clsx'
import type { Severity } from '@/lib/types'

type BadgeVariant = Severity | 'neutral' | 'accent' | 'resolved'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
  dot?: boolean
}

const variantStyles: Record<BadgeVariant, string> = {
  critical: 'bg-[rgba(255,77,79,0.12)] text-severity-critical border border-[rgba(255,77,79,0.3)]',
  warning:  'bg-[rgba(245,166,35,0.12)] text-severity-warning border border-[rgba(245,166,35,0.3)]',
  info:     'bg-[rgba(77,159,255,0.12)] text-[#4D9FFF] border border-[rgba(77,159,255,0.3)]',
  neutral:  'bg-bg-elevated text-text-secondary border border-border',
  accent:   'bg-accent-dim text-accent border border-[rgba(45,212,167,0.3)]',
  resolved: 'bg-[rgba(45,212,167,0.08)] text-accent border border-[rgba(45,212,167,0.2)]',
}

const dotColors: Record<BadgeVariant, string> = {
  critical: 'bg-severity-critical',
  warning:  'bg-severity-warning',
  info:     'bg-[#4D9FFF]',
  neutral:  'bg-text-muted',
  accent:   'bg-accent',
  resolved: 'bg-accent',
}

export function Badge({ variant = 'neutral', children, className, dot = false }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5',
        'rounded-badge px-1.5 py-0.5',
        'text-[11px] font-medium leading-none font-mono tabular',
        'uppercase tracking-wide',
        variantStyles[variant],
        className,
      )}
    >
      {dot && (
        <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', dotColors[variant])} />
      )}
      {children}
    </span>
  )
}
