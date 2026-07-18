// src/lib/audio.ts — Web Audio API synthesized ambient audio
// Silence when calm, low rumble at peak, whoosh on particle arrival, chime on incident.

let ctx: AudioContext | null = null
let rumbleOsc1: OscillatorNode | null = null
let rumbleOsc2: OscillatorNode | null = null
let rumbleFilter: BiquadFilterNode | null = null
let rumbleGain: GainNode | null = null

let isMuted = false
let lastWhooshTime = 0
let hasUserInteracted = false

// Persist mute state in localStorage
if (typeof window !== 'undefined') {
  const saved = localStorage.getItem('stormlens-mute')
  isMuted = saved === 'true'

  const unlockAudio = () => {
    hasUserInteracted = true
    window.removeEventListener('click', unlockAudio)
    window.removeEventListener('keydown', unlockAudio)
  }
  window.addEventListener('click', unlockAudio)
  window.addEventListener('keydown', unlockAudio)
}

function initAudio() {
  if (ctx) return
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    ctx = new AudioContextClass()

    // ── Setup Low Rumble (Noise Floor) ──────────────────────────────────────
    // We blend two low-frequency oscillators to create a beating generator hum
    rumbleOsc1 = ctx.createOscillator()
    rumbleOsc2 = ctx.createOscillator()
    rumbleFilter = ctx.createBiquadFilter()
    rumbleGain = ctx.createGain()

    rumbleOsc1.type = 'sawtooth'
    rumbleOsc1.frequency.value = 55 // A1 note

    rumbleOsc2.type = 'sine'
    rumbleOsc2.frequency.value = 65.4 // C2 note

    rumbleFilter.type = 'lowpass'
    rumbleFilter.frequency.value = 80 // Filter out harsh frequencies

    rumbleGain.gain.value = 0

    // Connect nodes
    rumbleOsc1.connect(rumbleFilter)
    rumbleOsc2.connect(rumbleFilter)
    rumbleFilter.connect(rumbleGain)
    rumbleGain.connect(ctx.destination)

    rumbleOsc1.start()
    rumbleOsc2.start()
  } catch (err) {
    console.error('Failed to initialize Web Audio:', err)
  }
}

export const audioManager = {
  toggleMute() {
    isMuted = !isMuted
    localStorage.setItem('stormlens-mute', String(isMuted))
    
    // Instantly cut rumble if muting
    if (isMuted && rumbleGain && ctx) {
      rumbleGain.gain.setValueAtTime(0, ctx.currentTime)
    }
    
    // Dispatch event to update top bar speaker icon
    window.dispatchEvent(new CustomEvent('stormlens-audio-mute', { detail: isMuted }))
    return isMuted
  },

  getMuted() {
    return isMuted
  },

  updateRumble(alertsPerSec: number) {
    if (isMuted || !hasUserInteracted) return
    initAudio()
    if (!ctx || !rumbleGain) return

    // Wake context if suspended (browser security autoplays blocks)
    if (ctx.state === 'suspended') {
      ctx.resume()
    }

    // Volume scales up to a hard-capped max volume of 0.015 (barely audible)
    const targetGain = Math.min(alertsPerSec / 90, 1) * 0.015
    rumbleGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.5)
  },

  playWhoosh() {
    if (isMuted || !hasUserInteracted) return
    initAudio()
    if (!ctx || ctx.state === 'suspended') return

    const now = Date.now()
    if (now - lastWhooshTime < 400) return // Throttled: max 1 per 400ms
    lastWhooshTime = now

    // Whoosh: Synthesized via white noise filtered by sweeping bandpass
    const bufferSize = ctx.sampleRate * 0.35 // 350ms buffer
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    
    // Fill buffer with white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1
    }

    const noiseNode = ctx.createBufferSource()
    noiseNode.buffer = buffer

    const filterNode = ctx.createBiquadFilter()
    filterNode.type = 'bandpass'
    filterNode.frequency.setValueAtTime(220, ctx.currentTime)
    filterNode.Q.setValueAtTime(3.0, ctx.currentTime)
    // Sweep filter cutoff frequency upward
    filterNode.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.3)

    const gainNode = ctx.createGain()
    gainNode.gain.setValueAtTime(0.008, ctx.currentTime) // soft whoosh
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)

    noiseNode.connect(filterNode)
    filterNode.connect(gainNode)
    gainNode.connect(ctx.destination)

    noiseNode.start()
    noiseNode.stop(ctx.currentTime + 0.35)
  },

  playIncidentChime() {
    if (isMuted || !hasUserInteracted) return
    initAudio()
    if (!ctx || ctx.state === 'suspended') return

    // Chime: low combination of sine waves decaying slowly
    const now = ctx.currentTime

    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gainNode = ctx.createGain()

    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(146.83, now) // D3 key

    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(220.00, now) // A3 overtone

    gainNode.gain.setValueAtTime(0.04, now) // clean low chime
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.6)

    osc1.connect(gainNode)
    osc2.connect(gainNode)
    gainNode.connect(ctx.destination)

    osc1.start(now)
    osc2.start(now)

    osc1.stop(now + 1.8)
    osc2.stop(now + 1.8)
  }
}

// Global listener to trigger chime from unified incident born event
if (typeof window !== 'undefined') {
  window.addEventListener('stormlens-incident-born', () => {
    audioManager.playIncidentChime()
  })
}
export default audioManager
