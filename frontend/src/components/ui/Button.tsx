import { forwardRef } from 'react'
import { clsx } from 'clsx'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
  size?: 'sm' | 'md' | 'lg'
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', icon, iconPosition = 'left', className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          // Base
          'inline-flex items-center justify-center gap-1.5 font-sans font-medium transition-all duration-120 select-none outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
          // Radii & spacing
          size === 'sm' && 'px-2.5 py-1 text-[11px] rounded-sm',
          size === 'md' && 'px-3 py-1.5 text-ui-sm rounded-md',
          size === 'lg' && 'px-4 py-2 text-ui rounded-lg',
          // Variants
          variant === 'primary' && 'bg-text-primary text-text-inverse hover:opacity-90 active:scale-[0.98]',
          variant === 'secondary' && 'bg-bg-surface border border-border hover:bg-bg-hover hover:border-border-strong text-text-primary active:scale-[0.98]',
          variant === 'ghost' && 'text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-md',
          variant === 'danger' && 'bg-severity-critical/10 border border-severity-critical/20 text-severity-critical hover:bg-severity-critical/20 active:scale-[0.98]',
          variant === 'accent' && 'bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 active:scale-[0.98]',
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
