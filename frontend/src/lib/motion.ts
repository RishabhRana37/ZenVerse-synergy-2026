import { create } from 'zustand'

export const SPRING = {
  type: 'spring' as const,
  stiffness: 260,
  damping: 26,
}

export const springPreset = SPRING

export const EASE = [0.4, 0, 0.2, 1] as const
export const easePreset = 'cubic-bezier(0.4, 0, 0.2, 1)'

export const DUR_MICRO = 0.15
export const DUR_ENTER = 0.3

export const entranceVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      ease: EASE,
      duration: DUR_ENTER,
    },
  },
}

export const staggerContainerVariants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
    },
  },
}

// ── FPS Store ──────────────────────────────────────────────────────────────
interface FPSState {
  fps: number
  reducedMotion: boolean
  updateFPS: (fps: number) => void
}

export const useFPSStore = create<FPSState>((set) => ({
  fps: 60,
  reducedMotion: false,
  updateFPS: (fps) =>
    set((state) => {
      // Degrade to reduced motion if FPS falls below 35
      const isLow = fps < 35
      return {
        fps,
        reducedMotion: isLow || state.reducedMotion,
      }
    }),
}))
