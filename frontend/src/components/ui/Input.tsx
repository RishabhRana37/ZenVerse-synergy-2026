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
            'w-full bg-bg-surface/80 border font-sans text-ui-sm text-text-primary outline-none transition-all duration-150 ease-out placeholder-text-muted rounded-[10px] backdrop-blur-md',
            // Spacing
            icon ? 'pl-9 pr-3.5 py-1.8' : 'px-3.5 py-1.8',
            // States & errors
            error
              ? 'border-severity-critical focus:border-severity-critical focus:ring-2 focus:ring-severity-critical/40'
              : 'border-border hover:border-border-hover focus:border-accent/80 focus:ring-2 focus:ring-accent/40',
            className
          )}
          {...props}
        />
      </div>
    )
  }
)

Input.displayName = 'Input'
