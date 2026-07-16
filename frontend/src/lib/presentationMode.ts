/**
 * presentationMode.ts — Presentation mode state management.
 *
 * Persists to localStorage. Applies/removes `.presentation-mode` class on
 * <html> so the CSS cascade re-skins the entire UI without touching components.
 */
import { useState, useEffect } from 'react'

const STORAGE_KEY = 'stormlens-presentation-mode'
const HTML_CLASS  = 'presentation-mode'

function getStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function applyToHtml(on: boolean) {
  if (on) {
    document.documentElement.classList.add(HTML_CLASS)
  } else {
    document.documentElement.classList.remove(HTML_CLASS)
  }
}

// Apply on module load (before first render) to prevent flash
applyToHtml(getStored())

export function usePresentationMode() {
  const [presentationMode, setPresentationMode] = useState(getStored)

  useEffect(() => {
    applyToHtml(presentationMode)
    try {
      localStorage.setItem(STORAGE_KEY, String(presentationMode))
    } catch {}
  }, [presentationMode])

  const toggle = () => setPresentationMode(prev => !prev)

  return { presentationMode, toggle }
}

/** Read-only helper for non-hook contexts */
export function getPresentationMode(): boolean {
  return getStored()
}
