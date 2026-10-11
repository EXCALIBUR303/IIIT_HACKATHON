/** Non-component helpers for the Market Lab (kept apart so components hot-reload cleanly). */
import { Building2, Globe2, Landmark, Layers, LineChart, Newspaper, type LucideIcon } from 'lucide-react'
import type { LabCompany, NewsCategory, ReferenceQuote } from '@/lib/api/types'

export const newRequestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now()}${Math.random().toString(16).slice(2)}`.padEnd(16, '0')

export function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (Number.isNaN(mins)) return ''
  if (mins < 60) return `${Math.max(mins, 1)} min ago`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

export const CATEGORY: Record<NewsCategory, { icon: LucideIcon; color: string }> = {
  Earnings: { icon: LineChart, color: '#4338ca' },
  Policy: { icon: Landmark, color: '#0e7490' },
  Sector: { icon: Layers, color: '#7c3aed' },
  Global: { icon: Globe2, color: '#0369a1' },
  Company: { icon: Building2, color: '#b45309' },
  Macro: { icon: Newspaper, color: '#047857' },
}

export interface WatchRow {
  key: string
  name: string
  ticker: string
  sector: string
  price_paise: number
  change_pct: number
  reference: number[]
  simulated: number[]
  held: number
  in_focus: boolean
}

/** Merge reference closes (real or demo) with this scenario's simulated prices. */
export function watchRows(quotes: ReferenceQuote[], companies?: LabCompany[]): WatchRow[] {
  const byKey = Object.fromEntries(quotes.map((q) => [q.key, q]))
  if (companies) {
    return companies.map((c) => ({
      key: c.key,
      name: c.name,
      ticker: c.ticker,
      sector: c.sector,
      price_paise: c.price_paise,
      change_pct: c.change_pct,
      reference: byKey[c.key]?.history.map((h) => h.close_paise) ?? [],
      simulated: c.history_paise,
      held: c.held,
      in_focus: c.in_focus,
    }))
  }
  return quotes.map((q) => ({
    key: q.key,
    name: q.name,
    ticker: q.ticker,
    sector: q.sector,
    price_paise: q.price_paise,
    change_pct: q.change_pct,
    reference: q.history.map((h) => h.close_paise),
    simulated: [q.price_paise],
    held: 0,
    in_focus: false,
  }))
}
