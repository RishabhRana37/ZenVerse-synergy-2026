/**
 * Odometer — single animated number counter.
 *
 * Each digit column is a fixed-width slot (tabular-nums, font-mono).
 * On value change: the new digit slides in from below (translateY +100% → 0),
 * the old one slides out above (0 → -100%). 300ms ease-out, no layout shift.
 *
 * Props:
 *   value      — the current integer or float value to display
 *   format     — 'integer' | 'percent2' (e.g. 99.86%) | 'float1' (e.g. 12.4)
 *   className  — extra class names on wrapper
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { clsx } from 'clsx'

type OdometerFormat = 'integer' | 'percent2' | 'float1'

interface OdometerProps {
  value: number | null
  format?: OdometerFormat
  className?: string
  digitClassName?: string
}

function formatValue(value: number, format: OdometerFormat): string {
  switch (format) {
    case 'integer':
      return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
    case 'percent2':
      return (value * 100).toFixed(2) + '%'
    case 'float1':
      return value.toFixed(1)
  }
}

/**
 * A single character cell — slides the digit in from below when it changes.
 * Uses AnimatePresence with a unique `key` per value to re-trigger animation.
 */
function Digit({ char, digitClassName }: { char: string; digitClassName?: string }) {
  return (
    <span
      className={clsx('relative inline-block overflow-hidden', digitClassName)}
      style={{ minWidth: '0.6ch' }}
      aria-hidden="true"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={char}
          className="inline-block"
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: '0%',   opacity: 1 }}
          exit={{    y: '-100%', opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          {char}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export function Odometer({
  value,
  format = 'integer',
  className,
  digitClassName,
}: OdometerProps) {
  const [displayStr, setDisplayStr] = useState<string>(
    value !== null ? formatValue(value, format) : '—',
  )

  const prevRef = useRef<string>(displayStr)

  useEffect(() => {
    const next = value !== null ? formatValue(value, format) : '—'
    if (next !== prevRef.current) {
      prevRef.current = next
      setDisplayStr(next)
    }
  }, [value, format])

  // Split into characters and render each as an animated Digit
  const chars = displayStr.split('')

  return (
    <span
      className={clsx('inline-flex items-baseline font-mono tabular-nums', className)}
      aria-label={displayStr}
    >
      {chars.map((char, i) => (
        // Non-digit characters (commas, dots, %) don't animate
        /[\d]/.test(char) ? (
          <Digit key={i} char={char} digitClassName={digitClassName} />
        ) : (
          <span key={i} className={digitClassName} style={{ minWidth: '0.35ch' }}>
            {char}
          </span>
        )
      ))}
    </span>
  )
}
