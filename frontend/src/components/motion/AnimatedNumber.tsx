import { animate } from 'motion/react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { prefersReducedMotion } from '@/lib/motion'

/**
 * A number that counts from what is currently shown to the new value. Screen readers get only
 * the final value; the counting text is hidden from them. The counting span is written by this
 * component alone (React renders it empty), so React never fights over its text node.
 */
export function AnimatedNumber({ value, format = (n) => String(Math.round(n)), duration = 0.8, className }: {
  value: number
  format?: (n: number) => string
  duration?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef<number | null>(null)
  const fmt = useRef(format)
  fmt.current = format

  useLayoutEffect(() => {
    if (!ref.current || shown.current !== null) return
    const first = prefersReducedMotion() ? value : 0
    shown.current = first
    ref.current.textContent = fmt.current(first)
    // Only the first paint; later changes animate below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const start = shown.current ?? 0
    const write = (n: number) => {
      shown.current = n
      el.textContent = fmt.current(n)
    }
    if (prefersReducedMotion() || start === value) {
      write(value)
      return
    }
    const controls = animate(start, value, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: write, onComplete: () => write(value) })
    return () => controls.stop()
  }, [value, duration])

  return (
    <span className={className}>
      <span ref={ref} aria-hidden className="tabular" />
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}
