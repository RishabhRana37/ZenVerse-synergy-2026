import { clsx } from 'clsx'

interface KbdProps {
  children: React.ReactNode
  className?: string
}

export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={clsx(
        "inline-flex items-center justify-center px-1.5 py-0.5 rounded border border-border bg-bg-surface font-mono text-[9px] font-bold text-text-muted select-none shadow-sm shadow-black/20",
        className
      )}
    >
      {children}
    </kbd>
  )
}
