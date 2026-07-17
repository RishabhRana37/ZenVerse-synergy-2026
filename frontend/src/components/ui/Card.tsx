/**
 * Card — base surface container with optional hover state and click handler.
 * Depth comes from background color stepping, not drop shadows.
 */

import { forwardRef } from 'react'
import { clsx } from 'clsx'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Use 'elevated' for modals/popovers, 'surface' (default) for panels */
  variant?: 'surface' | 'elevated'
  /** Adds hover ring and cursor-pointer */
  interactive?: boolean
  /** Adds a left accent border in the given color */
  accent?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddingMap = {
  none: '',
  sm:   'p-3',
  md:   'p-4',
  lg:   'p-5',
} as const

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'surface', interactive = false, accent, padding = 'md', className, style, children, ...props }, ref) => {
    const bg = variant === 'elevated' ? 'bg-bg-elevated' : 'bg-bg-surface'
    return (
      <div
        ref={ref}
        className={clsx(
          'rounded-card border border-border',
          bg,
          paddingMap[padding],
          interactive && 'cursor-pointer transition-all duration-120 hover:bg-bg-hover hover:border-border-strong',
          className,
        )}
        style={{
          ...(accent ? { borderLeftColor: accent, borderLeftWidth: '2px' } : {}),
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    )
  },
)

Card.displayName = 'Card'
