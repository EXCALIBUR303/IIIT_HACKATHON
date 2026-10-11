import { ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { inrPaise } from '@/lib/format'
import { fadeUp, staggerChildren } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { Delta, Sparkline } from './bits'
import type { WatchRow } from './lib'

export function WatchlistPanel({ rows, onOpen, simulated }: { rows: WatchRow[]; onOpen: (key: string) => void; simulated: boolean }) {
  return (
    <section aria-labelledby="pq-watch" className="flex min-w-0 flex-col rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-2 border-b border-line px-5 pb-3 pt-5">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            <span className="size-1.5 rounded-full bg-investing" aria-hidden /> Watchlist
          </p>
          <h2 id="pq-watch" className="mt-1 text-lg font-extrabold">
            Indian companies
          </h2>
        </div>
        <p className="max-w-[9rem] text-right text-[11px] leading-snug text-muted">{simulated ? 'Grey: reference closes. Colour: simulated days.' : 'Reference closes, last 30 days'}</p>
      </div>
      <motion.ul variants={staggerChildren(0.035)} initial="hidden" animate="show" className="divide-y divide-line">
        {rows.map((r) => (
          <motion.li key={r.key} variants={fadeUp}>
            <button
              type="button"
              onClick={() => onOpen(r.key)}
              className="group grid w-full grid-cols-[minmax(0,1fr)_4.5rem_auto] items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-canvas focus-visible:bg-canvas"
              aria-label={`${r.name}, ${inrPaise(r.price_paise)}, ${r.change_pct >= 0 ? 'up' : 'down'} ${Math.abs(r.change_pct).toFixed(2)}%${r.held ? `, you hold ${r.held}` : ''}. Open details`}
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold">{r.name}</span>
                  {r.in_focus && <span className="shrink-0 rounded bg-primary-soft px-1 text-[10px] font-bold uppercase text-primary-ink">Focus</span>}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="font-mono">{r.ticker}</span> · <span className="truncate">{r.sector}</span>
                  {r.held > 0 && <span className="shrink-0 rounded-full bg-investing-soft px-1.5 font-semibold text-investing">Holding {r.held}</span>}
                </span>
              </span>
              <Sparkline reference={r.reference} simulated={r.simulated} />
              <span className="flex items-center gap-1 text-right">
                <span>
                  <span className="block text-sm font-bold tabular">{inrPaise(r.price_paise)}</span>
                  <Delta pct={r.change_pct} className="text-[11px]" />
                </span>
                <ChevronRight className={cn('size-4 text-line-strong transition-transform group-hover:translate-x-0.5 group-hover:text-muted')} aria-hidden />
              </span>
            </button>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  )
}
