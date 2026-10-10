import { animate } from 'animejs'
import { useEffect, useRef } from 'react'
import { prefersReducedMotion as reducedMotion } from '@/lib/anime'
import { cn } from '@/lib/utils'


/** Grow a bar from zero the first time it scrolls into view. */
function useFillOnView() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || reducedMotion() || typeof IntersectionObserver === 'undefined') return
    let anim: ReturnType<typeof animate> | undefined
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      anim = animate(el, { scaleX: { from: 0 }, duration: 1000, ease: 'outExpo', delay: 120 })
    })
    io.observe(el)
    return () => {
      io.disconnect()
      anim?.revert()
    }
  }, [])
  return ref
}

interface ProgressBarProps {
  value: number // 0..100
  label: string
  className?: string
  barClassName?: string
  color?: string
}

export function ProgressBar({ value, label, className, barClassName, color }: ProgressBarProps) {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  const fill = useFillOnView()
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-line', className)}
    >
      <div
        ref={fill}
        className={cn('h-full origin-left rounded-full bg-primary transition-[width] duration-500', barClassName)}
        style={{ width: `${v}%`, background: color }}
      />
    </div>
  )
}

export function ProgressRing({ value, size = 56, stroke = 6, color = 'var(--color-primary)', label }: {
  value: number
  size?: number
  stroke?: number
  color?: string
  label: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${Math.round(v)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - v / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-[stroke-dashoffset] duration-700"
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-ink text-[13px] font-bold">
        {Math.round(v)}%
      </text>
    </svg>
  )
}
