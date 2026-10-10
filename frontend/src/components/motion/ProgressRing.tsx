import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { EASE_OUT } from '@/lib/motion'
import { AnimatedNumber } from './AnimatedNumber'

/** A ring that draws to its value and counts up in the middle (both skip under reduced motion). */
export function ProgressRing({ value, size = 64, stroke = 6, color = 'var(--color-primary)', track = 'var(--color-line)', label, children, delay = 0.1 }: {
  value: number
  size?: number
  stroke?: number
  color?: string
  track?: string
  label: string
  children?: ReactNode
  delay?: number
}) {
  const v = Math.max(0, Math.min(100, value))
  const r = (size - stroke) / 2
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(v)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: v / 100, opacity: v === 0 ? 0 : 1 }}
          transition={{ duration: 1, ease: EASE_OUT, delay, opacity: { duration: 0.01, delay } }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center" aria-hidden>
        {children ?? <AnimatedNumber value={v} format={(n) => `${Math.round(n)}%`} className="font-mono text-xs font-bold text-ink" />}
      </div>
    </div>
  )
}
