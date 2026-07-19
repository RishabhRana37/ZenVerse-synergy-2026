/**
 * LandingPageNew.tsx — Cinematic landing page at /landing
 * No zustand / WS imports. Pure local state + framer-motion.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, useScroll, useSpring, useTransform } from 'framer-motion'
import Lenis from 'lenis'
import { HeroConvergenceCanvas } from './HeroConvergenceCanvas'
import { ConfidenceBar } from '@/components/ui/ConfidenceBar'
import { Kbd } from '@/components/ui/Kbd'
import { SPRING, EASE, DUR_ENTER, entranceVariants, staggerContainerVariants } from '@/lib/motion'
import { clsx } from 'clsx'

// ── Reduced motion helper ─────────────────────────────────────────────────────
const prefersReduced = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── Inline lens mark SVG (reuses favicon geometry) ────────────────────────────
function LensMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="7" stroke="#E6EDF3" strokeWidth="1.2" />
      <line x1="10" y1="0" x2="10" y2="2.2" stroke="#E6EDF3" strokeWidth="1.3" />
      <line x1="10" y1="17.8" x2="10" y2="20" stroke="#E6EDF3" strokeWidth="1.3" />
      <line x1="0" y1="10" x2="2.2" y2="10" stroke="#E6EDF3" strokeWidth="1.3" />
      <line x1="17.8" y1="10" x2="20" y2="10" stroke="#E6EDF3" strokeWidth="1.3" />
      <circle cx="16.5" cy="4.5" r="1.9" fill="#F5A524" />
    </svg>
  )
}

// ── useCountUp: IntersectionObserver + RAF count-up ────────────────────────────
function useCountUp(target: number, duration = 1400) {
  const [value, setValue] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || started.current) return
      started.current = true
      observer.disconnect()
      if (prefersReduced) { setValue(target); return }
      let start: number | null = null
      const animate = (ts: number) => {
        if (!start) start = ts
        const elapsed = ts - start
        const p = Math.min(elapsed / duration, 1)
        const eased = p < 0.5 ? 2*p*p : 1-(Math.pow(-2*p+2,2)/2)
        setValue(Math.round(eased * target))
        if (p < 1) requestAnimationFrame(animate)
        else setValue(target)
      }
      requestAnimationFrame(animate)
    }, { threshold: 0.2 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [target, duration])
  return { ref, value }
}

// ── Typewriter text ────────────────────────────────────────────────────────────
function TypewriterText({ text, delay = 0 }: { text: string; delay?: number }) {
  const [typed, setTyped] = useState('')
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || started.current) return
      started.current = true
      observer.disconnect()
      if (prefersReduced) { setTyped(text); return }
      let i = 0
      const t = setTimeout(() => {
        const iv = setInterval(() => {
          i++; setTyped(text.slice(0, i))
          if (i >= text.length) clearInterval(iv)
        }, 22)
        return () => clearInterval(iv)
      }, delay)
      return () => clearTimeout(t)
    }, { threshold: 0.3 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [text, delay])
  return (
    <span ref={ref} className="font-mono text-[11px] text-text-secondary leading-relaxed">
      {typed}<span className="animate-pulse text-accent">▊</span>
    </span>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// 0. NAVBAR
// ════════════════════════════════════════════════════════════════════════════════
function LandingNav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.nav
      animate={{ height: scrolled ? 52 : 64 }}
      transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 20 }}
      className={clsx(
        'fixed top-0 left-0 right-0 z-[var(--z-popover)] flex items-center px-6 transition-colors duration-300',
        scrolled
          ? 'bg-bg-base/80 backdrop-blur-xl'
          : 'bg-transparent'
      )}
      aria-label="Site navigation"
    >
      {/* Hairline bottom border with left->right accent gradient (Upgrade 9) */}
      <div
        className={clsx(
          'absolute bottom-0 left-0 right-0 h-[1px] transition-opacity duration-300 pointer-events-none',
          scrolled ? 'opacity-20' : 'opacity-0'
        )}
        style={{
          background: 'linear-gradient(90deg, var(--brand) 0%, transparent 100%)'
        }}
      />

      {/* Wordmark */}
      <Link to="/" className="flex items-center gap-2.5 mr-auto select-none group">
        <LensMark size={20} />
        <span className="font-sans font-bold text-[14px] tracking-tight text-text-primary group-hover:text-brand transition-colors duration-150">
          StormLens
        </span>
      </Link>

      {/* Links */}
      <div className="flex items-center gap-6">
        <a
          href="#how-it-works"
          className="text-[12px] font-sans text-text-secondary hover:text-text-primary transition-colors duration-150 cursor-pointer"
        >
          How it works
        </a>
        <Link
          to="/eval"
          className="text-[12px] font-sans text-text-secondary hover:text-text-primary transition-colors duration-150"
        >
          Eval
        </Link>
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-text-muted select-none">
          <span>War Room</span>
          <Kbd>W</Kbd>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('stormlens-open-palette'))}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-border bg-bg-surface hover:bg-bg-surface/80 transition-colors font-sans text-[11px] text-text-secondary cursor-pointer select-none"
          title="Search commands (⌘K)"
        >
          <span>Search</span>
          <kbd className="text-[10px] font-mono font-bold bg-bg-base border border-border text-text-muted px-1.5 py-0.2 rounded">⌘K</kbd>
        </button>
        <Link
          to="/war-room"
          className="px-3.5 py-1.5 rounded-md text-[12px] font-bold font-sans hover:opacity-90 active:scale-95 transition-all duration-150 whitespace-nowrap"
          style={{ backgroundColor: 'var(--brand)', color: 'var(--on-brand)' }}
        >
          Enter War Room
        </Link>
      </div>
    </motion.nav>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// 1. HERO
