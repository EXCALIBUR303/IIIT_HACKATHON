import { ArrowRight, Flag, Loader2 } from 'lucide-react'
import { motion } from 'motion/react'
import { AnimatedNumber } from '@/components/motion/AnimatedNumber'
import type { LabSession } from '@/lib/api/types'
import { inrPaise } from '@/lib/format'
import { SPRING_SOFT } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { AnimatedPortfolioChart } from './AnimatedPortfolioChart'

const money = (paise: number) => inrPaise(Math.round(paise))
const signed = (paise: number) => `${paise > 0 ? '+' : paise < 0 ? '−' : ''}${inrPaise(Math.abs(Math.round(paise)))}`

/** The hero: what the portfolio is worth, how today went, how risky it is, and what to do next. */
export function PortfolioSummary({ session, onAdvance, onFinish, busy }: {
  session: LabSession
  onAdvance: () => void
  onFinish: () => void
  busy: boolean
}) {
  const s = session
  const nextLabel = s.scenario.labels[s.step + 1]
  const done = s.status === 'completed'
  return (
    <section aria-labelledby="pq-value" className="relative overflow-hidden rounded-[var(--radius-panel)] bg-navy text-white shadow-[var(--shadow-hero)]">
      <div className="bg-grid-dark absolute inset-0 opacity-60" aria-hidden />
      <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300">
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-teal-200">{s.scenario.kicker}</span>
            {s.scenario.title} · {s.step_label} of {s.scenario.labels.length}
          </p>
          <h2 id="pq-value" className="mt-3 text-sm font-semibold text-slate-300">
            Portfolio value
          </h2>
          <p className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">
            <AnimatedNumber value={s.total_paise} format={money} duration={0.9} />
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <GainChip label={s.scenario.unit === 'year' ? 'This year' : 'Today'} paise={s.day_change_paise} pct={s.day_change_pct} />
            <GainChip label="Since start" paise={s.pnl_paise} pct={s.pnl_pct} />
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <Stat label="Practice cash" value={money(s.cash_paise)} />
            <Stat label="Invested" value={money(s.invested_paise)} />
            <Stat label="Drawdown from peak" value={`${s.drawdown_pct.toFixed(1)}%`} note={`Worst so far ${s.max_drawdown_pct.toFixed(1)}%`} />
            <div>
              <dt className="text-xs text-slate-400">Risk level</dt>
              <dd className="mt-1">
                <RiskMeter score={s.risk.score} level={s.risk.level} />
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">{s.risk.note}</p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {done ? null : s.is_last_step ? (
              <button type="button" onClick={onFinish} className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-navy transition-colors hover:bg-emerald-300">
                <Flag className="size-4" aria-hidden /> Answer the debrief
              </button>
            ) : (
              <button
                type="button"
                onClick={onAdvance}
                disabled={busy}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-navy transition-[background-color,transform] hover:bg-emerald-300 active:scale-[0.98] disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {busy ? 'Market moving…' : `Start ${nextLabel}`}
                {!busy && <ArrowRight className="size-4" aria-hidden />}
              </button>
            )}
            <p className="text-xs text-slate-400">
              {done ? 'Scenario complete.' : s.is_last_step ? 'Last step: explain what happened to finish.' : `${s.actions_left} decisions left this ${s.scenario.unit}.`}
            </p>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-300">
            <span className="font-semibold">Value over the scenario</span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-teal-300" aria-hidden /> You</span>
              <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t border-dashed border-slate-400" aria-hidden /> Whole market</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full border-2 border-reward" aria-hidden /> News</span>
            </span>
          </div>
          <AnimatedPortfolioChart session={s} dark height={250} />
        </div>
      </div>
    </section>
  )
}

function GainChip({ label, paise, pct }: { label: string; paise: number; pct: number }) {
  const up = paise > 0
  const flat = paise === 0
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold', flat ? 'bg-white/10 text-slate-200' : up ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300')}>
      <span className="text-slate-400">{label}</span>
      <span className="tabular">
        <span aria-hidden>{flat ? '' : up ? '▲ ' : '▼ '}</span>
        {signed(paise)} ({pct > 0 ? '+' : ''}
        {pct.toFixed(2)}%)
      </span>
    </span>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 truncate font-bold tabular">{value}</dd>
      {note && <dd className="text-[11px] text-slate-500">{note}</dd>}
    </div>
  )
}

/** Five-segment meter; the level is also written out. */
export function RiskMeter({ score, level, light = false }: { score: number; level: string; light?: boolean }) {
  const filled = Math.max(score > 0 ? 1 : 0, Math.ceil(score / 20))
  const color = level === 'High' ? 'bg-red-400' : level === 'Moderate' ? 'bg-amber-300' : 'bg-teal-300'
  return (
    <div className="flex items-center gap-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-label={`Risk ${level}, ${score} out of 100`}>
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <motion.span
            key={i}
            className={cn('h-2.5 w-3.5 rounded-sm', i < filled ? color : light ? 'bg-line' : 'bg-white/15')}
            initial={false}
            animate={{ opacity: i < filled ? 1 : 0.7 }}
            transition={SPRING_SOFT}
          />
        ))}
      </div>
      <span className={cn('text-sm font-bold', light ? 'text-ink' : 'text-white')}>{level}</span>
    </div>
  )
}
