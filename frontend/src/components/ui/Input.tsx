import { forwardRef } from 'react'
import { clsx } from 'clsx'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
  icon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error = false, icon, className, ...props }, ref) => {
    return (
      <div className="relative w-full flex items-center">
        {icon && (
          <div className="absolute left-3 text-text-muted pointer-events-none flex items-center justify-center">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={clsx(
            // Base
            'w-full bg-bg-surface border font-sans text-ui-sm text-text-primary outline-none transition-all duration-120 placeholder-text-muted rounded-md',
            // Spacing
            icon ? 'pl-9 pr-3 py-1.5' : 'px-3 py-1.5',
            // States & errors
            error
              ? 'border-severity-critical focus:border-severity-critical focus:ring-1 focus:ring-severity-critical/20'
              : 'border-border hover:border-border-strong focus:border-accent focus:ring-1 focus:ring-accent/15',
            className
          )}
          {...props}
        />
      </div>
    )
  }
)

Input.displayName = 'Input'
