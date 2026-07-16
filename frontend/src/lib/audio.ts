/**
 * audio.ts — ambience rumble (tracks alert rate) + arrival whoosh. Synthesized
 * via Web Audio API, no asset files. Mute state persists to localStorage.
 */

const STORAGE_KEY = 'stormlens-audio-muted'

function readStoredMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

class AudioManager {
  private muted = readStoredMuted()
  private ctx: AudioContext | null = null
  private rumbleOsc: OscillatorNode | null = null
  private rumbleGain: GainNode | null = null

  getMuted(): boolean {
    return this.muted
  }

  toggleMute(): void {
    this.muted = !this.muted
    try {
      localStorage.setItem(STORAGE_KEY, String(this.muted))
    } catch {}
    if (this.muted) this.stopRumble()
    window.dispatchEvent(new CustomEvent('stormlens-audio-mute', { detail: this.muted }))
  }

  updateRumble(alertsPerSec: number): void {
    if (this.muted) return
    const ctx = this.ensureContext()
    if (!ctx) return

    if (alertsPerSec <= 0) {
      this.stopRumble()
      return
    }

    if (!this.rumbleOsc || !this.rumbleGain) {
      this.rumbleOsc = ctx.createOscillator()
      this.rumbleGain = ctx.createGain()
      this.rumbleOsc.type = 'sine'
      this.rumbleOsc.frequency.value = 40
      this.rumbleGain.gain.value = 0
      this.rumbleOsc.connect(this.rumbleGain)
      this.rumbleGain.connect(ctx.destination)
      this.rumbleOsc.start()
    }

    const targetGain = Math.min(alertsPerSec / 100, 0.06)
    const targetFreq = 40 + Math.min(alertsPerSec, 60)
    this.rumbleGain.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 0.3)
    this.rumbleOsc.frequency.linearRampToValueAtTime(targetFreq, ctx.currentTime + 0.3)
  }

  playWhoosh(): void {
    if (this.muted) return
    const ctx = this.ensureContext()
    if (!ctx) return

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(600, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.05, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.15)
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      this.ctx = new Ctor()
    }
    return this.ctx
  }

  private stopRumble(): void {
    if (this.rumbleGain && this.ctx) {
      this.rumbleGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3)
    }
  }
}

export const audioManager = new AudioManager()
