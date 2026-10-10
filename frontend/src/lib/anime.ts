import { animate, createScope, type Scope } from 'animejs'
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
