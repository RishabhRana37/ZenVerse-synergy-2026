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
  critical: 'bg-sev-crit-dim text-sev-crit border border-sev-crit/30',
  warning:  'bg-sev-warn-dim text-sev-warn border border-sev-warn/30',
  info:     'bg-sev-info-dim text-sev-info border border-sev-info/30',
  neutral:  'bg-bg-elevated text-text-secondary border border-border',
  accent:   'bg-brand-dim text-brand border border-brand/30',
  resolved: 'bg-ok-dim text-ok border border-ok/25',
}

const dotColors: Record<BadgeVariant, string> = {
  critical: 'bg-sev-crit',
  warning:  'bg-sev-warn',
  info:     'bg-sev-info',
  neutral:  'bg-text-muted',
  accent:   'bg-brand',
  resolved: 'bg-ok',
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
