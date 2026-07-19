import { clsx } from 'clsx'

interface ReticleLogoProps {
  connection: 'open' | 'connecting' | 'closed'
}

export function ReticleLogo({ connection }: ReticleLogoProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-text-primary flex-shrink-0 select-none"
    >
      {/* Reticle Circle — draws on connect */}
      <circle
        cx="10"
        cy="10"
        r="7"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        className={clsx(connection === 'open' && "animate-draw-circle")}
        style={{
          strokeDasharray: '44',
          strokeDashoffset: connection === 'open' ? '0' : '44',
        }}
      />

      {/* Crosshair Ticks (North/South/West/East) */}
      <line x1="10" y1="0" x2="10" y2="1.8" stroke="currentColor" strokeWidth="1.2" />
      <line x1="10" y1="18.2" x2="10" y2="20" stroke="currentColor" strokeWidth="1.2" />
      <line x1="0" y1="10" x2="1.8" y2="10" stroke="currentColor" strokeWidth="1.2" />
      <line x1="18.2" y1="10" x2="20" y2="10" stroke="currentColor" strokeWidth="1.2" />

      {/* Connection Indicator Accent Dot (at 2 o'clock) */}
      <circle
        cx="16.5"
        cy="4.5"
        r="1.8"
        fill={
          connection === 'open'
            ? '#2FB8A6'
            : connection === 'connecting'
            ? '#E8A33D'
            : '#E5484D'
        }
        className={clsx(
          (connection === 'open' || connection === 'connecting') && "animate-pulse-dot"
        )}
      />
    </svg>
  )
}