// ════════════════════════════════════════════════════════════════════════════════
// ── Magnetic Button (Upgrade 5) ────────────────────────────────────────────────
function MagneticButton({ children, to, className, style }: { children: React.ReactNode; to: string; className?: string; style?: React.CSSProperties }) {
  const buttonRef = useRef<HTMLAnchorElement>(null)
  const [{ x, y }, setCoords] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const button = buttonRef.current
    if (!button) return

    const isDesktop = window.matchMedia('(pointer: fine)').matches
    if (!isDesktop) return

    const onMouseMove = (e: MouseEvent) => {
      const rect = button.getBoundingClientRect()
      const btnX = rect.left + rect.width / 2
      const btnY = rect.top + rect.height / 2
      const dx = e.clientX - btnX
      const dy = e.clientY - btnY
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < 60) {
        const pullX = (dx / 60) * 6
        const pullY = (dy / 60) * 6
        setCoords({ x: pullX, y: pullY })
      } else {
        setCoords({ x: 0, y: 0 })
      }
    }

    const onMouseLeave = () => {
      setCoords({ x: 0, y: 0 })
    }

    window.addEventListener('mousemove', onMouseMove)
    button.addEventListener('mouseleave', onMouseLeave)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      button.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])

  return (
    <motion.div
      animate={{ x, y }}
      transition={{ type: 'spring', stiffness: 150, damping: 15 }}
      className="inline-block"
    >
      <Link ref={buttonRef} to={to} className={className} style={style}>
        {children}
      </Link>
    </motion.div>
  )
}

// ── Text Reveal Headline (Upgrade 4) ───────────────────────────────────────────
function TextRevealHeadline() {
  if (prefersReduced) {
    return (
      <h1 className="text-[52px] font-bold font-sans leading-[1.05] tracking-tight text-text-primary">
        From 2,000 alerts to{' '}
        <span className="inline-block text-brand">
          3 answers.
        </span>
      </h1>
    )
  }

  const words1 = ["From", "2,000", "alerts"]
  const words2 = ["to", "3", "answers."]

  return (
    <h1 className="text-[52px] font-bold font-sans leading-[1.05] tracking-tight text-text-primary flex flex-col gap-1 select-none">
      <div>
        {words1.map((w, idx) => (
          <span key={idx} className="inline-block overflow-hidden mr-3">
            <span
              className="inline-block translate-y-[16px] opacity-0"
              style={{
                animation: `text-rise 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards`,
                animationDelay: `${idx * 40}ms`
              }}
            >
              {w}
            </span>
          </span>
        ))}
      </div>
      <div>
        {words2.map((w, idx) => {
          const delay = (words1.length + idx) * 40
          const isAccent = w === '3' || w === 'answers.'
          return (
            <span key={idx} className="inline-block overflow-hidden mr-3">
              <span
                className={clsx(
                  "inline-block translate-y-[16px] opacity-0",
                  isAccent && "text-brand"
                )}
                style={{
                  animation: `text-rise 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards`,
                  animationDelay: `${delay}ms`
                }}
              >
                {w}
              </span>
            </span>
          )
        })}
      </div>
    </h1>
  )
}

