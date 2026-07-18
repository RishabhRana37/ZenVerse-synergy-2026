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
          'inline-flex items-center justify-center gap-1.5 font-sans font-medium transition-all duration-150 select-none outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:shadow-[0_0_8px_rgba(45,212,167,0.3)] disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
          !reducedMotion && 'active:scale-[0.98]',
          // Radii & spacing
          size === 'sm' && 'px-2.5 py-1 text-[11px] rounded-badge',
          size === 'md' && 'px-3.5 py-1.5 text-ui-sm rounded-card',
          size === 'lg' && 'px-5 py-2.5 text-ui rounded-card',
          // Variants
          variant === 'primary' && 'bg-gradient-to-b from-accent to-[#24B08A] text-[#0A0E14] font-bold shadow-sm hover:shadow-[0_0_8px_rgba(45,212,167,0.35)] border border-accent/25',
          variant === 'secondary' && 'bg-bg-surface border border-border hover:bg-bg-hover hover:border-border-hover text-text-primary shadow-sm',
          variant === 'ghost' && 'text-text-secondary hover:text-text-primary hover:bg-bg-hover',
          variant === 'danger' && 'bg-severity-critical/10 border border-severity-critical/20 text-severity-critical hover:bg-severity-critical/20',
          variant === 'accent' && 'bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20',
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
