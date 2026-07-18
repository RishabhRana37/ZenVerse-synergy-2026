import { forwardRef } from 'react'
import { clsx } from 'clsx'
import { useFPSStore } from '@/lib/motion'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Use 'elevated' for modals/popovers, 'surface' (default) for panels */
  variant?: 'surface' | 'elevated'
  /** Adds hover border brightening and optional lift */
  interactive?: boolean
  /** Adds a left accent border in the given color */
  accent?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddingMap = {
  none: '',
  sm:   'p-3',
  md:   'p-5',
  lg:   'p-6',
} as const

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'surface', interactive = false, accent, padding = 'md', className, style, children, ...props }, ref) => {
    const bg = variant === 'elevated' ? 'bg-bg-elevated' : 'bg-bg-surface'
    const shadowClass = variant === 'elevated' ? 'shadow-elevated' : 'shadow-card'
    const reducedMotion = useFPSStore((s) => s.reducedMotion)

    return (
      <div
        ref={ref}
        className={clsx(
          'rounded-card border border-border transition-all duration-150 ease-out',
          bg,
          shadowClass,
          paddingMap[padding],
          interactive && clsx(
            'cursor-pointer hover:bg-bg-hover hover:border-border-hover',
            !reducedMotion && 'hover:-translate-y-[1px]'
          ),
          className,
        )}
        style={{
          ...(accent ? { borderLeftColor: accent, borderLeftWidth: '2.5px' } : {}),
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
