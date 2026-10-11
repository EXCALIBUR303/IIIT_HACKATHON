import { animate, svg } from 'animejs'
import { useRef } from 'react'
import type { DataStatus, Impact, NewsCategory } from '@/lib/api/types'
import { CATEGORY } from './lib'
import { useAnime, has } from '@/lib/anime'
import { cn } from '@/lib/utils'

const STATUS: Record<DataStatus, { label: string; dot: string; text: string; title: string }> = {
  live: { label: 'Live', dot: 'bg-accent', text: 'text-accent-ink', title: 'Fetched recently from the provider' },
  delayed: { label: 'Delayed', dot: 'bg-reward', text: 'text-reward-ink', title: 'Real end-of-day data; may be a day or more old' },
  mixed: { label: 'Partly delayed', dot: 'bg-reward', text: 'text-reward-ink', title: 'Some real end-of-day data, the rest demo' },
  demo: { label: 'Demo', dot: 'bg-muted', text: 'text-ink-soft', title: 'Illustrative demo data, not from a live provider' },
}

/** Where a number comes from: Live, Delayed or Demo. Text and dot, never colour alone. */
export function DataStatusBadge({ what, status, className }: { what: string; status: DataStatus; className?: string }) {
  const s = STATUS[status]
  return (
    <span title={s.title} className={cn('inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold', className)}>
      <span className={cn('size-1.5 rounded-full', s.dot)} aria-hidden />
      <span className="text-muted">{what}:</span>
      <span className={s.text}>{s.label}</span>
    </span>
  )
}

const IMPACT: Record<Impact, { glyph: string; cls: string }> = {
  Up: { glyph: '▲', cls: 'bg-accent-soft text-accent-ink ring-accent/30' },
  Down: { glyph: '▼', cls: 'bg-danger-soft text-danger-ink ring-danger/25' },
  Mixed: { glyph: '◆', cls: 'bg-reward-soft text-reward-ink ring-reward/40' },
  Watch: { glyph: '●', cls: 'bg-canvas text-ink-soft ring-line-strong' },
}

export function ImpactChip({ impact, className }: { impact: Impact; className?: string }) {
  const i = IMPACT[impact]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1', i.cls, className)}>
      <span aria-hidden>{i.glyph}</span>
      <span>
        <span className="sr-only">Possible impact: </span>
        {impact}
      </span>
    </span>
  )
}

export function CategoryChip({ category }: { category: NewsCategory }) {
  const c = CATEGORY[category]
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: c.color }}>
      <c.icon className="size-3.5" aria-hidden /> {category}
    </span>
  )
}

/** Generated thumbnail for items without an image: category colour, icon and a quiet chart line. */
export function ThumbArt({ category, className }: { category: NewsCategory; className?: string }) {
  const c = CATEGORY[category]
  return (
    <div className={cn('relative grid place-items-center overflow-hidden', className)} style={{ background: `color-mix(in srgb, ${c.color} 12%, white)` }} aria-hidden>
      <svg viewBox="0 0 80 60" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <path d="M0 46 L14 40 L26 44 L38 30 L50 34 L62 20 L80 24" fill="none" stroke={c.color} strokeOpacity="0.35" strokeWidth="2" />
        <path d="M0 46 L14 40 L26 44 L38 30 L50 34 L62 20 L80 24 L80 60 L0 60 Z" fill={c.color} fillOpacity="0.08" />
      </svg>
      <c.icon className="relative size-6" style={{ color: c.color }} />
    </div>
  )
}

/** Signed percentage with ▲/▼ so direction never relies on colour. */
export function Delta({ pct, className, digits = 2 }: { pct: number; className?: string; digits?: number }) {
  const up = pct > 0
  const flat = pct === 0
  return (
    <span className={cn('tabular font-semibold', flat ? 'text-muted' : up ? 'text-accent-ink' : 'text-danger-ink', className)}>
      <span aria-hidden>{flat ? '' : up ? '▲ ' : '▼ '}</span>
      {flat ? '0.00%' : `${up ? '+' : '−'}${Math.abs(pct).toFixed(digits)}%`}
    </span>
  )
}

/** Reference closes (muted) leading into simulated prices (coloured), drawn in with anime.js. */
export function Sparkline({ reference = [], simulated, className }: { reference?: number[]; simulated: number[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useAnime(
    ref,
    (scope) => {
      if (has(scope, '.spark-sim')) animate(svg.createDrawable('.spark-sim'), { draw: ['0 0', '0 1'], duration: 900, ease: 'inOutQuad' })
    },
    [simulated.length],
  )
  const all = [...reference.slice(0, -1), ...simulated]
  if (all.length < 2) return <div ref={ref} className={cn('h-9', className)} aria-hidden />
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const x = (i: number) => ((i / (all.length - 1)) * 100).toFixed(2)
  const y = (v: number) => (34 - ((v - lo) / (hi - lo || 1)) * 30).toFixed(2)
  const path = (from: number, to: number) => all.slice(from, to + 1).map((v, i) => `${i ? 'L' : 'M'}${x(from + i)},${y(v)}`).join(' ')
  const split = Math.max(reference.length - 1, 0)
  const up = simulated[simulated.length - 1] >= simulated[0]
  const color = simulated.length > 1 ? (up ? 'var(--color-accent)' : 'var(--color-danger)') : 'var(--color-investing)'
  return (
    <div ref={ref} className={cn('h-9', className)} aria-hidden>
      <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="h-full w-full overflow-visible">
        {split > 0 && <path d={path(0, split)} fill="none" stroke="var(--color-line-strong)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
        {simulated.length > 1 && <path className="spark-sim" d={path(split, all.length - 1)} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
        <circle cx={x(all.length - 1)} cy={y(all[all.length - 1])} r="2.2" fill={color} />
      </svg>
    </div>
  )
}

