import { animate, createScope, stagger, utils, type JSAnimation, type Scope } from 'animejs'
import { useEffect, useRef, type DependencyList, type RefObject } from 'react'

/** True when the OS asks for less motion or the student turned on "Reduce motion" in Settings. */
export function prefersReducedMotion() {
  if (typeof window === 'undefined') return true
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('pref-reduced-motion')
}

/**
 * Run anime.js animations scoped to one element. Selectors inside `setup` resolve
 * within `root`, everything is reverted on unmount, and nothing runs when the
 * user prefers reduced motion. Elements should render in their final state, and
 * animations should animate *from* a start value, so the page is complete even
 * without JavaScript animation.
 */
export function useAnime(root: RefObject<HTMLElement | null>, setup: (scope: Scope) => void, deps: DependencyList) {
  useEffect(() => {
    if (!root.current) return
    const scope = createScope({ root: root.current, mediaQueries: { reduce: '(prefers-reduced-motion: reduce)' } }).add((self) => {
      if (self?.matches.reduce || prefersReducedMotion()) return
      setup(self as Scope)
    })
    return () => scope.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/** Count a number up inside an element, writing the formatted value as it goes. */
export function countUp(el: Element | null, to: number, format: (n: number) => string, duration = 1200, delay = 0) {
  if (!el || prefersReducedMotion()) return
  const state = { n: 0 }
  el.textContent = format(0)
  animate(state, {
    n: to,
    duration,
    delay,
    ease: 'outExpo',
    onUpdate: () => {
      el.textContent = format(Math.round(state.n))
    },
    onComplete: () => {
      el.textContent = format(to)
    },
  })
}

/**
 * Fade-and-rise every `[data-card]` / `[data-reveal]` inside `root` as it scrolls into
 * view, including ones that appear later (data loading). Inline styles are cleaned on
 * completion so CSS hover transforms keep working. Skipped for reduced motion.
 */
export function useScrollReveal(root: RefObject<HTMLElement | null>, key: unknown) {
  useEffect(() => {
    const el = root.current
    if (!el || prefersReducedMotion()) return
    const seen = new WeakSet<Element>()
    const running: JSAnimation[] = []
    let queue: Element[] = []
    let frame = 0
    const flush = () => {
      frame = 0
      if (!queue.length) return
      running.push(
        animate(queue, {
          opacity: { from: 0 },
          y: { from: 26 },
          scale: { from: 0.985 },
          delay: stagger(70),
          duration: 750,
          ease: 'outExpo',
          onComplete: (a) => utils.cleanInlineStyles(a),
        }),
      )
      queue = []
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          io.unobserve(e.target)
          // Nested cards ride along with their parent.
          if (e.target.parentElement?.closest('[data-card],[data-reveal]') && seen.has(e.target.parentElement.closest('[data-card],[data-reveal]')!)) continue
          queue.push(e.target)
          if (!frame) frame = requestAnimationFrame(flush)
        }
      },
      { rootMargin: '0px 0px -6% 0px' },
    )
    const scan = () =>
      el.querySelectorAll('[data-card],[data-reveal]').forEach((n) => {
        if (seen.has(n)) return
        seen.add(n)
        io.observe(n)
      })
    scan()
    const mo = new MutationObserver(scan)
    mo.observe(el, { childList: true, subtree: true })
    return () => {
      io.disconnect()
      mo.disconnect()
      cancelAnimationFrame(frame)
      running.forEach((a) => a.revert())
    }
  }, [root, key])
}

/** Pointer-follow tilt for cards and tiles. Spread the returned handlers on the element. */
export function tiltHandlers(strength = 7) {
  return {
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      if (e.pointerType !== 'mouse') return
      const r = e.currentTarget.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      e.currentTarget.style.transform = `perspective(800px) rotateX(${-y * strength * 0.75}deg) rotateY(${x * strength}deg) translateY(-3px)`
    },
    onPointerLeave(e: React.PointerEvent<HTMLElement>) {
      e.currentTarget.style.transform = ''
    },
  }
}

/** Flick an element when `value` changes (not on first render), so changes catch the eye. */
export function useFlick<T extends HTMLElement>(value: unknown) {
  const ref = useRef<T>(null)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    const a = animate(el, { y: { from: -6 }, opacity: { from: 0.35 }, duration: 380, ease: 'outQuad' })
    return () => {
      a.revert()
    }
  }, [value])
  return ref
}
