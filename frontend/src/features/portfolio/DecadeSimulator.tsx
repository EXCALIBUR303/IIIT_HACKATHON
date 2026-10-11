import { animate, svg } from 'animejs'
import { ArrowRight, ArrowUpRight, Loader2, Lock, MessageCircleQuestion, Minus, Sun, TrendingDown, TrendingUp, Flag, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import { AnimatedNumber } from '@/components/motion/AnimatedNumber'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useAnime } from '@/lib/anime'
import { api } from '@/lib/api/endpoints'
import type { PortfolioEvent, PortfolioView, YearMood, YearSummary } from '@/lib/api/types'
import { inrPaise } from '@/lib/format'
import { SPRING, swap } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { Delta } from './market/bits'
import { newRequestId } from './market/lib'
import { RiskMeter } from './market/PortfolioSummary'

const MOOD: Record<YearMood, { label: string; icon: LucideIcon; node: string; chip: string }> = {
  crash: { label: 'Crash', icon: TrendingDown, node: 'border-danger/50 bg-danger-soft text-danger-ink', chip: 'bg-danger-soft text-danger-ink ring-danger/25' },
  recovery: { label: 'Recovery', icon: ArrowUpRight, node: 'border-investing/50 bg-investing-soft text-investing', chip: 'bg-investing-soft text-investing ring-investing/30' },
  rally: { label: 'Rally', icon: TrendingUp, node: 'border-accent/50 bg-accent-soft text-accent-ink', chip: 'bg-accent-soft text-accent-ink ring-accent/30' },
  sideways: { label: 'Sideways', icon: Minus, node: 'border-line-strong bg-canvas text-ink-soft', chip: 'bg-canvas text-ink-soft ring-line-strong' },
  calm: { label: 'Steady', icon: Sun, node: 'border-primary/40 bg-primary-soft text-primary-ink', chip: 'bg-primary-soft text-primary-ink ring-primary/25' },
}

const RISK_WEIGHT: Record<string, number> = { low: 0.1, medium: 0.4, high: 0.75, very_high: 1 }

const money = (paise: number) => inrPaise(Math.round(paise))

