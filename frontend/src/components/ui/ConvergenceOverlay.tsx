import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStreamStore } from '@/store/stream'
import { fpsGuard } from '@/lib/fpsGuard'
import { audioManager } from '@/lib/audio'
import { EASE, DUR_ENTER } from '@/lib/motion'

interface Particle {
  id: string
  incidentId: string
  startX: number
  startY: number
  endX: number
  endY: number
  color: string
  delay: number
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#FF4D4F',
  warning:  '#F5A623',
  info:     '#4D9FFF',
}

export function ConvergenceOverlay() {
  const [particles, setParticles] = useState<Particle[]>([])
  const alertsIndex = useStreamStore((s) => s.alertIndex)
  const particlesRef = useRef(particles)
  particlesRef.current = particles

  useEffect(() => {
    const handleConvergence = (e: Event) => {
      const customEvent = e as CustomEvent<{
        incidentId: string
        alertIds: string[]
        isNew: boolean
      }>
      
      const { incidentId, alertIds } = customEvent.detail

      // 1. Check prefers-reduced-motion
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (prefersReduced) {
        // Dispatch pulse event immediately
        window.dispatchEvent(new CustomEvent(`stormlens-card-pulse-${incidentId}`))
        return
      }

      // 2. Allow incident card to mount/materialize if new
      setTimeout(() => {
        const cardEl = document.querySelector(`[data-incident-id="${incidentId}"]`)
        if (!cardEl) return

        const cardRect = cardEl.getBoundingClientRect()
        // Target card's header position
        const targetX = cardRect.left + (cardRect.width * 0.15)
        const targetY = cardRect.top + 28

        // 3. Sub-sample alerts to cap density (staggered launch)
        const cap = fpsGuard.getParticleCap()
        const sampledIds = alertIds.slice(-cap)
        if (sampledIds.length === 0) return

        // 4. Spawn particles
        const newParticles: Particle[] = []
        const now = Date.now()

        sampledIds.forEach((id, index) => {
          const rowEl = document.querySelector(`[data-alert-id="${id}"]`)
          if (!rowEl) return

          const rowRect = rowEl.getBoundingClientRect()
          const startX = rowRect.left + 16
          const startY = rowRect.top + (rowRect.height / 2) - 8 // center vertically

          const alert = alertsIndex.get(id)
          const sev = alert?.severity || 'info'
          const color = SEVERITY_COLORS[sev] || '#2DD4A7'

          newParticles.push({
            id: `${now}-${id}-${index}`,
            incidentId,
            startX,
            startY,
            endX: targetX,
            endY: targetY,
            color,
            delay: index * 25, // 25ms stagger
          })
        })

        // Limit concurrent particles per FPS guard
        setParticles((prev) => {
          const combined = [...prev, ...newParticles]
          const capVal = fpsGuard.getParticleCap()
          if (combined.length > capVal) {
            return combined.slice(combined.length - capVal)
          }
          return combined
        })
      }, 60)
    }

    window.addEventListener('stormlens-convergence', handleConvergence)
    return () => window.removeEventListener('stormlens-convergence', handleConvergence)
  }, [alertsIndex])

  const removeParticle = (id: string) => {
    setParticles((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-[70] overflow-hidden">
      <AnimatePresence>
        {particles.map((p) => {
          // Slight arc math: lift the midpoint up in Y coordinates
          const midX = (p.startX + p.endX) / 2
          const midY = Math.min(p.startY, p.endY) - 100 // arc upward

          const isThrottled = fpsGuard.isThrottled()

          return (
            <motion.div
              key={p.id}
              initial={{
                x: p.startX,
                y: p.startY,
                scale: 1,
                opacity: 0.8,
                backgroundColor: p.color,
                borderColor: p.color,
                boxShadow: `0 0 6px ${p.color}`,
              }}
              animate={{
                x: [p.startX, midX, p.endX],
                y: [p.startY, midY, p.endY],
                scale: isThrottled ? [1, 0.8, 0.4] : [1, 0.7, 0.3],
                opacity: [0.8, 0.7, 0],
                backgroundColor: [p.color, p.color, '#2DD4A7'],
                borderColor: [p.color, p.color, '#2DD4A7'],
                boxShadow: [`0 0 6px ${p.color}`, `0 0 6px ${p.color}`, `0 0 6px #2DD4A7`],
              }}
              transition={{
                duration: DUR_ENTER,
                delay: p.delay / 1000,
                ease: EASE,
              }}
              onAnimationComplete={() => {
                removeParticle(p.id)
                // Pulse target card on arrival
                window.dispatchEvent(new CustomEvent(`stormlens-card-pulse-${p.incidentId}`))
                // Play whoosh on arrival
                audioManager.playWhoosh()
              }}
              className="absolute w-2.5 h-2.5 rounded-full border pointer-events-none"
            />
          )
        })}
      </AnimatePresence>
    </div>
  )
}
