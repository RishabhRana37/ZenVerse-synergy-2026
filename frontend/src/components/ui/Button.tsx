import { forwardRef } from 'react'
import { clsx } from 'clsx'
import { useFPSStore } from '@/lib/motion'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
  size?: 'sm' | 'md' | 'lg'
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', icon, iconPosition = 'left', className, children, ...props }, ref) => {
    const reducedMotion = useFPSStore((s) => s.reducedMotion)

    return (
      <button
        ref={ref}
        className={clsx(
          // Base
          'inline-flex items-center justify-center gap-1.5 font-sans font-medium transition-all duration-150 select-none outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:shadow-[0_0_8px_rgba(245,165,36,0.3)] disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
          !reducedMotion && 'active:scale-[0.98]',
          // Radii & spacing
          size === 'sm' && 'px-2.5 py-1 text-[11px] rounded-badge',
          size === 'md' && 'px-3.5 py-1.5 text-ui-sm rounded-card',
          size === 'lg' && 'px-5 py-2.5 text-ui rounded-card',
          // Variants
          variant === 'primary' && 'bg-brand text-brand-on font-bold border border-brand/25 hover:bg-brand-hover hover:border-brand-hover shadow-sm',
          variant === 'secondary' && 'bg-transparent border border-border-strong text-text-hi hover:border-brand hover:bg-bg-raised-2/20 shadow-sm',
          variant === 'ghost' && 'text-text-secondary hover:text-text-primary hover:bg-bg-hover',
          variant === 'danger' && 'bg-sev-crit-dim border border-sev-crit/20 text-sev-crit hover:bg-sev-crit-dim/80',
          variant === 'accent' && 'bg-brand-dim border border-brand/30 text-brand hover:bg-brand-dim/80',
          className
        )}
        {...props}
      >
        {icon && iconPosition === 'left' && <span className="flex-shrink-0">{icon}</span>}
        {children}
        {icon && iconPosition === 'right' && <span className="flex-shrink-0">{icon}</span>}
      </button>
    )
  }
)

Button.displayName = 'Button'
