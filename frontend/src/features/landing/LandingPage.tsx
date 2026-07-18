import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { HeroConvergenceCanvas } from './HeroConvergenceCanvas'
import { Button } from '@/components/ui/Button'
import { ReticleLogo } from '@/components/ui/ReticleLogo'
import { Kbd } from '@/components/ui/Kbd'
import { useFPSStore, springPreset } from '@/lib/motion'
import { clsx } from 'clsx'

// ── Shared Hook for Scroll-Triggered Count Up ────────────────────────────────
function useCountUp(target: number, duration: number = 1500, prefix: string = '', suffix: string = '', decimals: number = 0) {
  const [value, setValue] = useState(0)
  const [visible, setVisible] = useState(false)
  const elementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    if (elementRef.current) {
      observer.observe(elementRef.current)
    }
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let startTime: number | null = null
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const elapsed = timestamp - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easeProgress = progress * (2 - progress) // Easing out quad
      setValue(easeProgress * target)
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    requestAnimationFrame(animate)
  }, [visible, target, duration])

  return {
    ref: elementRef,
    display: prefix + value.toFixed(decimals) + suffix,
  }
}

// ── Shared Component for Typing Summary Effect ─────────────────────────────
function TypingText({ text }: { text: string }) {
  const [typed, setTyped] = useState('')
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    if (ref.current) {
      observer.observe(ref.current)
    }
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let index = 0
    const interval = setInterval(() => {
      setTyped((prev) => prev + text.charAt(index))
      index++
      if (index >= text.length) {
        clearInterval(interval)
      }
    }, 12)
    return () => clearInterval(interval)
  }, [visible, text])

  return (
    <div ref={ref} className="font-mono text-[10px] text-text-secondary leading-relaxed select-text min-h-[36px]">
      {typed}
    </div>
  )
}