function HeroSection({ onReplay, replaySignal }: { onReplay: () => void; replaySignal: number | undefined }) {
  const heroRef = useRef<HTMLDivElement>(null)
  const spotlightRef = useRef<HTMLDivElement>(null)

  // Spotlight pointer tracking (Upgrade 3)
  useEffect(() => {
    const hero = heroRef.current
    const spotlight = spotlightRef.current
    if (!hero || !spotlight) return

    const isDesktop = window.matchMedia('(pointer: fine)').matches
    if (!isDesktop) return

    let mouseX = -9999
    let mouseY = -9999
    let currentX = -9999
    let currentY = -9999

    const onMouseMove = (e: MouseEvent) => {
      const rect = hero.getBoundingClientRect()
      mouseX = e.clientX - rect.left
      mouseY = e.clientY - rect.top
    }

    const onMouseLeave = () => {
      mouseX = -9999
      mouseY = -9999
    }

    hero.addEventListener('mousemove', onMouseMove)
    hero.addEventListener('mouseleave', onMouseLeave)

    let rfId = 0
    const loop = () => {
      if (mouseX === -9999) {
        spotlight.style.opacity = '0'
      } else {
        spotlight.style.opacity = '1'
        if (currentX === -9999) {
          currentX = mouseX
          currentY = mouseY
        } else {
          currentX += (mouseX - currentX) * 0.1
          currentY += (mouseY - currentY) * 0.1
        }
        spotlight.style.transform = `translate3d(${currentX - 300}px, ${currentY - 300}px, 0)`
      }
      rfId = requestAnimationFrame(loop)
    }
    rfId = requestAnimationFrame(loop)

    return () => {
      hero.removeEventListener('mousemove', onMouseMove)
      hero.removeEventListener('mouseleave', onMouseLeave)
      cancelAnimationFrame(rfId)
    }
  }, [])

  // Parallax Scroll Layers (Upgrade 8)
  const { scrollY } = useScroll()
  const yRadial = useTransform(scrollY, [0, 800], [0, 160])
  const yDust = useTransform(scrollY, [0, 800], [0, 320])
  const yRadialVal = prefersReduced ? 0 : yRadial
  const yDustVal = prefersReduced ? 0 : yDust

  return (
    <section ref={heroRef} className="relative min-h-screen pt-14 flex overflow-hidden bg-bg-base">
      {/* 1px conic gradient sweep and text rise styling */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes text-rise {
          from { transform: translateY(16px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes gradient-sweep {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes border-sweep {
          100% { transform: rotate(360deg); }
        }
      ` }} />

      {/* Spotlight cursor glow (Upgrade 3) */}
      <div
        ref={spotlightRef}
        className="absolute w-[600px] h-[600px] pointer-events-none rounded-full bg-accent/4 filter blur-[80px] z-0 transition-opacity duration-300 opacity-0"
        style={{ mixBlendMode: 'screen' }}
      />

      {/* Grain Overlay (Upgrade 8) */}
      <div className="absolute inset-0 pointer-events-none z-[5] opacity-[0.03] overflow-hidden">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <filter id="hero-noise-filter">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="matrix" values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0  0 0 0 0.08 0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#hero-noise-filter)" />
        </svg>
      </div>

      {/* Parallax Radial Grid (Upgrade 8) */}
      <motion.div
        style={{ y: yRadialVal }}
        className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center opacity-[0.05]"
      >
        <svg width="800" height="800" viewBox="0 0 800 800" fill="none">
          <circle cx="400" cy="400" r="300" stroke="#1E1E1B" strokeWidth="1" strokeDasharray="4 8" />
          <circle cx="400" cy="400" r="200" stroke="#1E1E1B" strokeWidth="1" strokeDasharray="4 8" />
          <circle cx="400" cy="400" r="100" stroke="#1E1E1B" strokeWidth="1" strokeDasharray="4 8" />
          <line x1="400" y1="0" x2="400" y2="800" stroke="#1E1E1B" strokeWidth="0.5" strokeDasharray="2 4" />
          <line x1="0" y1="400" x2="800" y2="400" stroke="#1E1E1B" strokeWidth="0.5" strokeDasharray="2 4" />
        </svg>
      </motion.div>

      {/* Parallax Blurred Accent Dust Dots (Upgrade 8) */}
      <motion.div
        style={{ y: yDustVal }}
        className="absolute inset-0 pointer-events-none z-0"
      >
        <div className="absolute top-[20%] left-[10%] w-2 h-2 rounded-full bg-brand/20 filter blur-[4px]" />
        <div className="absolute top-[45%] left-[80%] w-3.5 h-3.5 rounded-full bg-brand/15 filter blur-[6px]" />
        <div className="absolute top-[75%] left-[30%] w-2 h-2 rounded-full bg-brand/25 filter blur-[4px]" />
        <div className="absolute top-[15%] left-[70%] w-3 h-3 rounded-full bg-brand/15 filter blur-[5px]" />
        <div className="absolute top-[60%] left-[15%] w-2.5 h-2.5 rounded-full bg-brand/20 filter blur-[4px]" />
        <div className="absolute top-[85%] left-[85%] w-3 w-3 rounded-full bg-brand/20 filter blur-[5px]" />
        <div className="absolute top-[30%] left-[55%] w-1.5 h-1.5 rounded-full bg-brand/30 filter blur-[3px]" />
        <div className="absolute top-[50%] left-[40%] w-2 w-2 rounded-full bg-brand/15 filter blur-[4px]" />
      </motion.div>

      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />
      {/* Subtle radial fade on left */}
      <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-[#0C0C0B] to-transparent pointer-events-none z-10" />

      {/* Left — text content */}
      <div className="relative z-10 flex flex-col justify-center items-start w-[45%] pl-12 pr-4 gap-6">
        {/* Eyebrow */}
        <motion.div
          initial={prefersReduced ? {} : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR_ENTER, ease: EASE }}
          className="flex items-center gap-2.5 text-[10px] font-mono text-text-low uppercase tracking-[0.2em] select-none"
        >
          <span className="w-4 h-px bg-brand" />
          SYNERGY 2026 · HPE PS #10
        </motion.div>

        {/* Headline (Upgrade 4) */}
        <TextRevealHeadline />

        {/* Subhead */}
        <motion.p
          initial={prefersReduced ? {} : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR_ENTER, ease: EASE, delay: 0.16 }}
          className="text-[14px] font-sans text-text-secondary leading-relaxed max-w-[380px]"
        >
          Real-time AIOps — deduplicate noise, correlate signals, surface root causes
          in under two seconds.
        </motion.p>

        {/* CTAs (Upgrade 5) */}
        <motion.div
          initial={prefersReduced ? {} : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR_ENTER, ease: EASE, delay: 0.22 }}
          className="flex items-center gap-4 flex-wrap"
        >
          <MagneticButton
            to="/war-room"
            className="px-5 py-2.5 rounded-md text-[13px] font-bold font-sans hover:opacity-90 transition-all duration-150 whitespace-nowrap block"
            style={{ backgroundColor: 'var(--brand)', color: 'var(--on-brand)' }}
          >
            Enter the War Room
          </MagneticButton>

          <button
            onClick={onReplay}
            className="relative group overflow-hidden px-5 py-2.5 rounded-md bg-transparent text-[13px] font-sans text-text-secondary hover:text-text-primary transition-all duration-150 whitespace-nowrap"
          >
            {/* Conic Gradient Sweep border on hover */}
            <div className="absolute inset-0 p-[1px] rounded-md bg-white/10 group-hover:bg-transparent transition-colors duration-200">
              <div
                className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 40%, #F5A524 80%, transparent 100%)',
                  animation: 'border-sweep 4s linear infinite',
                  margin: '-1px'
                }}
              />
              <div className="absolute inset-[1px] rounded-[5px] bg-bg-base group-hover:bg-bg-raised/90 transition-colors" />
            </div>
            <span className="relative z-10">Watch the storm</span>
          </button>
        </motion.div>
      </div>

      {/* Right — canvas */}
      <div className="flex-1 relative min-h-[calc(100vh-56px)]">
        <HeroConvergenceCanvas key={replaySignal ?? 0} />
      </div>
    </section>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// 2. STATS ROW
// ════════════════════════════════════════════════════════════════════════════════
function StatsRow() {
  const noise = useCountUp(9985, 1600)
  const latency = useCountUp(2, 900)
  const replay = useCountUp(1000, 1800)
  const reduction = useCountUp(2000, 1400)

  const stats = [
    { ref: noise.ref,     value: (noise.value / 100).toFixed(2) + '%',  label: 'Noise suppressed',    suffix: '' },
    { ref: latency.ref,   value: '<' + latency.value + 's',              label: 'Correlation latency', suffix: '' },
    { ref: replay.ref,    value: replay.value + '×',                     label: 'Replay speed',        suffix: '' },
    { ref: reduction.ref, value: reduction.value.toLocaleString(),       label: '→ 3 incidents',       suffix: '' },
  ]

  return (
    <section className="relative border-y border-border bg-bg-surface">
      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
        {stats.map((s, i) => (
          <div key={i} ref={s.ref} className="flex flex-col items-center justify-center py-10 px-4 gap-2 text-center">
            <motion.span
              initial={prefersReduced ? {} : { filter: 'blur(6px)', opacity: 0 }}
              whileInView={{ filter: 'blur(0px)', opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: EASE, delay: i * 0.08 }}
              className="text-[36px] font-mono font-bold text-text-primary tabular-nums leading-none tracking-tighter"
            >
              {s.value}
            </motion.span>
            <span className="text-[11px] font-sans text-text-muted uppercase tracking-wider">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// 3. HOW IT WORKS
// ════════════════════════════════════════════════════════════════════════════════
function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null)

  // CORRELATE SVG beam diagram edges animate on in-view
  const beamRef = useRef<SVGPathElement>(null)
  const isBeamVisible = useInView(sectionRef, { once: true, margin: '-100px' })
  useEffect(() => {
    if (!beamRef.current || !isBeamVisible) return
    const totalLen = beamRef.current.getTotalLength()
    beamRef.current.style.strokeDasharray = String(totalLen)
    beamRef.current.style.strokeDashoffset = String(totalLen)
    beamRef.current.style.transition = `stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1) 0.2s`
    requestAnimationFrame(() => { beamRef.current!.style.strokeDashoffset = '0' })
  }, [isBeamVisible])

  const rows = [
    {
      num: '01', title: 'INGEST', color: '#4D9FFF',
      visual: (
        <div className="flex flex-col gap-1.5 w-full max-w-xs">
          {[
            { sev: 'critical', svc: 'api-gateway',       msg: 'Connection timeout on /health', ts: '14:31:07.203' },
            { sev: 'warning',  svc: 'redis-cache',        msg: 'Memory usage at 94.2%',         ts: '14:31:07.419' },
            { sev: 'info',     svc: 'auth-service',       msg: 'Rate limit threshold reached',   ts: '14:31:07.891' },
            { sev: 'critical', svc: 'db-primary',         msg: 'Replication lag > 5s',           ts: '14:31:08.012' },
            { sev: 'warning',  svc: 'load-balancer',      msg: 'Circuit breaker OPEN',           ts: '14:31:08.234' },
          ].map((row, i) => (
            <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-border/40 bg-bg-surface/60 font-mono text-[10px]">
              <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0',
                row.sev === 'critical' ? 'bg-[#FF4D4F]' : row.sev === 'warning' ? 'bg-[#F5A623]' : 'bg-[#4D9FFF]'
              )} />
              <span className="text-text-muted w-24 truncate">{row.svc}</span>
              <span className="text-text-secondary flex-1 truncate">{row.msg}</span>
              <span className="text-text-muted/60 flex-shrink-0">{row.ts}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-2.5 py-1 border-t border-border/30 mt-1">
            <span className="font-mono text-[10px] text-text-muted">+1,995 more</span>
            <span className="font-mono text-[10px] text-accent">streaming live</span>
          </div>
        </div>
      ),
    },
    {
      num: '02', title: 'CORRELATE', color: '#F5A623',
      visual: (
        <div className="relative w-[280px] h-[160px]">
          <svg viewBox="0 0 280 160" className="w-full h-full" aria-hidden>
            {/* Alert nodes */}
            {[[20,30],[20,80],[20,130]].map(([x,y],i) => (
              <g key={i}>
                <circle cx={x} cy={y} r="8" fill="none" stroke={['#FF4D4F','#F5A623','#4D9FFF'][i]} strokeWidth="1.5" />
                <circle cx={x} cy={y} r="3" fill={['#FF4D4F','#F5A623','#4D9FFF'][i]} />
                <text x={x+14} y={y+4} fill="#8B98A9" fontSize="10" fontFamily="JetBrains Mono,monospace">
                  {['api-gw','redis','db'][i]}
                </text>
              </g>
            ))}
            {/* Incident node */}
            <circle cx={230} cy={80} r="14" fill="rgba(245,165,36,0.08)" stroke="#F5A524" strokeWidth="1.5" />
            <circle cx={230} cy={80} r="5" fill="#F5A524" />
            <text x={248} y={76} fill="#F5A524" fontSize="10" fontFamily="JetBrains Mono,monospace">INC-01</text>
            <text x={248} y={86} fill="#8B98A9" fontSize="10" fontFamily="JetBrains Mono,monospace">97% conf</text>
            {/* Bezier edges */}
            <path ref={beamRef}
              d="M28,30 C100,30 130,80 216,80 M28,80 C100,80 130,80 216,80 M28,130 C100,130 130,80 216,80"
              fill="none" stroke="#F5A524" strokeWidth="1" strokeOpacity="0.5"
            />
          </svg>
        </div>
      ),
    },
    {
      num: '03', title: 'EXPLAIN', color: '#F5A524',
      visual: (
        <div className="w-full max-w-xs border border-border/60 bg-bg-surface/80 rounded-lg p-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#FF4D4F]" />
            <span className="font-mono text-[10px] text-text-primary font-bold">INC-001 · DB Cascade</span>
            <span className="ml-auto font-mono text-[10px] text-brand font-bold">ACTIVE</span>
          </div>
          <ConfidenceBar confidence={0.97} height="xs" showLabel />
          <TypewriterText
            delay={600}
            text="Root cause: db-primary replication lag triggered circuit breaker, cascading to api-gateway → redis eviction storm. 1,247 alerts correlated. Recommend: promote replica-2."
          />
        </div>
      ),
    },
  ]

  return (
    <section id="how-it-works" ref={sectionRef} className="py-24 bg-bg-base">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          variants={entranceVariants} initial="hidden" whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          className="mb-14 flex flex-col gap-2"
        >
          <span className="font-mono text-[10px] text-text-muted uppercase tracking-[0.22em]">Process</span>
          <h2 className="text-[32px] font-bold font-sans text-text-primary tracking-tight">How it works</h2>
        </motion.div>

        <div className="flex flex-col gap-14">
          {rows.map((row, i) => (
            <motion.div
              key={row.num}
              initial={prefersReduced ? {} : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: DUR_ENTER, ease: EASE, delay: i * 0.08 }}
              className={clsx(
                'flex items-center gap-12',
                i % 2 === 1 && 'flex-row-reverse'
              )}
            >
              {/* Number + text */}
              <div className="flex flex-col gap-3 flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <motion.span
                    initial={prefersReduced ? {} : { x: -30, opacity: 0 }}
                    whileInView={{ x: 0, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ type: 'spring', stiffness: 80, damping: 15, delay: 0.1 }}
                    className="font-mono text-[28px] font-bold"
                    style={{ color: row.color }}
                  >
                    {row.num}
                  </motion.span>
                  <div className="h-px flex-1 opacity-10" style={{ background: row.color }} />
                </div>
                <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: row.color }}>
                  {row.title}
                </h3>
                <p className="text-[13px] font-sans text-text-secondary leading-relaxed max-w-[320px]">
                  {i === 0 && 'Every alert from every source streams in as structured events. StormLens ingests thousands per second without dropping a single signal.'}
                  {i === 1 && 'A causal-graph engine finds which alerts share a common origin. Unrelated signals are grouped, duplicates deduplicated, edges drawn in real time.'}
                  {i === 2 && 'Each incident surfaces a root-cause summary, blast-radius map, and confidence score. Engineers get one card — not a wall of noise.'}
                </p>
              </div>
              {/* Visual */}
              <div className="flex-shrink-0 flex items-center justify-center">
                {row.visual}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// 4. FEATURE BENTO
// ════════════════════════════════════════════════════════════════════════════════
function BentoCell({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const cellRef = useRef<HTMLDivElement>(null)
  const [{ rx, ry, shadow }, setTilt] = useState({ rx: 0, ry: 0, shadow: '0px 1px 2px rgba(0,0,0,0.1)' })

  useEffect(() => {
    const cell = cellRef.current
    if (!cell) return

    const isDesktop = window.matchMedia('(pointer: fine)').matches
    if (!isDesktop) return

    const onMouseMove = (e: MouseEvent) => {
      const rect = cell.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = e.clientX - cx
      const dy = e.clientY - cy

      const nx = dx / (rect.width / 2)
      const ny = dy / (rect.height / 2)

      // Rotate max 2 degrees (Upgrade 6)
      const ryVal = nx * 2
      const rxVal = -ny * 2
      setTilt({
        rx: rxVal,
        ry: ryVal,
        shadow: `0px ${10 + ny * 6}px 24px rgba(45, 212, 167, 0.04), 0px 2px 8px rgba(0, 0, 0, 0.3)`
      })
    }

    const onMouseLeave = () => {
      setTilt({ rx: 0, ry: 0, shadow: '0px 1px 2px rgba(0,0,0,0.1)' })
    }

    cell.addEventListener('mousemove', onMouseMove)
    cell.addEventListener('mouseleave', onMouseLeave)

    return () => {
      cell.removeEventListener('mousemove', onMouseMove)
      cell.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])

  return (
    <motion.div
      ref={cellRef}
      initial={prefersReduced ? {} : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: DUR_ENTER, ease: EASE, delay }}
      style={{
        transformStyle: 'preserve-3d',
        perspective: 800,
        rotateX: rx,
        rotateY: ry,
        boxShadow: shadow,
      }}
      className={clsx(
        'relative rounded-lg border border-border bg-bg-surface p-5 overflow-hidden',
        'hover:border-border-hover transition-colors duration-150 transition-shadow duration-300',
        className
      )}
    >
      {children}
    </motion.div>
  )
}

function FeatureBento() {
  const [dedupCount, setDedupCount] = useState(47)
  const blastRef = useRef<HTMLDivElement>(null)
  const isVisible = useInView(blastRef, { once: true })

  // Dedup counter animation
  useEffect(() => {
    if (!isVisible) return
    let count = 1
    const iv = setInterval(() => {
      count += Math.ceil(Math.random() * 4)
      if (count >= 47) { setDedupCount(47); clearInterval(iv); return }
      setDedupCount(count)
    }, 80)
    return () => clearInterval(iv)
  }, [isVisible])

  return (
    <section className="py-24 bg-bg-elevated/30">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          variants={entranceVariants} initial="hidden" whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          className="mb-12 flex flex-col gap-2"
        >
          <span className="font-mono text-[10px] text-text-muted uppercase tracking-[0.22em]">Capabilities</span>
          <h2 className="text-[32px] font-bold font-sans text-text-primary tracking-tight">Built for the war room</h2>
        </motion.div>

        {/* Asymmetric bento: 3 cols, 3 rows */}
        <div className="grid grid-cols-3 grid-rows-3 gap-3 auto-rows-[168px]">

          {/* Cell 1: Root-cause graph — col-span-1 row-span-2 */}
          <BentoCell delay={0} className="row-span-2 flex flex-col gap-3">
            <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">Root-cause graph</span>
            <div className="flex-1 relative">
              <svg viewBox="0 0 130 180" className="w-full h-full" aria-hidden>
                {/* Root node — pulsing */}
                <circle cx="65" cy="90" r="16" fill="rgba(255,77,79,0.08)" stroke="#FF4D4F" strokeWidth="1.5">
                  <animate attributeName="r" values="16;20;16" dur="2.4s" repeatCount="indefinite" />
                  <animate attributeName="stroke-opacity" values="1;0.4;1" dur="2.4s" repeatCount="indefinite" />
                </circle>
                <circle cx="65" cy="90" r="6" fill="#FF4D4F" />
                <text x="65" y="115" textAnchor="middle" fill="#FF4D4F" fontSize="10" fontFamily="JetBrains Mono,monospace">db-primary</text>
                {/* Leaf nodes */}
                {[[20,30],[110,30],[20,150],[110,150]].map(([x,y],i)=>(
                  <g key={i}>
                    <line x1={x} y1={y} x2="65" y2="90" stroke="#F5A524" strokeWidth="0.8" strokeOpacity="0.35" />
                    <circle cx={x} cy={y} r="7" fill="rgba(245,165,36,0.08)" stroke="#F5A524" strokeWidth="1" />
                    <circle cx={x} cy={y} r="2.5" fill="#F5A524" />
                  </g>
                ))}
                <text x="20" y="20" textAnchor="middle" fill="#8B98A9" fontSize="10" fontFamily="JetBrains Mono,monospace">api-gw</text>
                <text x="110" y="20" textAnchor="middle" fill="#8B98A9" fontSize="10" fontFamily="JetBrains Mono,monospace">redis</text>
                <text x="20" y="166" textAnchor="middle" fill="#8B98A9" fontSize="10" fontFamily="JetBrains Mono,monospace">auth</text>
                <text x="110" y="166" textAnchor="middle" fill="#8B98A9" fontSize="10" fontFamily="JetBrains Mono,monospace">lb-01</text>
              </svg>
            </div>
            <p className="text-[11px] text-text-muted leading-snug">Causal edge inference from raw alert streams.</p>
          </BentoCell>

          {/* Cell 2: Dedup ×N — col-span-2 */}
          <BentoCell delay={0.04} className="col-span-2 flex items-center gap-6">
            <div className="flex-shrink-0">
              <div ref={blastRef} className="flex items-baseline gap-2">
                <span className="font-mono text-[52px] font-bold text-text-primary tabular-nums leading-none">×{dedupCount}</span>
              </div>
              <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">dedup ratio</span>
            </div>
            <p className="text-[12px] text-text-secondary leading-relaxed">
              Identical alerts from the same source are merged into a single deduplicated event with a running count badge.
            </p>
          </BentoCell>

          {/* Cell 3: Blast radius */}
          <BentoCell delay={0.08} className="flex flex-col gap-2">
            <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">Blast radius</span>
            <div className="flex-1 flex items-center justify-center">
              <svg viewBox="0 0 80 80" className="w-20 h-20" aria-hidden>
                {[32,22,12].map((r,i)=>(
                  <circle key={i} cx="40" cy="40" r={r}
                    fill="none" stroke="#FF4D4F"
                    strokeWidth="1" strokeOpacity={0.15 + i*0.25}>
                    <animate attributeName="r" values={`${r};${r+5};${r}`} dur={`${3+i*0.8}s`} repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values={`${0.15+i*0.25};0.05;${0.15+i*0.25}`} dur={`${3+i*0.8}s`} repeatCount="indefinite" />
                  </circle>
                ))}
                <circle cx="40" cy="40" r="6" fill="#FF4D4F" />
              </svg>
            </div>
            <p className="text-[10px] text-text-muted leading-snug">Visualise which services are in the blast radius of every active incident.</p>
          </BentoCell>

          {/* Cell 4: Offline replay */}
          <BentoCell delay={0.12} className="flex flex-col gap-2">
            <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">Offline replay</span>
            <div className="flex-1 flex items-center">
              <div className="flex flex-col gap-1.5 w-full">
                {['1×','10×','100×','1000×'].map((speed, i) => (
                  <div key={speed} className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-text-muted w-10">{speed}</span>
                    <div className="flex-1 h-1 rounded-full bg-bg-elevated overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: `${[25,50,75,100][i]}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8, delay: i * 0.1, ease: EASE }}
                        className="h-full rounded-full"
                        style={{ background: i === 3 ? '#F5A524' : `rgba(245,165,36,${0.3+i*0.2})` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-text-muted leading-snug">Replay entire storm scenarios at up to 1000× speed.</p>
          </BentoCell>

          {/* Cell 5: Keyboard-driven — col-span-2 */}
          <BentoCell delay={0.06} className="col-span-2 flex flex-col gap-3">
            <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">Keyboard-driven demo</span>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { key: 'S', desc: 'start replay' },
                { key: 'X', desc: 'stop' },
                { key: 'R', desc: 'reset' },
                { key: 'E', desc: 'eval' },
                { key: 'W', desc: 'war room' },
              ].map(({ key, desc }) => (
                <div key={key} className="flex items-center gap-1.5">
                  <Kbd>{key}</Kbd>
                  <span className="text-[10px] font-mono text-text-muted">{desc}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-text-secondary leading-snug">
              Zero-mouse operation for live demos. Every action is a single keystroke.
            </p>
          </BentoCell>

          {/* Cell 6: Eval harness */}
          <BentoCell delay={0.10} className="flex flex-col gap-2">
            <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">Eval harness</span>
            <div className="flex-1 flex flex-col justify-center gap-2">
              {[
                { label: 'Precision', val: 0.992 },
                { label: 'Purity',    val: 0.978 },
                { label: 'Latency',   val: 0.87  },
              ].map(({ label, val }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-text-muted w-12 flex-shrink-0">{label}</span>
                  <div className="flex-1 h-1 rounded-full bg-bg-elevated overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-accent"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${val * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, ease: EASE }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-accent font-bold w-6 flex-shrink-0">PASS</span>
                </div>
              ))}
            </div>
          </BentoCell>

        </div>
      </div>
    </section>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// 5. EVAL PROOF STRIP
// ════════════════════════════════════════════════════════════════════════════════
function EvalProofStrip() {
  const bars = [
    { label: 'Precision',       value: 0.992, display: '99.2%' },
    { label: 'Cluster purity',  value: 0.978, display: '97.8%' },
    { label: 'Median latency',  value: 0.870, display: '1.3 s'  },
  ]

  return (
    <section className="py-20 border-t border-border bg-bg-base">
      <div className="max-w-3xl mx-auto px-6">
        <motion.div
          variants={entranceVariants} initial="hidden" whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          className="flex flex-col gap-2 mb-12 text-center"
        >
          <span className="font-mono text-[10px] text-text-muted uppercase tracking-[0.22em]">Evaluation results</span>
          <h2 className="text-[28px] font-bold font-sans text-text-primary tracking-tight">Measured, not claimed.</h2>
        </motion.div>

        <motion.div
          variants={staggerContainerVariants} initial="hidden" whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          className="flex flex-col gap-8"
        >
          {bars.map((bar, i) => (
            <motion.div
              key={bar.label}
              variants={entranceVariants}
              className="flex items-center gap-6"
            >
              <span className="font-sans text-[13px] text-text-secondary w-32 flex-shrink-0">{bar.label}</span>
              <div className="flex-1">
                <ConfidenceBar confidence={bar.value} height="sm" showLabel={false} />
              </div>
              <span className="font-mono text-[13px] font-bold text-text-primary tabular-nums w-10 flex-shrink-0">
                {bar.display}
              </span>
              <motion.span
                initial={prefersReduced ? {} : { opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ ...SPRING, delay: 0.4 + i * 0.1 }}
                className="px-2 py-0.5 rounded border border-accent/30 bg-accent/10 text-accent text-[10px] font-mono font-bold flex-shrink-0"
              >
                PASS
              </motion.span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// 6. FINAL CTA + FOOTER
// ════════════════════════════════════════════════════════════════════════════════
// ── Text Reveal CTA (Upgrade 7) ────────────────────────────────────────────────
function TextRevealCTA() {
  if (prefersReduced) {
    return (
      <h2 className="text-[40px] font-bold font-sans text-text-primary tracking-tight max-w-[480px] leading-tight">
        Step into the War Room.
      </h2>
    )
  }

  const words = ["Step", "into", "the", "War", "Room."]

  return (
    <h2 className="text-[40px] font-bold font-sans text-text-primary tracking-tight max-w-[480px] leading-tight select-none">
      {words.map((w, idx) => (
        <span key={idx} className="inline-block overflow-hidden mr-2">
          <span
            className="inline-block translate-y-[12px] opacity-0 animate-[text-rise_0.5s_cubic-bezier(0.2,0.8,0.2,1)_forwards]"
            style={{
              animationDelay: `${idx * 40}ms`
            }}
          >
            {w}
          </span>
        </span>
      ))}
    </h2>
  )
}

function FinalCTA() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const istTime = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
      setTime(istTime + ' IST')
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <section className="relative pt-32 bg-bg-base overflow-hidden flex flex-col items-center text-center">
      {/* ONE soft accent radial glow — the only glow on the page */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% 60%, rgba(245,165,36,0.07) 0%, transparent 70%)',
        }}
      />

      <motion.div
        variants={entranceVariants} initial="hidden" whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        className="relative z-10 flex flex-col items-center gap-7 px-6 mb-24"
      >
        <LensMark size={32} />
        <TextRevealCTA />
        <p className="text-[14px] font-sans text-text-muted max-w-[360px] leading-relaxed">
          One command. Live storm. Real-time answers. No setup needed.
        </p>
        <Link
          to="/war-room"
          className="px-8 py-3 rounded-md text-[14px] font-bold font-sans hover:opacity-90 active:scale-95 transition-all duration-150"
          style={{ backgroundColor: 'var(--brand)', color: 'var(--on-brand)' }}
        >
          Enter the War Room →
        </Link>
      </motion.div>

      {/* Upgrade Footer (Upgrade 10) */}
      <footer className="w-full border-t border-border/40 bg-bg-surface py-12 relative z-10">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5 select-none">
            <LensMark size={20} />
            <span className="font-sans font-bold text-[14px] tracking-tight text-text-primary">StormLens</span>
          </div>
          <div className="text-[11px] font-mono text-text-muted/80 tracking-wide text-center">
            Team ZenVerse · Synergy 2026 · MUJ
          </div>
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex items-center gap-4 text-[12px] font-sans">
              <Link to="/eval" className="text-text-secondary hover:text-text-primary transition-colors duration-150">Eval</Link>
              <Link to="/war-room" className="text-text-secondary hover:text-text-primary transition-colors duration-150">War Room</Link>
            </div>
            <div className="text-[11px] font-mono text-brand select-none bg-brand-dim px-2.5 py-1 rounded border border-brand/20 tabular-nums">
              {time}
            </div>
          </div>
        </div>
      </footer>
    </section>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// ROOT EXPORT
// ════════════════════════════════════════════════════════════════════════════════
export function LandingPageNew() {
  const [replaySignal, setReplaySignal] = useState<number | undefined>(undefined)

  const handleReplay = useCallback(() => {
    setReplaySignal(prev => (prev ?? 0) + 1)
  }, [])

  // Scroll Progress Bar (Upgrade 2)
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  })

  useEffect(() => {
    document.title = 'StormLens — Synergy 2026'
    return () => { document.title = 'StormLens — War Room' }
  }, [])

  // Lenis Smooth Scroll (Upgrade 1)
  useEffect(() => {
    if (prefersReduced) return
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      gestureOrientation: 'vertical',
    })

    let rafId = 0
    const raf = (time: number) => {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }
    rafId = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(rafId)
      lenis.destroy()
    }
  }, [])

  return (
    <div className="min-h-screen bg-bg-base text-text-primary font-sans overflow-x-hidden">
      {/* Scroll Progress Bar (Upgrade 2) */}
      <motion.div
        style={{ scaleX }}
        className="fixed top-0 left-0 right-0 h-[2px] bg-brand z-[9999] origin-left"
      />
      <LandingNav />
      <HeroSection onReplay={handleReplay} replaySignal={replaySignal} />
      <StatsRow />
      <HowItWorks />
      <FeatureBento />
      <EvalProofStrip />
      <FinalCTA />
    </div>
  )
}
