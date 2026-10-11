import { ChevronDown, ExternalLink } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { apiAsset } from '@/lib/api/client'
import type { LabEvent, NewsCategory, NewsFeed, NewsItem } from '@/lib/api/types'
import { EASE_OUT, SPRING } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { CategoryChip, DataStatusBadge, ImpactChip, ThumbArt } from './bits'
import { timeAgo } from './lib'

const CATEGORIES: NewsCategory[] = ['Earnings', 'Policy', 'Sector', 'Global', 'Company', 'Macro']

interface FeedItem {
  id: string
  title: string
  snippet: string
  source: string
  when: string
  url: string | null
  image_url: string | null
  category: NewsCategory
  impact: NewsItem['impact']
  why: string
  affected: string[]
  tag: string
  scenario: boolean
}

/** Scenario events first (they drive this run), then live or demo market news. */
export function MarketNewsFeed({ feed, events, names, onOpen, className, wide = false }: {
  wide?: boolean
  feed: NewsFeed | undefined
  events: LabEvent[]
  names: Record<string, string>
  onOpen: (key: string) => void
  className?: string
}) {
  const [filter, setFilter] = useState<NewsCategory | 'All'>('All')
  const items = useMemo<FeedItem[]>(() => {
    const fromEvents = [...events].reverse().map((e) => ({
      id: `ev-${e.step}-${e.headline}`,
      title: e.headline,
      snippet: e.body,
      source: 'Scenario event',
      when: e.label,
      url: null,
      image_url: null,
      category: e.category,
      impact: e.impact,
      why: e.why + (e.after ? ` What happened next: ${e.after}` : ''),
      affected: e.affected.length > 4 ? [] : e.affected,
      tag: 'Fictional · scenario',
      scenario: true,
    }))
    const fromFeed = (feed?.items ?? []).map((n) => ({
      id: n.id,
      title: n.title,
      snippet: n.snippet,
      source: n.source,
      when: timeAgo(n.published_at),
      url: n.url,
      image_url: n.image_url,
      category: n.category,
      impact: n.impact,
      why: n.why,
      affected: n.affected,
      tag: n.is_demo ? 'Demo explainer' : 'Market news',
      scenario: false,
    }))
    return [...fromEvents, ...fromFeed]
  }, [events, feed])
  const shown = filter === 'All' ? items : items.filter((i) => i.category === filter)
  const present = new Set(items.map((i) => i.category))

  return (
    <section aria-labelledby="pq-news" className={cn('flex min-w-0 flex-col rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--shadow-card)]', className)}>
      <div className="px-5 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              <span className="size-1.5 rounded-full bg-reward" aria-hidden /> Market news
            </p>
            <h2 id="pq-news" className="mt-1 text-lg font-extrabold">
              What could move prices
            </h2>
          </div>
          {feed && <DataStatusBadge what="News" status={feed.status} />}
        </div>
        <div role="group" aria-label="Filter news by category" className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1">
          {(['All', ...CATEGORIES] as const).map((c) => {
            const on = filter === c
            const empty = c !== 'All' && !present.has(c)
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                disabled={empty}
                onClick={() => setFilter(c)}
                className={cn('relative shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-35', on ? 'text-white' : 'text-ink-soft hover:bg-canvas')}
              >
                {on && <motion.span layoutId="news-filter" className="absolute inset-0 rounded-full bg-ink" transition={SPRING} />}
                <span className="relative">{c}</span>
              </button>
            )
          })}
        </div>
      </div>
      <ul className={cn('mt-2 flex-1', wide ? 'grid border-t border-line md:grid-cols-2 [&>li]:border-b [&>li]:border-line md:[&>li:nth-child(odd)]:border-r' : 'divide-y divide-line')}>
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((n) => (
            <motion.li key={n.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE_OUT }}>
              <NewsRow item={n} names={names} onOpen={onOpen} />
            </motion.li>
          ))}
        </AnimatePresence>
        {shown.length === 0 && <li className="px-5 py-6 text-sm text-muted">No {filter.toLowerCase()} news right now.</li>}
      </ul>
      {feed && <p className="border-t border-line px-5 py-3 text-[11px] leading-relaxed text-muted">{feed.note}</p>}
    </section>
  )
}

function NewsRow({ item: n, names, onOpen }: { item: FeedItem; names: Record<string, string>; onOpen: (key: string) => void }) {
  const [open, setOpen] = useState(false)
  const [imgOk, setImgOk] = useState(true)
  const id = `why-${n.id.replace(/[^a-z0-9-]/gi, '')}`
  return (
    <article className="px-5 py-4">
      <div className="flex gap-3">
        {n.image_url && imgOk ? (
          <img src={apiAsset(n.image_url)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgOk(false)} className="size-16 shrink-0 rounded-xl border border-line object-cover" />
        ) : (
          <ThumbArt category={n.category} className="size-16 shrink-0 rounded-xl border border-line" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <CategoryChip category={n.category} />
            <span className={cn('rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wider', n.scenario ? 'bg-reward-soft text-reward-ink' : n.tag === 'Demo explainer' ? 'bg-canvas text-ink-soft' : 'bg-investing-soft text-investing')}>{n.tag}</span>
          </div>
          <h3 className="mt-1 text-sm font-bold leading-snug">{n.title}</h3>
          <p className="mt-0.5 text-[11px] text-muted">
            {n.source}
            {n.when && ` · ${n.when}`}
          </p>
        </div>
      </div>
      {n.snippet && <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{n.snippet}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <ImpactChip impact={n.impact} />
        {n.affected.slice(0, 3).map((k) => (
          <button key={k} type="button" onClick={() => onOpen(k)} className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-soft hover:border-primary hover:text-primary">
            {names[k] ?? k}
          </button>
        ))}
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-semibold text-primary hover:bg-primary-soft">
          Why this matters <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: EASE_OUT }} className="overflow-hidden">
            <p className="mt-2 rounded-xl bg-canvas p-3 text-sm text-ink-soft">{n.why}</p>
          </motion.div>
        )}
      </AnimatePresence>
      {n.url && (
        <a href={n.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-primary">
          Read at {n.source} <ExternalLink className="size-3" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </article>
  )
}