export function LandingPage() {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [canvasKey, setCanvasKey] = useState(0)

  const fpsReduced = useFPSStore((s) => s.reducedMotion)
  const reducedMotion = (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || fpsReduced

  // Navbar background opacity toggle on scroll
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Stats count up configuration
  const statNoise = useCountUp(99.85, 1800, '', '%', 2)
  const statLatency = useCountUp(1.8, 1400, '<', 's', 1)
  const statReplay = useCountUp(1000, 1600, '', 'x', 0)
  const statCompression = useCountUp(2000, 2000, 'from ', ' alerts', 0)

  // Motion animation parameters
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: reducedMotion ? 0 : 0.08,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: reducedMotion ? 0 : 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: reducedMotion ? { duration: 0.1 } : springPreset,
    },
  }

  return (
    <div className="w-full min-h-screen bg-[#050810] text-text-primary font-sans select-none overflow-x-hidden relative">
      
      {/* ── Background Grid & Diagonal Lasers (Vercel Grid + Raycast lasers) ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 opacity-40">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:36px_36px]" />
        <div className="absolute -top-[10%] left-[5%] w-[160px] h-[140%] bg-gradient-to-b from-[#FF2B2E]/0 via-[#FF2B2E]/16 to-[#FF2B2E]/0 rotate-[35deg] blur-[100px]" />
        <div className="absolute -top-[25%] left-[38%] w-[260px] h-[150%] bg-gradient-to-b from-[#FF2B2E]/0 via-[#FF2B2E]/22 to-[#FF4D4F]/6 rotate-[35deg] blur-[140px]" />
        <div className="absolute -top-[20%] left-[65%] w-[90px] h-[130%] bg-gradient-to-b from-[#F5A623]/0 via-[#F5A623]/8 to-[#F5A623]/0 rotate-[35deg] blur-[80px]" />
      </div>

      {/* ── 0. NAVBAR ── */}
      <header
        className={clsx(
          "fixed top-0 left-0 right-0 h-14 z-[100] border-b transition-all duration-300 flex items-center justify-between px-6 md:px-12",
          scrolled
            ? "bg-[#0A0E14]/80 backdrop-blur-md border-border/80 shadow-lg shadow-black/20"
            : "bg-transparent border-transparent"
        )}
      >
        <div className="flex items-center gap-3">
          <ReticleLogo connection="open" />
          <span className="font-sans text-[14px] font-bold tracking-tight text-[#E6EDF3]">StormLens</span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-[12px] font-mono text-text-secondary">
          <a href="#how-it-works" className="hover:text-text-primary transition-colors">How it works</a>
          <a href="#features" className="hover:text-text-primary transition-colors">Features</a>
          <span className="text-border/40 select-none">·</span>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('stormlens-open-palette'))}
            className="flex items-center gap-1.5 hover:text-text-primary transition-colors cursor-pointer bg-transparent border-0 outline-none font-mono"
          >
            <span>Command Menu</span>
            <Kbd>⌘K</Kbd>
          </button>
        </nav>

        <div className="flex items-center gap-4">
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/war-room')}
            className="h-8 rounded bg-[#2DD4A7] hover:bg-[#2DD4A7]/90 text-[#0A0E14] font-semibold text-[11px] font-sans px-4 shadow-[0_0_12px_rgba(45,212,167,0.2)]"
          >
            Enter War Room
          </Button>
        </div>
      </header>

      {/* ── 1. HERO SECTION ── */}
      <section className="min-h-screen w-full flex flex-col items-center justify-center pt-24 pb-12 px-6 md:px-12 relative z-10">
        <div className="w-full max-w-4xl text-center flex flex-col items-center">
          {/* Eyebrow */}
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-muted mb-6 animate-fade-in">
            SYNERGY 2026 · HPE PS #10
          </span>

          {/* Headline */}
          <h1 className="text-4xl md:text-7xl font-bold tracking-tight leading-[1.05] text-text-primary max-w-3xl">
            From 2,000 alerts <br />
            to <span className="bg-gradient-to-r from-accent via-[#2DD4A7]/80 to-[#2DD4A7]/50 bg-clip-text text-transparent">3 </span>
            <span className="italic font-serif font-light text-accent bg-transparent pr-1">answers.</span>
          </h1>

          {/* Subheading */}
          <p className="text-[13px] md:text-[16px] text-text-secondary max-w-xl mt-6 leading-relaxed font-sans">
            StormLens correlates telemetry storms in real-time, deduping millions of telemetry logs down to clear root causes. Measured in milliseconds, not hours.
          </p>

          {/* CTAs */}
          <div className="flex items-center gap-3.5 mt-8">
            <Button
              variant="primary"
              size="lg"
              onClick={() => navigate('/war-room')}
              className="bg-[#2DD4A7] hover:bg-[#2DD4A7]/90 text-[#0A0E14] hover:shadow-[0_0_16px_rgba(45,212,167,0.3)] hover:-translate-y-[1px] font-semibold px-6 py-3 rounded-lg flex items-center gap-2 transition-all shadow-lg"
            >
              Enter the War Room
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setCanvasKey((prev) => prev + 1)}
              className="px-6 py-3 rounded-lg border border-border/80 text-text-primary hover:border-border-hover transition-colors font-mono text-[11px]"
            >
              Watch the storm ▸
            </Button>
          </div>
        </div>

        {/* Live Visual Canvas Area */}
        <div className="w-full max-w-5xl h-[340px] md:h-[400px] border border-border bg-[#0A0E14]/40 rounded-xl mt-16 relative overflow-hidden group">
          <HeroConvergenceCanvas key={canvasKey} />
          {/* Faint corner brackets */}
          <div className="absolute top-2 left-2 w-2 h-2 border-t border-l border-border/30" />
          <div className="absolute top-2 right-2 w-2 h-2 border-t border-r border-border/30" />
          <div className="absolute bottom-2 left-2 w-2 h-2 border-b border-l border-border/30" />
          <div className="absolute bottom-2 right-2 w-2 h-2 border-b border-r border-border/30" />
        </div>
      </section>

      {/* ── 2. STATS ROW ── */}
      <section className="w-full border-y border-border/60 bg-[#0A0E14]/60 py-10 relative z-10">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4 text-center">
          <div ref={statNoise.ref} className="flex flex-col gap-1">
            <span className="text-2xl md:text-3xl font-mono font-bold tracking-tight text-accent tabular-nums">
              {statNoise.display}
            </span>
            <span className="text-[10px] font-sans text-text-secondary uppercase tracking-wider">
              noise reduced
            </span>
          </div>
          <div ref={statLatency.ref} className="flex flex-col gap-1">
            <span className="text-2xl md:text-3xl font-mono font-bold tracking-tight text-text-primary tabular-nums">
              {statLatency.display}
            </span>
            <span className="text-[10px] font-sans text-text-secondary uppercase tracking-wider">
              correlation latency
            </span>
          </div>
          <div ref={statReplay.ref} className="flex flex-col gap-1">
            <span className="text-2xl md:text-3xl font-mono font-bold tracking-tight text-text-primary tabular-nums">
              {statReplay.display}
            </span>
            <span className="text-[10px] font-sans text-text-secondary uppercase tracking-wider">
              replay engine speed
            </span>
          </div>
          <div ref={statCompression.ref} className="flex flex-col gap-1">
            <span className="text-2xl md:text-3xl font-mono font-bold tracking-tight text-text-primary tabular-nums">
              {statCompression.display}
            </span>
            <span className="text-[10px] font-sans text-text-secondary uppercase tracking-wider">
              real-time convergence
            </span>
          </div>
        </div>
      </section>

      {/* ── 3. HOW IT WORKS ── */}
      <section id="how-it-works" className="w-full py-24 px-6 md:px-12 max-w-5xl mx-auto relative z-10">
        <div className="text-left mb-16">
          <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
            Workflow Architecture
          </span>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-text-primary mt-1.5 font-sans">
            Scroll storytelling
          </h2>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-120px" }}
          className="flex flex-col gap-16"
        >
          {/* Step 1: Ingest */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="flex flex-col text-left">
              <span className="font-mono text-[10px] text-accent tracking-widest uppercase mb-1.5">
                01 INGEST
              </span>
              <h3 className="text-[16px] font-bold text-text-primary font-sans">
                Real-time log ingestion
              </h3>
              <p className="text-[12px] text-text-secondary mt-3 leading-relaxed font-sans">
                StormLens hooks into raw log events, processing stream data directly inside memory buffers to avoid CPU and disk overhead.
              </p>
            </div>
            {/* Log Stream Mock */}
            <div className="border border-border/80 bg-[#11161F]/60 p-4 rounded-lg font-mono text-[10px] text-left flex flex-col gap-2 shadow-inner">
              <div className="flex items-center gap-2 opacity-80 animate-pulse">
                <span className="px-1.5 py-0.5 rounded bg-severity-critical text-[#0A0E14] font-bold text-[10px]">CRIT</span>
                <span className="text-text-muted">12:54:37</span>
                <span className="text-text-secondary select-text">postgres-primary · disk write timeout</span>
              </div>
              <div className="flex items-center gap-2 opacity-60">
                <span className="px-1.5 py-0.5 rounded bg-severity-warning text-[#0A0E14] font-bold text-[10px]">WARN</span>
                <span className="text-text-muted">12:54:36</span>
                <span className="text-text-secondary select-text">redis-cache · response late 180ms</span>
              </div>
              <div className="flex items-center gap-2 opacity-40">
                <span className="px-1.5 py-0.5 rounded bg-severity-info text-[#0A0E14] font-bold text-[10px]">INFO</span>
                <span className="text-text-muted">12:54:35</span>
                <span className="text-text-secondary select-text">gateway-service · 200 GET /health</span>
              </div>
            </div>
          </motion.div>

          {/* Step 2: Correlate */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center md:flex-row-reverse">
            <div className="flex flex-col text-left md:order-2">
              <span className="font-mono text-[10px] text-accent tracking-widest uppercase mb-1.5">
                02 CORRELATE
              </span>
              <h3 className="text-[16px] font-bold text-text-primary font-sans">
                Directed graph dependency tracking
              </h3>
              <p className="text-[12px] text-text-secondary mt-3 leading-relaxed font-sans">
                Aligns unstructured logs against known network and host dependency graphs, highlighting structural propagation pathways.
              </p>
            </div>
            {/* SVG Tree Diagram */}
            <div className="border border-border/80 bg-[#11161F]/60 p-4 rounded-lg flex items-center justify-center h-[120px] md:order-1 relative shadow-inner">
              <svg className="w-full h-full max-w-[280px]" viewBox="0 0 200 80">
                {/* Connector beams drawing */}
                <path d="M20 20 L100 40" stroke="rgba(255, 77, 79, 0.4)" strokeWidth="1" strokeDasharray="3,3" />
                <path d="M20 40 L100 40" stroke="rgba(245, 166, 35, 0.4)" strokeWidth="1" strokeDasharray="3,3" />
                <path d="M20 60 L100 40" stroke="rgba(77, 159, 255, 0.4)" strokeWidth="1" strokeDasharray="3,3" />
                <path d="M100 40 L180 40" stroke="#2DD4A7" strokeWidth="1.5" className="animate-pulse" />
                
                {/* Node Circles */}
                <circle cx="20" cy="20" r="4" fill="#FF4D4F" />
                <circle cx="20" cy="40" r="4" fill="#F5A623" />
                <circle cx="20" cy="60" r="4" fill="#4D9FFF" />
                <circle cx="100" cy="40" r="5" fill="#11161F" stroke="#2DD4A7" strokeWidth="1.5" />
                <circle cx="180" cy="40" r="4" fill="#2DD4A7" />
              </svg>
            </div>
          </motion.div>

          {/* Step 3: Explain */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="flex flex-col text-left">
              <span className="font-mono text-[10px] text-accent tracking-widest uppercase mb-1.5">
                03 EXPLAIN
              </span>
              <h3 className="text-[16px] font-bold text-text-primary font-sans">
                AIOps root cause explanation
              </h3>
              <p className="text-[12px] text-text-secondary mt-3 leading-relaxed font-sans">
                Generates a clean text description of the outage cascade, estimating confidence levels based on historical matches.
              </p>
            </div>
            {/* LLM Card mockup */}
            <div className="border border-border/80 bg-[#11161F]/60 p-4 rounded-lg text-left flex flex-col gap-2.5 shadow-inner">
              <div className="flex items-center justify-between border-b border-border/20 pb-2">
                <span className="text-[10px] font-mono font-bold text-accent">postgres-primary.root-cause</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent font-bold">98% CONF</span>
              </div>
              <TypingText text="Outage cascade triggered by disk block write delays on postgres-primary (host-12). Downstream connections topayment-service and billing API timed out, affecting auth-service." />
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ── 4. FEATURE BENTO GRID ── */}
      <section id="features" className="w-full py-24 bg-[#0A0E14]/40 border-t border-border/60 relative z-10 px-6 md:px-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-left mb-16">
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
              Core Capabilities
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-text-primary mt-1.5 font-sans">
              Asymmetric bento grid
            </h2>
          </div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {/* Hero Cell (2x2) */}
            <motion.div
              variants={itemVariants}
              className="md:col-span-2 md:row-span-2 bg-[#11161F] border border-border rounded-lg p-6 text-left flex flex-col justify-between group transition-all duration-150 hover:border-border-hover hover:-translate-y-[1px] shadow-sm relative overflow-hidden"
            >
              <div className="flex flex-col gap-1.5 mb-6">
                <span className="text-accent text-[18px]">🧭</span>
                <h4 className="text-[14px] font-bold font-sans">Root-cause dependency graph propagation</h4>
                <p className="text-[11px] text-text-secondary mt-1 font-sans leading-relaxed">
                  Real-time cytoscape models track critical dependencies, finding the exact point of origin in a cascade storm.
                </p>
              </div>
              {/* Static SVG Cytoscape-style mock */}
              <div className="w-full h-36 bg-[#0A0E14]/60 border border-border/40 rounded flex items-center justify-center relative overflow-hidden shadow-inner">
                <svg className="w-full h-full max-w-[320px]" viewBox="0 0 300 120">
                  <path d="M60 60 L150 30" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  <path d="M60 60 L150 90" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  <path d="M150 30 L240 60" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  <path d="M150 90 L240 60" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  <circle cx="60" cy="60" r="14" fill="#11161F" stroke="#FF4D4F" strokeWidth="2" className="animate-pulse" />
                  <circle cx="60" cy="60" r="24" fill="none" stroke="rgba(255, 77, 79, 0.15)" strokeWidth="1" className="animate-ping" style={{ animationDuration: '3s' }} />
                  <circle cx="150" cy="30" r="10" fill="#11161F" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
                  <circle cx="150" cy="90" r="10" fill="#11161F" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
                  <circle cx="240" cy="60" r="10" fill="#11161F" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
                  <text x="60" y="63" fill="#FF4D4F" fontSize="10" fontFamily="monospace" textAnchor="middle">ROOT</text>
                </svg>
              </div>
            </motion.div>

            {/* Dedup engine */}
            <motion.div
              variants={itemVariants}
              className="bg-[#11161F] border border-border rounded-lg p-5 text-left flex flex-col justify-between group transition-all duration-150 hover:border-border-hover hover:-translate-y-[1px] shadow-sm"
            >
              <div className="flex flex-col gap-1">
                <span className="text-accent text-[16px]">⚡</span>
                <h4 className="text-[12px] font-bold font-sans">Dedup compression engine</h4>
                <p className="text-[10px] text-text-secondary font-sans leading-relaxed">
                  Compresses duplicate logs instantly inside active ring buffers.
                </p>
              </div>
              <div className="flex items-center gap-2 bg-[#0A0E14]/60 p-2.5 rounded border border-border/40 font-mono text-[10px] justify-between mt-4">
                <span className="text-text-muted">deduplication</span>
                <span className="text-accent font-bold animate-pulse">×948 records</span>
              </div>
            </motion.div>

            {/* Blast radius */}
            <motion.div
              variants={itemVariants}
              className="bg-[#11161F] border border-border rounded-lg p-5 text-left flex flex-col justify-between group transition-all duration-150 hover:border-border-hover hover:-translate-y-[1px] shadow-sm"
            >
              <div className="flex flex-col gap-1">
                <span className="text-accent text-[16px]">⭕</span>
                <h4 className="text-[12px] font-bold font-sans">Outage blast radius</h4>
                <p className="text-[10px] text-text-secondary font-sans leading-relaxed">
                  Estimates affected downstream clusters and nodes.
                </p>
              </div>
              <div className="h-16 flex items-center justify-center relative overflow-hidden mt-2">
                <div className="w-12 h-12 rounded-full border border-accent/20 flex items-center justify-center animate-ping" style={{ animationDuration: '3s' }} />
                <div className="w-8 h-8 rounded-full border border-accent/40 flex items-center justify-center absolute animate-ping" style={{ animationDuration: '2s' }} />
                <div className="w-4 h-4 rounded-full bg-accent/20 border border-accent flex items-center justify-center absolute" />
              </div>
            </motion.div>

            {/* Replay speed */}
            <motion.div
              variants={itemVariants}
              className="bg-[#11161F] border border-border rounded-lg p-5 text-left flex flex-col justify-between group transition-all duration-150 hover:border-border-hover hover:-translate-y-[1px] shadow-sm"
            >
              <div className="flex flex-col gap-1">
                <span className="text-accent text-[16px]">⏱</span>
                <h4 className="text-[12px] font-bold font-sans">Offline time machine</h4>
                <p className="text-[10px] text-text-secondary font-sans leading-relaxed">
                  Replays raw incidents at speeds from 1× to 1000×.
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-border/20 pt-3 mt-4">
                <span className="text-[10px] font-mono text-text-muted">DIAL SPEED</span>
                <span className="text-[11px] font-mono font-bold text-accent">1000× speed</span>
              </div>
            </motion.div>

            {/* Command palette */}
            <motion.div
              variants={itemVariants}
              className="bg-[#11161F] border border-border rounded-lg p-5 text-left flex flex-col justify-between group transition-all duration-150 hover:border-border-hover hover:-translate-y-[1px] shadow-sm"
            >
              <div className="flex flex-col gap-1">
                <span className="text-accent text-[16px]">⌨</span>
                <h4 className="text-[12px] font-bold font-sans">Keyboard shortcuts</h4>
                <p className="text-[10px] text-text-secondary font-sans leading-relaxed">
                  Trigger commands instantly using standard keybind chips.
                </p>
              </div>
              <div className="flex items-center gap-1.5 mt-4">
                <Kbd>⌘K</Kbd>
                <span className="text-[10px] font-mono text-text-muted">palette</span>
                <Kbd>W</Kbd>
                <span className="text-[10px] font-mono text-text-muted">war room</span>
              </div>
            </motion.div>

            {/* Eval harness */}
            <motion.div
              variants={itemVariants}
              className="bg-[#11161F] border border-border rounded-lg p-5 text-left flex flex-col justify-between group transition-all duration-150 hover:border-border-hover hover:-translate-y-[1px] shadow-sm"
            >
              <div className="flex flex-col gap-1">
                <span className="text-accent text-[16px]">⚖</span>
                <h4 className="text-[12px] font-bold font-sans">Evaluation metrics</h4>
                <p className="text-[10px] text-text-secondary font-sans leading-relaxed">
                  Runs ablation tests on labeled ground truth metrics.
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-border/20 pt-3 mt-4">
                <span className="text-[10px] font-mono text-text-muted">ABLATION</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent font-bold">✓ PASS</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── 5. EVAL PROOF STRIP ── */}
      <section className="w-full py-16 bg-[#050810] border-t border-border/60 relative z-10 px-6">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="text-left flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
              AIOPS EVALUATION
            </span>
            <h3 className="text-xl font-bold tracking-tight text-text-primary font-sans">
              Measured, not claimed.
            </h3>
          </div>
          {/* Diagnostic Bars */}
          <div className="flex flex-col gap-3 w-full md:w-80 text-left font-mono text-[10px]">
            <div>
              <div className="flex justify-between text-text-secondary mb-1">
                <span>PRECISION</span>
                <span className="text-accent font-bold">96.4% <span className="text-[10px] text-[#2DD4A7]/60">PASS</span></span>
              </div>
              <div className="h-1.5 w-full bg-[#11161F] rounded border border-border/40 overflow-hidden relative">
                <div className="absolute top-0 bottom-0 left-0 bg-accent rounded" style={{ width: '96.4%' }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-text-secondary mb-1">
                <span>RECALL</span>
                <span className="text-accent font-bold">87.0% <span className="text-[10px] text-[#2DD4A7]/60">PASS</span></span>
              </div>
              <div className="h-1.5 w-full bg-[#11161F] rounded border border-border/40 overflow-hidden relative">
                <div className="absolute top-0 bottom-0 left-0 bg-accent rounded" style={{ width: '87.0%' }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-text-secondary mb-1">
                <span>COMPRESSION RATIO</span>
                <span className="text-accent font-bold">99.85% <span className="text-[10px] text-[#2DD4A7]/60">PASS</span></span>
              </div>
              <div className="h-1.5 w-full bg-[#11161F] rounded border border-border/40 overflow-hidden relative">
                <div className="absolute top-0 bottom-0 left-0 bg-accent rounded" style={{ width: '99.85%' }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. FINAL CTA & FOOTER ── */}
      <section className="w-full py-32 bg-[#0A0E14]/40 border-t border-border/60 relative z-10 flex flex-col items-center justify-center text-center px-6">
        {/* Soft Background Accent Glow-Blob */}
        <div className="absolute bottom-[20%] left-1/2 -translate-x-1/2 w-[380px] h-[380px] rounded-full bg-[#2DD4A7]/4 blur-[120px] pointer-events-none" />

        <div className="max-w-2xl relative z-10 flex flex-col items-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-text-primary leading-tight font-sans">
            Step into the War Room.
          </h2>
          <p className="text-[12px] text-text-secondary mt-4 max-w-sm font-sans leading-relaxed">
            See the correlation engine handle real-time database block timeouts and connection crashes under live load.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3">
            <Button
              variant="primary"
              size="lg"
              onClick={() => navigate('/war-room')}
              className="bg-[#2DD4A7] hover:bg-[#2DD4A7]/90 text-[#0A0E14] font-semibold px-8 py-3.5 rounded-lg flex items-center gap-2 shadow-lg shadow-accent/10 hover:shadow-accent/20 transition-all font-sans text-ui-sm"
            >
              Launch Dashboard
            </Button>
            <span className="text-[10px] font-mono text-text-muted mt-2 tracking-wide">
              Press <kbd className="px-1.5 py-0.5 rounded bg-bg-surface border border-border text-accent font-bold select-all font-mono">W</kbd> during the demo to return here
            </span>
          </div>
        </div>

        {/* Footer */}
        <footer className="w-full max-w-5xl border-t border-border/20 mt-32 pt-8 flex flex-col md:flex-row items-center justify-between text-[10px] font-mono text-text-muted gap-4">
          <span>Team ZenVerse · Synergy 2026</span>
          <div className="flex gap-4">
            <a href="https://github.com/RishabhRana37/ZenVerse-synergy-2026" target="_blank" rel="noopener noreferrer" className="hover:text-text-secondary transition-colors">GitHub</a>
            <span>·</span>
            <a href="#docs" className="hover:text-text-secondary transition-colors">Docs</a>
            <span>·</span>
            <span>MUJ</span>
          </div>
        </footer>
      </section>

    </div>
  )
}
