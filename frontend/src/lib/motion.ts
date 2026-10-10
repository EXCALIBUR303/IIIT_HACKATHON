/**
 * The animation layer. Motion (motion/react) handles UI state: route and panel transitions,
 * hover/tap, layout, counters. anime.js (see lib/anime.ts) is kept for SVG line drawing.
 *
 * Every component here is safe under reduced motion: <MotionConfig> in main.tsx turns
 * transform animations off for motion components, and imperative counters check
 * prefersReducedMotion() and jump straight to the final value.
 */
import type { Transition, Variants } from 'motion/react'

export { prefersReducedMotion } from './anime'

export const EASE_OUT = [0.22, 1, 0.36, 1] as const

export const DURATION = { fast: 0.15, base: 0.24, slow: 0.48 } as const

export const SPRING: Transition = { type: 'spring', stiffness: 420, damping: 36, mass: 0.8 }
export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 260, damping: 30 }

/** Fade and rise a little. The default entrance for a page section. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE_OUT } },
}

/** A parent that reveals its children one after another. */
export function staggerChildren(gap = 0.06, delay = 0): Variants {
  return { hidden: {}, show: { transition: { staggerChildren: gap, delayChildren: delay } } }
}

/** Swap between two pieces of content (e.g. a selected item's detail). */
export const swap: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, y: -6, transition: { duration: DURATION.fast } },
}