/** The ten-year run as a timeline of market years: mood, what happened, what it did to you, what next. */
export function DecadeSimulator({ view, event, busy, error, run }: {
  view: PortfolioView
  event: PortfolioEvent | null
  busy: boolean
  error: string | null
  run: (a: () => Promise<PortfolioView>) => Promise<PortfolioView | null>
}) {
  const p = view.portfolio!
  const years = p.years ?? []
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<{ round: number; year: number } | null>(null)
  const rid = useRef(newRequestId())
  const selected = picked && picked.round === p.round ? picked.year : p.round
  const summary = selected > 0 ? years[selected - 1] : undefined
  const latest = years[years.length - 1]
  const regime = latest ? MOOD[latest.mood] : null

  const byKey = Object.fromEntries(view.instruments.map((i) => [i.key, i]))
  const riskScore = p.total_paise
    ? Math.round(100 * p.holdings.reduce((s, h) => s + (h.value_paise / p.total_paise) * (RISK_WEIGHT[byKey[h.instrument_key]?.risk_level ?? 'medium'] ?? 0.4), 0))
    : 0
  const riskLevel = riskScore < 25 ? 'Low' : riskScore < 55 ? 'Moderate' : 'High'

  return (
    <section aria-labelledby="decade-title" className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5 sm:p-6">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Run {p.run_number} · Decade Simulator</p>
          <h2 id="decade-title" className="mt-1 text-xl font-extrabold">
            Year {p.round} of {p.max_round}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            Market regime:
            {regime ? (
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ring-1', MOOD[latest.mood].chip)}>
                <regime.icon className="size-3.5" aria-hidden /> {regime.label}
              </span>
            ) : (
              <span className="font-semibold text-ink">Opening, no year has passed yet</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <div>
            <p className="mb-1 text-xs font-semibold text-muted">Risk you hold</p>
            <RiskMeter score={riskScore} level={riskLevel} light />
          </div>
          {p.complete ? (
            <p className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent-soft px-4 text-sm font-bold text-accent-ink">
              <Flag className="size-4" aria-hidden /> Run complete
            </p>
          ) : (
            <Button size="lg" onClick={() => setOpen(true)} disabled={busy} className="min-h-11">
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {busy ? 'Market moving…' : 'Advance one year'}
              {!busy && <ArrowRight />}
            </Button>
          )}
        </div>
      </div>

      <Timeline years={years} round={p.round} max={p.max_round} selected={selected} busy={busy} history={p.history} onPick={(y) => setPicked({ round: p.round, year: y })} />

      <div className="border-t border-line p-5 sm:p-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={selected} variants={swap} initial="hidden" animate="show" exit="exit">
            {summary ? <YearCard y={summary} event={event} isNow={selected === p.round} /> : <OpeningCard cash={p.cash_paise} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Advance one year?"
        description="Prices will change. You can’t go back, but you can reset the run to practise again."
        confirmLabel="Yes, next year"
        busy={busy}
        error={error}
        onConfirm={async () => {
          const out = await run(() => api.portfolio.advance(rid.current))
          if (out) {
            rid.current = newRequestId()
            setOpen(false)
          }
        }}
      />
    </section>
  )
}

function Timeline({ years, round, max, selected, busy, history, onPick }: {
  years: YearSummary[]
  round: number
  max: number
  selected: number
  busy: boolean
  history: { round: number; total_paise: number }[]
  onPick: (year: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const n = max + 1
  // Value sparkline behind the nodes: x lines up with each node centre.
  const totals = history.map((h) => h.total_paise)
  const lo = Math.min(...totals)
  const hi = Math.max(...totals)
  const x = (i: number) => ((i + 0.5) / n) * 100
  const y = (v: number) => (hi === lo ? 14 : 24 - ((v - lo) / (hi - lo)) * 20)
  const line = totals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')

  useAnime(
    ref,
    () => {
      animate(svg.createDrawable('.decade-line'), { draw: ['0 0', '0 1'], duration: 900, ease: 'inOutQuad' })
    },
    [round],
  )

  return (
    <div ref={ref} className="relative px-3 py-5 sm:px-5">
      {totals.length > 1 && (
        <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-5 top-3 hidden h-16 w-[calc(100%-2.5rem)] sm:block" aria-hidden>
          <path d={`${line} L${x(totals.length - 1)},28 L${x(0)},28 Z`} fill="var(--color-investing)" opacity="0.07" />
          <path className="decade-line" d={line} fill="none" stroke="var(--color-investing)" strokeOpacity="0.55" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      )}
      <ol className="relative grid grid-cols-6 gap-y-4 sm:grid-cols-11" aria-label={`Run timeline, year ${round} of ${max}`}>
        {Array.from({ length: n }, (_, i) => {
          const done = i < round
          const now = i === round
          const s = i > 0 ? years[i - 1] : undefined
          const m = s ? MOOD[s.mood] : null
          const Icon = i === 0 ? Flag : m ? m.icon : Lock
          const reachable = i <= round
          const label = i === 0 ? 'Start' : `Y${i}`
          return (
            <li key={i} className="flex justify-center" aria-current={now ? 'step' : undefined}>
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onPick(i)}
                aria-pressed={selected === i}
                aria-label={i === 0 ? 'Opening position' : s ? `${s.title}, portfolio ${s.change_pct >= 0 ? 'up' : 'down'} ${Math.abs(s.change_pct)} percent` : `Year ${i}, not reached yet`}
                className={cn('group relative flex min-h-11 min-w-11 flex-col items-center gap-1.5 rounded-xl px-1 py-1 outline-offset-2 transition-colors', reachable && 'hover:bg-canvas', !reachable && 'cursor-not-allowed')}
              >
                {selected === i && reachable && <motion.span layoutId="decade-selected" className="absolute inset-0 rounded-xl bg-primary-soft ring-1 ring-primary/30" transition={SPRING} />}
                <motion.span
                  layout
                  initial={false}
                  animate={{ scale: now ? 1.12 : 1 }}
                  transition={SPRING}
                  className={cn(
                    'relative grid size-10 place-items-center rounded-full border-2',
                    done && i > 0 && m ? m.node : i === 0 && reachable ? 'border-ink/30 bg-surface text-ink-soft' : now ? 'border-primary bg-surface text-primary' : 'border-dashed border-line-strong bg-canvas text-line-strong',
                    now && busy && 'animate-pulse',
                  )}
                >
                  {now && i > 0 ? <span className="text-xs font-extrabold">{i}</span> : <Icon className="size-4" aria-hidden />}
                  {done && s && Math.abs(s.market_change_pct) >= 10 && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-surface bg-reward" aria-hidden />}
                </motion.span>
                <span className={cn('relative text-[11px] font-bold', reachable ? 'text-ink-soft' : 'text-line-strong')}>{label}</span>
                <span className="relative hidden h-4 text-[10px] font-semibold text-muted lg:block">{m ? m.label : now && i > 0 ? 'Now' : ''}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function YearCard({ y, event, isNow }: { y: YearSummary; event: PortfolioEvent | null; isNow: boolean }) {
  const m = MOOD[y.mood]
  const review = event && event.round === y.round ? event.reflection : null
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ring-1', m.chip)}>
            <m.icon className="size-3.5" aria-hidden /> {m.label}
          </span>
          {Math.abs(y.market_change_pct) >= 10 && <span className="rounded-full bg-reward-soft px-2 py-0.5 text-xs font-bold text-reward-ink">Big move</span>}
          {isNow && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary-ink">Latest year</span>}
        </div>
        <h3 className="mt-2 text-lg font-extrabold leading-snug">{y.title}</h3>
        <p className="mt-1 text-sm text-ink-soft">{y.summary}</p>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <p className="text-xs text-muted">Portfolio before</p>
            <p className="text-base font-bold tabular">{money(y.total_before_paise)}</p>
          </div>
          <ArrowRight className="size-4 text-muted" aria-hidden />
          <div>
            <p className="text-xs text-muted">After this year</p>
            <p className="text-xl font-extrabold tabular">
              <AnimatedNumber value={y.total_after_paise} format={money} />
            </p>
          </div>
          <Delta pct={y.change_pct} digits={1} className="rounded-full bg-canvas px-3 py-1.5 text-sm" />
        </div>

        <p className="mt-4 rounded-xl border border-line bg-canvas p-3 text-sm text-ink-soft">
          <span className="font-semibold text-ink">What it meant for you: </span>
          {y.consequence}
        </p>
        <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-primary-ink">
          <MessageCircleQuestion className="mt-0.5 size-4 shrink-0" aria-hidden /> {y.prompt}
        </p>
      </div>

      <div className="min-w-0 space-y-3">
        <dl className="grid grid-cols-1 gap-2.5 text-sm">
          <Fact label="Market moved">
            <Delta pct={y.market_change_pct} digits={0} />
            <span className="text-xs text-muted"> growth basket</span>
          </Fact>
          <Fact label="Strongest holding type">
            <span className="font-semibold">{y.best.label}</span> <Delta pct={y.best.return_pct} digits={1} />
          </Fact>
          <Fact label="Weakest holding type">
            <span className="font-semibold">{y.worst.label}</span> <Delta pct={y.worst.return_pct} digits={1} />
          </Fact>
        </dl>
        {review && (
          <div role="status" className="rounded-xl border border-investing/30 border-l-4 border-l-investing bg-investing-soft p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-investing">Year review</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-soft">
              {review.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p className="sr-only">the fictional market moved {y.market_change_pct}%</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  )
}

function OpeningCard({ cash }: { cash: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div>
        <h3 className="text-lg font-extrabold">The starting line</h3>
        <p className="mt-1 text-sm text-ink-soft">
          You have {money(cash)} of practice cash and ten fictional years ahead. Trade now at today’s prices, then advance a year to see what the market does to your choices. Each completed year appears on the timeline above, and you can click any of them to look back.
        </p>
        <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-primary-ink">
          <MessageCircleQuestion className="mt-0.5 size-4 shrink-0" aria-hidden /> What would you hold if the market fell next year?
        </p>
      </div>
      <ul className="space-y-2 text-sm text-ink-soft">
        <li className="rounded-xl border border-line px-3 py-2.5">Steady things barely move. Growth baskets swing the most.</li>
        <li className="rounded-xl border border-line px-3 py-2.5">Falls are normal. What matters is whether you needed the money soon.</li>
        <li className="rounded-xl border border-line px-3 py-2.5">You can reset at any time to try a different strategy.</li>
      </ul>
    </div>
  )
}

