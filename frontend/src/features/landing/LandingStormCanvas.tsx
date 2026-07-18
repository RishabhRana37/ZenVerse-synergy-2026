/**
 * LandingStormCanvas.tsx
 * Self-contained canvas animation for the /landing hero.
 * No zustand / WS imports.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Odometer } from '@/components/ui/Odometer'
import { fpsGuard } from '@/lib/fpsGuard'

const SEV_COLORS = { critical: '#FF4D4F', warning: '#F5A623', info: '#4D9FFF' } as const
type Severity = keyof typeof SEV_COLORS
const ACCENT = '#2DD4A7'
const LOOP_MS = 8000
const SPAWN_GAP = 165
const MAX_COUNT = 2000
const MIN_COUNT = 3
const EXPECTED_ARRIVALS = 32

interface Particle {
  id: number; x0: number; y0: number; cx1: number; cy1: number
  cx2: number; cy2: number; x1: number; y1: number
  t: number; speed: number; severity: Severity; target: 0|1|2
}

function bez(t: number, p0: number, p1: number, p2: number, p3: number) {
  const u = 1 - t
  return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3
}

function lerpColor(c1: string, c2: string, t: number): string {
  const r1=parseInt(c1.slice(1,3),16),g1=parseInt(c1.slice(3,5),16),b1=parseInt(c1.slice(5,7),16)
  const r2=parseInt(c2.slice(1,3),16),g2=parseInt(c2.slice(3,5),16),b2=parseInt(c2.slice(5,7),16)
  return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`
}

interface Props { replaySignal?: number }

export function LandingStormCanvas({ replaySignal }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)
  const S = useRef({
    particles: [] as Particle[], seq: 0,
    alertCount: MAX_COUNT, totalArrivals: 0,
    incArrivals: [0,0,0] as [number,number,number],
    pulses: [0,0,0] as [number,number,number],
    phase: 'spawning' as 'spawning'|'hold'|'reset',
    loopStart: 0, lastSpawn: 0, raf: 0,
  })
  const [displayCount, setDisplayCount] = useState(MAX_COUNT)
  const prefersReduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const getCards = useCallback((w: number, h: number) => {
    const cw=160, ch=54, gap=18
    const totalH=3*ch+2*gap, rx=w*0.72, sy=(h-totalH)/2
    return [0,1,2].map(i => ({
      x:rx, y:sy+i*(ch+gap)+ch/2, cw, ch,
      color:(['#FF4D4F','#F5A623','#4D9FFF'] as const)[i],
    }))
  }, [])

  const doReset = useCallback(() => {
    const st=S.current
    st.particles=[]; st.alertCount=MAX_COUNT; st.totalArrivals=0
    st.incArrivals=[0,0,0]; st.pulses=[0,0,0]
    st.phase='spawning'; st.loopStart=performance.now()
    setDisplayCount(MAX_COUNT)
  }, [])

  useEffect(() => { if (replaySignal !== undefined) doReset() }, [replaySignal, doReset])

  useEffect(() => {
    const canvas=canvasRef.current, wrap=wrapRef.current
    if (!canvas||!wrap) return
    const ctx=canvas.getContext('2d')!
    const st=S.current
    const resize=()=>{ canvas.width=wrap.clientWidth; canvas.height=wrap.clientHeight }
    resize()
    const ro=new ResizeObserver(resize)
    ro.observe(wrap)
    st.loopStart=performance.now()
    let prev=performance.now()

    const frame=(now: number)=>{
      fpsGuard.measure()
      const dt=Math.min(now-prev,50); prev=now
      const elapsed=now-st.loopStart
      const w=canvas.width, h=canvas.height
      const cards=getCards(w,h)

      if (st.phase==='spawning') {
        if (elapsed>LOOP_MS*0.70) { st.phase='hold' }
        else if (!prefersReduced&&!fpsGuard.isThrottled()&&now-st.lastSpawn>SPAWN_GAP) {
          const sevs:Severity[]=['critical','warning','info']
          const sev=sevs[Math.floor(Math.random()*3)]
          const ti=Math.floor(Math.random()*3) as 0|1|2
          const card=cards[ti]
          const x0=-12, y0=h*0.12+Math.random()*h*0.76
          const cx1=w*0.20+Math.random()*w*0.08, cy1=y0+(Math.random()-.5)*h*0.38
          const cx2=w*0.50+Math.random()*w*0.10, cy2=card.y+(Math.random()-.5)*h*0.22
          st.particles.push({
            id:st.seq++, x0,y0,cx1,cy1,cx2,cy2,
            x1:card.x-card.cw/2, y1:card.y,
            t:0, speed:0.003+Math.random()*0.0028, severity:sev, target:ti
          })
          st.lastSpawn=now
        }
      } else if (st.phase==='hold') {
        if (elapsed>LOOP_MS*0.87) st.phase='reset'
      } else {
        st.particles=[]
        if (elapsed>LOOP_MS) doReset()
      }

      ctx.clearRect(0,0,w,h)

      // faint path guides
      ctx.save(); ctx.setLineDash([3,15]); ctx.lineWidth=0.5
      cards.forEach(card=>{
        ctx.strokeStyle='rgba(255,255,255,0.033)'
        ctx.beginPath(); ctx.moveTo(-12,h*.5)
        ctx.bezierCurveTo(w*.22,h*.38,w*.52,card.y,card.x-card.cw/2,card.y)
        ctx.stroke()
      }); ctx.restore()

      // incident card silhouettes
      cards.forEach((card,i)=>{
        const pulse=st.pulses[i], arrived=st.incArrivals[i]>0
        const alpha=0.10+pulse*0.55
        ctx.fillStyle='rgba(17,22,31,0.85)'
        ctx.beginPath(); ctx.roundRect(card.x-card.cw/2,card.y-card.ch/2,card.cw,card.ch,4); ctx.fill()
        ctx.strokeStyle=arrived?`rgba(45,212,167,${alpha})`:card.color+Math.round(alpha*255).toString(16).padStart(2,'0')
        ctx.lineWidth=1+pulse*0.7
        ctx.beginPath(); ctx.roundRect(card.x-card.cw/2,card.y-card.ch/2,card.cw,card.ch,4); ctx.stroke()
        ctx.globalAlpha=0.9; ctx.fillStyle=arrived?ACCENT:card.color
        ctx.beginPath(); ctx.arc(card.x-card.cw/2+10,card.y-card.ch/2+10,2.5,0,Math.PI*2); ctx.fill()
        ctx.globalAlpha=1
        const la=0.22+pulse*0.15
        ctx.fillStyle=`rgba(230,237,243,${0.30+pulse*0.34})`
        ctx.fillRect(card.x-card.cw/2+19,card.y-card.ch/2+7,52,5)
        ctx.fillStyle=`rgba(139,152,169,${la})`
        ctx.fillRect(card.x-card.cw/2+10,card.y-card.ch/2+18,130,3.5)
        ctx.fillRect(card.x-card.cw/2+10,card.y-card.ch/2+26,95,3.5)
        ctx.fillRect(card.x-card.cw/2+10,card.y-card.ch/2+35,68,3.5)
        if (arrived) {
          const label=`x${st.incArrivals[i]}`
          ctx.fillStyle='rgba(45,212,167,0.12)'
          ctx.beginPath(); ctx.roundRect(card.x+card.cw/2-31,card.y-card.ch/2+4,27,14,3); ctx.fill()
          ctx.fillStyle=ACCENT; ctx.font='bold 8px "JetBrains Mono",monospace'
          ctx.textAlign='center'
          ctx.fillText(label,card.x+card.cw/2-17.5,card.y-card.ch/2+13.5)
          ctx.textAlign='left'
        }
      })

      // particles
      st.particles=st.particles.filter(p=>{
        p.t=Math.min(1,p.t+p.speed*(dt/16))
        const x=bez(p.t,p.x0,p.cx1,p.cx2,p.x1)
        const y=bez(p.t,p.y0,p.cy1,p.cy2,p.y1)
        const colorT=Math.max(0,(p.t-0.65)/0.35)
        const col=lerpColor(SEV_COLORS[p.severity],ACCENT,colorT)
        const r=Math.max(0.8,3.5-p.t*2.4)
        if (!fpsGuard.isThrottled()&&p.t>0.35) {
          ctx.globalAlpha=0.10*(1-p.t); ctx.fillStyle=col
          ctx.beginPath(); ctx.arc(x,y,r*3.5,0,Math.PI*2); ctx.fill()
        }
        ctx.globalAlpha=Math.max(0.3,1-p.t*0.10); ctx.fillStyle=col
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill()
        ctx.globalAlpha=1
        if (p.t>=1) {
          st.pulses[p.target]=1.0; st.incArrivals[p.target]++; st.totalArrivals++
          const newC=Math.max(MIN_COUNT,Math.round(MAX_COUNT-(MAX_COUNT-MIN_COUNT)*Math.min(1,st.totalArrivals/EXPECTED_ARRIVALS)))
          if (newC!==st.alertCount) { st.alertCount=newC; setDisplayCount(newC) }
          return false
        }
        return true
      })

      for (let i=0;i<3;i++) {
        if (st.pulses[i]>0) st.pulses[i]=Math.max(0,st.pulses[i]-0.033*(dt/16))
      }

      st.raf=requestAnimationFrame(frame)
    }
    st.raf=requestAnimationFrame(frame)
    return ()=>{ cancelAnimationFrame(st.raf); ro.disconnect() }
  }, [getCards, prefersReduced, doReset])

  if (prefersReduced) {
    return (
      <div className="relative w-full h-full flex flex-col items-end justify-center gap-4 pr-10">
        {[{label:'critical incident',color:'border-[#FF4D4F]/30'},{label:'network cascade',color:'border-[#F5A623]/30'},{label:'db saturation',color:'border-[#4D9FFF]/30'}].map((c)=>(
          <div key={c.label} className={`w-40 h-14 rounded border ${c.color} bg-bg-surface/80 p-2`}>
            <div className="w-10 h-1.5 bg-text-primary/30 rounded mb-1" />
            <div className="w-24 h-1 bg-text-muted/20 rounded mb-1" />
            <div className="w-16 h-1 bg-text-muted/20 rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative w-full h-full">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
      <div className="absolute top-8 left-0 right-0 flex flex-col items-center gap-0.5 pointer-events-none select-none">
        <span className="text-[10px] font-mono text-text-muted uppercase tracking-[0.22em]">alerts ingested</span>
        <Odometer value={displayCount} format="integer" easing="spring"
          className="text-[36px] font-bold text-text-primary tabular-nums leading-none" />
      </div>
    </div>
  )
}
