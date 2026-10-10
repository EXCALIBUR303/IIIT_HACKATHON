import type { Preferences } from './api/types'

const KEY = 'rupeerise.prefs'
export const DEFAULT_PREFERENCES: Preferences = {
  large_text: false,
  reduced_motion: false,
  high_contrast: false,
  show_hints: true,
}

/** Apply accessibility preferences as classes on <html> and remember them on this device. */
export function applyPreferences(prefs: Preferences) {
  const root = document.documentElement
  root.classList.toggle('pref-large-text', prefs.large_text)
  root.classList.toggle('pref-high-contrast', prefs.high_contrast)
  root.classList.toggle('pref-reduced-motion', prefs.reduced_motion)
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

export function storedPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<Preferences>) }
  } catch {
    /* ignore */
  }
  return DEFAULT_PREFERENCES
}
