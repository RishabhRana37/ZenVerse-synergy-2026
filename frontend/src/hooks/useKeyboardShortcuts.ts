import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { audioManager } from '@/lib/audio'
import { startReplay, stopReplay, resetReplay } from '@/lib/actions'
import { usePresentationMode } from '@/lib/presentationMode'


export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const location = useLocation()
  const { toggle: togglePresentation } = usePresentationMode()

  const [showOverlay, setShowOverlay] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K triggers Command Palette (works even in inputs if needed, but usually we ignore it in inputs unless Cmd+K is pressed)
      const isK = e.key.toLowerCase() === 'k'
      const isCmdOrCtrl = e.metaKey || e.ctrlKey
      if (isCmdOrCtrl && isK) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('stormlens-open-palette'))
        return
      }

      // Ignore other shortcuts if user is typing in a form input or select
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
        startReplay('db-cascade', 1)
        return
      }

      // X — Stop Replay
      if (key === 'x') {
        e.preventDefault()
        stopReplay()
        return
      }

      // R — Reset (stop + clear store + restart scenario after a beat)
      if (key === 'r') {
        e.preventDefault()
        resetReplay('db-cascade', 1)
        return
      }

      // E — Toggle /eval
      if (key === 'e') {
        e.preventDefault()
        if (location.pathname === '/eval') {
          navigate('/war-room')
        } else {
          navigate('/eval')
        }
        return
      }

      // W — Go to War Room
      if (key === 'w') {
        e.preventDefault()
        navigate('/war-room')
        return
      }

      // M — Mute / Unmute Ambience
      if (key === 'm') {
        e.preventDefault()
        audioManager.toggleMute()
        return
      }

      // 1 / 2 / 3 — Open incident cards (only in War Room '/war-room')
      if (location.pathname === '/war-room') {
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

      // P — Toggle Presentation Mode
      if (key === 'p') {
        e.preventDefault()
        togglePresentation()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [location.pathname, navigate, togglePresentation])

  return { showOverlay, setShowOverlay }
}

