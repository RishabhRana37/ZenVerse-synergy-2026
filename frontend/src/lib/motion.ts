import { create } from 'zustand'

interface FPSState {
  fps: number
  reducedMotion: boolean
  updateFPS: (fps: number) => void
  setReducedMotion: (reduced: boolean) => void
}

export const useFPSStore = create<FPSState>((set) => ({
  fps: 60,
  reducedMotion: false,
  updateFPS: (fps) =>
    set((state) => {
      // If FPS drops below 40, auto-enable reduced motion to conserve resources.
      // If it recovers above 50, restore regular animations.
      const shouldReduce = fps < 40 ? true : fps > 50 ? false : state.reducedMotion
      return { fps, reducedMotion: shouldReduce }
    }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
}))

export const springPreset = {
  type: 'spring',
  stiffness: 300,
  damping: 28,
  mass: 0.8,
}
