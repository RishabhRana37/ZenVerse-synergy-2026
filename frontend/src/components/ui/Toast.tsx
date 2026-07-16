import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function Toast() {
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const handleToast = (e: Event) => {
      const msg = (e as CustomEvent<{ message: string }>).detail.message
      setToast(msg)
    }

    window.addEventListener('stormlens-toast', handleToast as EventListener)
    return () => window.removeEventListener('stormlens-toast', handleToast as EventListener)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => {
      setToast(null)
    }, 3000)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded border border-accent bg-[#0B1519] text-accent text-[11px] font-mono font-semibold tracking-wide shadow-[0_0_15px_rgba(45,212,167,0.15)] flex items-center gap-2 select-none"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping shrink-0" />
          {toast}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
