/**
 * fpsGuard.ts — FPS measurement singleton with auto-throttle.
 *
 * Measures rolling FPS over a 60-frame window.
 * When FPS drops below 45 for more than 2 consecutive seconds:
 *   - Sets THROTTLED = true
 *   - Calls all registered low-FPS callbacks (convergence overlay, timeline, etc.)
 *   - Logs once to console
 * When FPS recovers above 55 while throttled:
 *   - Sets THROTTLED = false
 *   - Calls recovery callbacks
 *
 * Usage:
 *   fpsGuard.measure()     — call once per RAF frame
 *   fpsGuard.isThrottled() — read in hot paths
 */

type Callback = () => void

const LOW_FPS_THRESHOLD  = 45
const RECOVER_THRESHOLD  = 55
const LOW_FPS_DURATION   = 2000  // ms before throttling kicks in

class FpsGuard {
  private frames: number[] = []
  private throttled = false
  private lowFpsSince: number | null = null
  private lowCbs: Callback[] = []
  private recoverCbs: Callback[] = []
  private lastLoggedThrottle = false

  measure() {
    const now = performance.now()
    this.frames.push(now)

    // Keep only last 60 frames
    while (this.frames.length > 60) {
      this.frames.shift()
    }

    if (this.frames.length < 10) return

    const oldest = this.frames[0]
    const elapsed = now - oldest
    const fps = (this.frames.length / elapsed) * 1000

    if (!this.throttled) {
      if (fps < LOW_FPS_THRESHOLD) {
        if (this.lowFpsSince === null) {
          this.lowFpsSince = now
        } else if (now - this.lowFpsSince > LOW_FPS_DURATION) {
          this.throttled = true
          this.lowFpsSince = null
          if (!this.lastLoggedThrottle) {
            console.log(`[FPS Guard] Throttled — measured ${Math.round(fps)} FPS. Capping particles & timeline redraw rate.`)
            this.lastLoggedThrottle = true
          }
          this.lowCbs.forEach(cb => cb())
        }
      } else {
        this.lowFpsSince = null
      }
    } else {
      if (fps > RECOVER_THRESHOLD) {
        this.throttled = false
        this.lastLoggedThrottle = false
        console.log(`[FPS Guard] Recovered — measured ${Math.round(fps)} FPS. Restoring full quality.`)
        this.recoverCbs.forEach(cb => cb())
      }
    }
  }

  isThrottled(): boolean {
    return this.throttled
  }

  onLowFps(cb: Callback): () => void {
    this.lowCbs.push(cb)
    return () => { this.lowCbs = this.lowCbs.filter(c => c !== cb) }
  }

  onRecovered(cb: Callback): () => void {
    this.recoverCbs.push(cb)
    return () => { this.recoverCbs = this.recoverCbs.filter(c => c !== cb) }
  }

  /** Max particles when throttled */
  getParticleCap(): number {
    return this.throttled ? 4 : 24
  }

  /** Timeline redraw interval in ms (0 = every frame, 500 = 2fps) */
  getTimelineInterval(): number {
    return this.throttled ? 500 : 0
  }
}

export const fpsGuard = new FpsGuard()
