import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Language } from '../api/types'
import { en, type MessageKey } from './en'
import { hi } from './hi'
import { te } from './te'

const DICTIONARIES: Record<Language, Partial<Record<MessageKey, string>>> = { en, hi, te }
const STORAGE_KEY = 'rupeerise.lang'

export const LANGUAGES: { code: Language; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
]

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

interface I18nValue {
  lang: Language
  setLang: (lang: Language) => void
  t: Translate
}

const I18nContext = createContext<I18nValue | null>(null)

function initialLang(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'hi' || stored === 'te') return stored
  } catch {
    /* ignore */
  }
  return 'en'
}

export function translate(lang: Language, key: MessageKey, vars?: Record<string, string | number>): string {
  let text: string = DICTIONARIES[lang][key] ?? en[key] ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v))
  return text
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(initialLang)

  const setLang = useCallback((next: Language) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const t = useCallback<Translate>((key, vars) => translate(lang, key, vars), [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}
