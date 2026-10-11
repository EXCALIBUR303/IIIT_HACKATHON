import { PieChart } from 'lucide-react'
import { motion } from 'motion/react'
import type { LabSession } from '@/lib/api/types'
import { inrPaise } from '@/lib/format'
import { EASE_OUT } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { Delta } from './bits'

const SECTOR_COLORS = ['#0e7490', '#4338ca', '#7c3aed', '#b45309', '#047857', '#be185d', '#0369a1']

const signedMoney = (paise: number) => `${paise > 0 ? '▲ +' : paise < 0 ? '▼ −' : ''}${inrPaise(Math.abs(paise))}`

export function HoldingsTable({ session, onOpen }: { session: LabSession; onOpen: (key: string) => void }) {
  const rows = session.holdings
  const alloc = session.allocation
  return (
    <section aria-labelledby="pq-holdings" className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            <span className="size-1.5 rounded-full bg-investing" aria-hidden /> Holdings
          </p>
          <h2 id="pq-holdings" className="mt-1 text-lg font-extrabold">
            What you own
          </h2>
        </div>
        <p className="text-xs text-muted">Single-company limit: {session.max_weight_pct}% of the portfolio</p>
      </div>

      <div className="px-5 pb-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
          <PieChart className="size-3.5" aria-hidden /> Sector mix
        </p>
        <div className="flex h-3 overflow-hidden rounded-full bg-line" role="img" aria-label={`Sector mix: ${alloc.map((a) => `${a.label} ${a.pct}%`).join(', ')}`}>
          {alloc.map((a, i) => (
            <motion.span
              key={a.label}
              className="h-full"
              style={{ background: a.label === 'Cash' ? 'var(--color-line-strong)' : SECTOR_COLORS[i % SECTOR_COLORS.length] }}
              initial={{ width: 0 }}
              animate={{ width: `${a.pct}%` }}
              transition={{ duration: 0.6, ease: EASE_OUT }}
            />
          ))}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
          {alloc.map((a, i) => (
            <li key={a.label} className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ background: a.label === 'Cash' ? 'var(--color-line-strong)' : SECTOR_COLORS[i % SECTOR_COLORS.length] }} aria-hidden />
              {a.label} <span className="font-semibold tabular text-ink">{a.pct}%</span>
            </li>
          ))}
        </ul>
      </div>

      {rows.length === 0 ? (
        <p className="border-t border-line px-5 py-6 text-sm text-ink-soft">You hold only practice cash. Open a company from the watchlist to buy, or log a hold while you watch the news.</p>
      ) : (
        <div className="relative overflow-x-auto border-t border-line">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Your simulated holdings</caption>
            <thead className="text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-semibold">Company</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Qty</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Avg price</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Current</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">{session.scenario.unit === 'year' ? 'Year' : 'Day'} change</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Total P/L</th>
                <th scope="col" className="px-5 py-2.5 text-right font-semibold">Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular">
              {rows.map((r) => (
                <tr key={r.key} className="transition-colors hover:bg-canvas">
                  <th scope="row" className="px-5 py-3 font-semibold">
                    <button type="button" onClick={() => onOpen(r.key)} className="text-left hover:text-primary hover:underline">
                      {r.name}
                    </button>
                    <span className="block text-[11px] font-normal text-muted">{r.sector}</span>
                  </th>
                  <td className="px-3 py-3 text-right">{r.quantity}</td>
                  <td className="px-3 py-3 text-right">{inrPaise(r.avg_cost_paise)}</td>
                  <td className="px-3 py-3 text-right font-semibold">{inrPaise(r.price_paise)}</td>
                  <td className="px-3 py-3 text-right">
                    <Delta pct={r.day_change_pct} />
                  </td>
                  <td className={cn('px-3 py-3 text-right font-semibold', r.pnl_paise > 0 ? 'text-accent-ink' : r.pnl_paise < 0 ? 'text-danger-ink' : '')}>
                    {signedMoney(r.pnl_paise)}
                    <span className="block text-[11px] font-normal">{r.pnl_pct > 0 ? '+' : ''}{r.pnl_pct.toFixed(2)}%</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className={cn(r.weight_pct > session.max_weight_pct && 'font-bold text-danger-ink')}>{r.weight_pct}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
