import { motion } from 'framer-motion'
import { useFPSStore } from '@/lib/motion'

interface SparklineProps {
  data: number[]
  width: number
  height: number
  color?: string
}

export function Sparkline({ data, width, height, color = '#2DD4A7' }: SparklineProps) {
  const fpsReduced = useFPSStore((s) => s.reducedMotion)
  const prefersReduced = (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || fpsReduced

  if (data.length === 0) return null

  const yMin = Math.min(...data)
  const yMax = Math.max(...data)
  const yRange = yMax - yMin === 0 ? 1 : yMax - yMin

  const getX = (idx: number) => (idx * width) / Math.max(1, data.length - 1)
  const getY = (val: number) => {
    // 2px top/bottom padding to prevent line clipping
    const paddedHeight = height - 4
    const pct = (val - yMin) / yRange
    return height - 2 - pct * paddedHeight
  }

  // Generate SVG path d string
  const points = data.map((val, idx) => ({ x: getX(idx), y: getY(val) }))
  let d = ''
  if (points.length > 0) {
    d = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
  }

  // Generate area d string (under sparkline)
  const areaD = d ? `${d} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z` : ''

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible select-none pointer-events-none">
      {/* Area under line */}
      {areaD && (
        <motion.path
          d={areaD}
          fill={`url(#sparkline-grad-${color.replace('#', '')})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.12 }}
          transition={{ duration: 0.3, delay: prefersReduced ? 0 : 0.4 }}
        />
      )}
      
      {/* Sparkline path */}
      {d && (
        <motion.path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: prefersReduced ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.65, ease: 'easeOut' }}
        />
      )}

      <defs>
        <linearGradient id={`sparkline-grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
