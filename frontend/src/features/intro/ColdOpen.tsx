import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { useFocusTrap } from '@/hooks/useFocusTrap'

interface ColdOpenProps {
  onComplete: () => void
}

export function ColdOpen({ onComplete }: ColdOpenProps) {
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<'loading' | 'filled' | 'reveal'>('loading')
  const [maskRadius, setMaskRadius] = useState(0)
  const focusTrapRef = useFocusTrap(true)

  // 1. Save to session storage and call onComplete
  const handleSkip = () => {
    try {
      sessionStorage.setItem('intro_seen', 'true')
    } catch {}
    onComplete()
  }

  // 2. Increment progress counter from 0 to 100
  useEffect(() => {
    const duration = 1800 // 1.8 seconds for smooth Obys loading sequence
    const startTime = performance.now()

    const update = (time: number) => {
      const elapsed = time - startTime
      const nextProgress = Math.min(100, Math.floor((elapsed / duration) * 100))
      setProgress(nextProgress)

      if (nextProgress < 100) {
        requestAnimationFrame(update)
      } else {
        setPhase('filled')
        // Short pause to show solid filled logo before circular lens reveal
        setTimeout(() => {
          setPhase('reveal')
        }, 600)
      }
    }
    requestAnimationFrame(update)
  }, [])

  // 3. Animate circular mask radius on reveal
  useEffect(() => {
    if (phase !== 'reveal') return

    // Calculate max radius to cover the screen diagonals (corner to corner)
    const maxRadius = Math.max(window.innerWidth, window.innerHeight) * 1.4
    const revealDuration = 1000
    let start: number | null = null

    const animateReveal = (time: number) => {
      if (!start) start = time
      const elapsed = time - start
      const t = Math.min(1, elapsed / revealDuration)

      // Custom smooth cubic ease for fluid iris opening
      const ease = t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2
      
      setMaskRadius(ease * maxRadius)

      if (t < 1) {
        requestAnimationFrame(animateReveal)
      } else {
        handleSkip()
      }
    }

    requestAnimationFrame(animateReveal)
  }, [phase])

  return (
    <motion.div
      ref={focusTrapRef}
      role="dialog"
      aria-modal="true"
      aria-label="Cinematic launch intro"
      style={{
        maskImage: `radial-gradient(circle at center, transparent ${maskRadius}px, black ${maskRadius}px)`,
        WebkitMaskImage: `radial-gradient(circle at center, transparent ${maskRadius}px, black ${maskRadius}px)`
      }}
      className="fixed inset-0 bg-[#0C0C0B] z-[var(--z-intro)] flex flex-col items-center justify-center font-sans overflow-hidden select-none"
    >
      {/* ── Reticle HUD Grid lines (Lens/Optical look) ───────────────────── */}
      <div className="absolute inset-0 pointer-events-none border border-border/10 m-10" aria-hidden="true" />
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border/[0.04]" aria-hidden="true" />
      <div className="absolute top-1/2 left-0 right-0 h-px bg-border/[0.04]" aria-hidden="true" />

      {/* Top Left Status Branding */}
      <div className="absolute top-8 left-8 flex items-center gap-2 font-mono text-[10px] text-text-secondary uppercase tracking-widest">
        <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse-dot" aria-hidden="true" />
        <span>StormLens Launch System v1.2</span>
      </div>

      {/* Top Right Branding */}
      <div className="absolute top-8 right-8 font-mono text-[10px] text-text-muted uppercase tracking-widest">
        <span>Team ZenVerse · Synergy 2026</span>
      </div>

      {/* ── Central Circular Obys Crescent Logo ─────────────────────────── */}
      <div className="relative flex flex-col items-center justify-center">
        <motion.div
          animate={
            phase === 'reveal'
              ? { scale: 3.5, opacity: 0 }
              : phase === 'filled'
              ? { scale: 1.08 }
              : { scale: 1 }
          }
          transition={{
            duration: phase === 'reveal' ? 0.8 : 0.4,
            ease: 'easeInOut'
          }}
          className="relative z-20 flex items-center justify-center w-64 h-64"
        >
          {/* Obys Logo Split Crescents */}
          <svg viewBox="0 0 200 200" className="w-full h-full text-text-primary transition-all duration-500 ease-in-out" aria-hidden="true">
            {/* Left Crescent */}
            <motion.path
              d="M 100 20 A 80 80 0 0 0 100 180 A 90 80 0 0 1 100 20 Z"
              fill={phase !== 'loading' ? '#ffffff' : 'transparent'}
              stroke="rgba(255, 255, 255, 0.55)"
              strokeWidth="1.2"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, ease: 'easeInOut' }}
            />
            {/* Right Crescent */}
            <motion.path
              d="M 100 20 A 90 80 0 0 1 100 180 A 80 80 0 0 0 100 20 Z"
              fill={phase !== 'loading' ? '#ffffff' : 'transparent'}
              stroke="rgba(255, 255, 255, 0.55)"
              strokeWidth="1.2"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, ease: 'easeInOut' }}
            />
          </svg>

          {/* Central Counter Display */}
          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
            <AnimatePresence>
              {phase === 'loading' && (
                <motion.span
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="font-mono text-xl font-bold tracking-[0.2em] pl-[0.2em] text-text-primary"
                >
                  {String(progress).padStart(3, '0')}%
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Bottom Left Branding */}
      <div className="absolute bottom-8 left-8 flex flex-col gap-1 select-none">
        <div className="text-sm font-semibold tracking-tight text-text-primary">StormLens</div>
        <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Chaos Visualized</div>
      </div>

      {/* Skip Action Button */}
      <div className="absolute bottom-8 right-8 z-30">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            handleSkip()
          }}
          aria-label="Skip cinematic introduction"
          className="font-mono text-[10px] text-text-muted hover:text-text-primary uppercase tracking-wider px-2.5 py-1"
        >
          Skip Intro ↵
        </Button>
      </div>
    </motion.div>
  )
}
export default ColdOpen
