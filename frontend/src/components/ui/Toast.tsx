import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Alert } from '@/lib/types'
import { clsx } from 'clsx'
import { X } from 'lucide-react'
import { SPRING } from '@/lib/motion'

interface ToastItem {
  id: string
  message: string
  severity?: 'critical' | 'warning' | 'info'
  type: 'system' | 'alert'
  alert?: Alert
  timestamp: number
}

export function Toast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [isHovered, setIsHovered] = useState(false)

  // 1. Listen to system and alert events
  useEffect(() => {
    const handleSystemToast = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const message = typeof detail === 'string' ? detail : detail?.message || ''
      if (!message) return

      const newToast: ToastItem = {
        id: `toast-${Date.now()}-${Math.random()}`,
        message,
        type: 'system',
        timestamp: Date.now(),
      }
      setToasts((prev) => [...prev, newToast])
    }

    const handleNewAlertToast = (e: Event) => {
      const alert = (e as CustomEvent<Alert>).detail
      if (!alert) return

      const newToast: ToastItem = {
        id: alert.id,
        message: alert.message,
        severity: alert.severity,
        type: 'alert',
        alert,
        timestamp: Date.now(),
      }
      setToasts((prev) => {
        // Prevent duplicate toasts for same alert ID
        if (prev.some((t) => t.id === alert.id)) return prev
        return [...prev, newToast]
      })
    }

    window.addEventListener('stormlens-toast', handleSystemToast as EventListener)
    window.addEventListener('stormlens-new-alert', handleNewAlertToast as EventListener)

    return () => {
      window.removeEventListener('stormlens-toast', handleSystemToast as EventListener)
      window.removeEventListener('stormlens-new-alert', handleNewAlertToast as EventListener)
    }
  }, [])

  // 2. Manage auto-dismiss timers (pinned critical alerts, 4s for low-severity)
  useEffect(() => {
    const timers = toasts.map((toast) => {
      const isCritical = toast.type === 'alert' && toast.severity === 'critical'
      if (isCritical) return null // Critical alerts stay pinned

      return setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id))
      }, 4000)
    })

    return () => {
      timers.forEach((t) => t && clearTimeout(t))
    }
  }, [toasts])

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  // Cap visible items to last 3 for stacking, but let users see older when hovered
  const visibleToasts = isHovered ? toasts : toasts.slice(-3)

  return (
    <div
      className="fixed bottom-6 right-6 z-[var(--z-toast)] flex flex-col items-end pointer-events-none select-none"
      aria-live="polite"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ width: '360px', height: 'auto' }}
    >
      <div className="relative w-full flex flex-col justify-end items-end">
        <AnimatePresence mode="popLayout">
          {visibleToasts.map((toast, idx) => {
            const visualIndex = visibleToasts.length - 1 - idx
            const isCritical = toast.type === 'alert' && toast.severity === 'critical'

            // Dynamic offsets for Sonner stacking look
            const yOffset = isHovered ? -visualIndex * 56 : -visualIndex * 10
            const scaleOffset = isHovered ? 1.0 : 1 - visualIndex * 0.05
            const zIndexOffset = 50 - visualIndex

            return (
              <motion.div
                layout
                key={toast.id}
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                animate={{
                  opacity: 1,
                  y: yOffset,
                  scale: scaleOffset,
                  pointerEvents: 'auto',
                }}
                exit={{ opacity: 0, x: 100, scale: 0.95 }}
                transition={SPRING}
                style={{
                  zIndex: zIndexOffset,
                  position: visualIndex === 0 ? 'relative' : 'absolute',
                  bottom: 0,
                  width: '320px',
                }}
                drag="x"
                dragConstraints={{ left: 0, right: 300 }}
                dragElastic={{ left: 0.1, right: 0.8 }}
                onDragEnd={(_, info) => {
                  if (info.offset.x > 80) {
                    dismissToast(toast.id)
                  }
                }}
                className={clsx(
                  "bg-[#131312]/95 border rounded-card p-3 shadow-[0_4px_20px_rgba(0,0,0,0.4)] backdrop-blur-md cursor-grab active:cursor-grabbing select-none flex items-start gap-3 transition-colors duration-120",
                  isCritical ? "border-severity-critical/30" : "border-border/80"
                )}
              >
                {/* Indicator Dot */}
                <div className="flex-shrink-0 mt-1">
                  {toast.type === 'alert' ? (
                    <span
                      className={clsx(
                        "w-2 h-2 rounded-full inline-block animate-pulse-dot",
                        toast.severity === 'critical' && "bg-sev-crit",
                        toast.severity === 'warning' && "bg-sev-warn",
                        toast.severity === 'info' && "bg-sev-info"
                      )}
                    />
                  ) : (
                    <span className="w-2 h-2 rounded-full inline-block bg-brand animate-pulse-dot" />
                  )}
                </div>

                {/* Message Body */}
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[10px] font-mono text-text-muted uppercase font-bold tracking-wider">
                      {toast.type === 'alert' ? `${toast.severity} alert` : 'system notification'}
                    </span>
                    {isCritical && (
                      <span className="text-[10px] font-sans font-semibold text-severity-critical bg-severity-critical/15 px-1 py-0.2 rounded uppercase leading-none">
                        Pinned
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-text-primary leading-snug font-sans truncate-2-lines select-text select-none">
                    {toast.message}
                  </p>
                </div>

                {/* Close Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    dismissToast(toast.id)
                  }}
                  aria-label="Dismiss notification"
                  className="flex-shrink-0 text-text-muted hover:text-text-primary transition-colors p-0.5 rounded hover:bg-bg-hover text-[10px] w-4 h-4 flex items-center justify-center cursor-pointer"
                >
                  <X size={16} className="text-current" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}

