import { clsx } from 'clsx'

interface EyebrowProps {
  children: React.ReactNode
  className?: string
}

export function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <span
      className={clsx(
        "text-[10px] font-semibold tracking-[0.09em] uppercase text-text-muted select-none block mb-1 font-sans",
        className
      )}
    >
      {children}
    </span>
  )
}
