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

type OdometerFormat = 'integer' | 'percent2' | 'percent1' | 'float1'
type OdometerEasing = 'spring' | 'linear' | 'default'

interface OdometerProps {
  value: number | null
  format?: OdometerFormat
  className?: string
  digitClassName?: string
  easing?: OdometerEasing
}

function formatValue(value: number, format: OdometerFormat): string {
  switch (format) {
    case 'integer':
      return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
    case 'percent2':
      return (value * 100).toFixed(2) + '%'
    case 'percent1':
      return (value * 100).toFixed(1) + '%'
    case 'float1':
      return value.toFixed(1)
  }
}

/**
 * A single character cell — slides the digit in from below when it changes.
 * Uses AnimatePresence with a unique `key` per value to re-trigger animation.
 */
function Digit({
  char,
  digitClassName,
  easing = 'default',
}: {
  char: string
  digitClassName?: string
  easing?: OdometerEasing
}) {
  const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let transition = prefersReduced
    ? { duration: 0 }
    : { duration: 0.25, ease: [0.22, 1, 0.36, 1] } // default fast ease-out

  if (!prefersReduced) {
    if (easing === 'spring') {
      transition = {
        type: 'spring',
        stiffness: 450,
        damping: 25, // very fast, settles within ~250ms, minor overshoot
        mass: 0.7,
      } as any
    } else if (easing === 'linear') {
      transition = {
        duration: 0.15,
        ease: 'linear',
      } as any
    }
  }

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
          initial={prefersReduced ? { y: 0, opacity: 1 } : { y: '100%', opacity: 0 }}
          animate={{ y: '0%',   opacity: 1 }}
          exit={prefersReduced ? { y: 0, opacity: 0 } : { y: '-100%', opacity: 0 }}
          transition={transition}
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
  easing = 'default',
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
          <Digit key={i} char={char} digitClassName={digitClassName} easing={easing} />
        ) : (
          <span key={i} className={digitClassName} style={{ minWidth: '0.35ch' }}>
            {char}
          </span>
        )
      ))}
    </span>
  )
}

