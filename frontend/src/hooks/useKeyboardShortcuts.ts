import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useStreamStore } from '@/store/stream'
import { audioManager } from '@/lib/audio'

export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const location = useLocation()
  const clearStore = useStreamStore((s) => s.clearAllState)

  const [showOverlay, setShowOverlay] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts if user is typing in a form input or select
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'select' || tag === 'textarea') {
        return
      }

      const key = e.key.toLowerCase()

      // ? — Toggle help overlay
      if (e.key === '?') {
        e.preventDefault()
        setShowOverlay((prev) => !prev)
        return
      }

      // S — Start Replay
      if (key === 's') {
        e.preventDefault()
        const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8788'
        fetch(`${apiBase}/replay/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenario: 'db-cascade', speed: 1 }),
        }).catch((err) => console.error('[shortcuts] failed to start replay:', err))
        return
      }

      // X — Stop Replay
      if (key === 'x') {
        e.preventDefault()
        const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8788'
        fetch(`${apiBase}/replay/stop`, { method: 'POST' }).catch((err) =>
          console.error('[shortcuts] failed to stop replay:', err)
        )
        return
      }

      // R — Reset (stop + clear store + restart mock scenario after a beat)
      if (key === 'r') {
        e.preventDefault()
        const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8788'
        
        // Stop first
        fetch(`${apiBase}/replay/stop`, { method: 'POST' })
          .then(() => {
            // Clear local store
            clearStore()
            // Restart scenario after a 300ms beat
            setTimeout(() => {
              fetch(`${apiBase}/replay/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scenario: 'db-cascade', speed: 1 }),
              }).catch((err) => console.error('[shortcuts] failed to restart scenario:', err))
            }, 300)
          })
          .catch((err) => console.error('[shortcuts] failed during reset:', err))
        return
      }

      // E — Toggle /eval
      if (key === 'e') {
        e.preventDefault()
        if (location.pathname === '/eval') {
          navigate('/')
        } else {
          navigate('/eval')
        }
        return
      }

      // W — Go to War Room
      if (key === 'w') {
        e.preventDefault()
        navigate('/')
        return
      }

      // M — Mute / Unmute Ambience
      if (key === 'm') {
        e.preventDefault()
        audioManager.toggleMute()
        return
      }

      // 1 / 2 / 3 — Open incident cards (only in War Room '/')
      if (location.pathname === '/') {
        if (key === '1' || key === '2' || key === '3') {
          e.preventDefault()
          const index = parseInt(key, 10) - 1
          window.dispatchEvent(
            new CustomEvent('stormlens-shortcut-incident', { detail: index })
          )
          return
        }
      }

      // Escape — Close slide-over
      if (e.key === 'Escape') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('stormlens-shortcut-close'))
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [location.pathname, navigate, clearStore])

  return { showOverlay, setShowOverlay }
}
