import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStreamStore } from '@/store/stream'

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
        const targetX = cardRect.left + 24
        const targetY = cardRect.top + 24

        // 3. Find visible rows in the storm panel
        const visibleAlertIds: string[] = []
        for (const id of alertIds) {
          const rowEl = document.querySelector(`[data-alert-id="${id}"]`)
          if (rowEl) {
            visibleAlertIds.push(id)
          }
        }

        // Sample up to 8 visible rows
        const sampledIds = visibleAlertIds.slice(0, 8)
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
            delay: index * 30, // 30ms stagger
          })
        })

        // Limit concurrent particles to 24 max
        setParticles((prev) => {
          const combined = [...prev, ...newParticles]
          if (combined.length > 24) {
            // Drop excess oldest ones
            return combined.slice(combined.length - 24)
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

          return (
            <motion.div
              key={p.id}
              initial={{
                x: p.startX,
                y: p.startY,
                scale: 1,
                opacity: 0.8,
              }}
              animate={{
                x: [p.startX, midX, p.endX],
                y: [p.startY, midY, p.endY],
                scale: [1, 0.7, 0.3],
                opacity: [0.8, 0.6, 0],
              }}
              transition={{
                duration: 0.45,
                delay: p.delay / 1000,
                ease: 'easeIn',
              }}
              onAnimationComplete={() => {
                removeParticle(p.id)
                // Pulse target card on arrival
                window.dispatchEvent(new CustomEvent(`stormlens-card-pulse-${p.incidentId}`))
              }}
              className="absolute w-[60px] h-[16px] rounded-full border pointer-events-none"
              style={{
                borderColor: p.color,
                backgroundColor: `${p.color}15`,
                boxShadow: `0 0 6px ${p.color}40`,
              }}
            />
          )
        })}
      </AnimatePresence>
    </div>
  )
}
