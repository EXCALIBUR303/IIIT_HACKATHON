import { animate, stagger, svg } from 'animejs'
import { ArrowRight, ArrowUpRight, Check, Coins, KeyRound, Lock } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { DomainChip } from '@/components/common/rewards'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api/endpoints'
import type { ScoreComponent } from '@/lib/api/types'
import { countUp, useAnime } from '@/lib/anime'
import { inr, inrPaise, signedPaise } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

/**
 * The three kinds of "number" in RupeeRise are shown in three separate panels on
 * purpose: what you understand (learning), what you earned for it (rewards), and a
 * practice portfolio (fictional). They are never added together.
 */
export function ThreePanels() {
  return (
    <section aria-label="Learning, rewards and practice portfolio" className="grid gap-4 lg:grid-cols-3">
      <LearningPanel />
      <RewardsPanel />
      <PortfolioPanel />
    </section>
  )
}

function PanelShell({
  chip,
  title,
  children,
  accent,
  index,
}: {
  chip: React.ReactNode
  title: string
  children: React.ReactNode
  accent: string
  index: string
}) {
  return (
    <article
      className="dash-rise group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-raised)]"
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[11px] font-bold tracking-widest text-muted">{index}</p>
          <h2 className="text-lg font-extrabold leading-tight">{title}</h2>
        </div>
        {chip}
      </div>
      <div className="mt-4 flex flex-1 flex-col">{children}</div>
    </article>
  )
}

const SEGMENT: Record<ScoreComponent['key'], { label: string; color: string }> = {
  assessments: { label: 'Checks', color: 'var(--color-primary)' },
  decisions: { label: 'Decisions', color: 'var(--color-investing)' },
  reflection: { label: 'Reflection', color: 'var(--color-saving)' },
  safe_behavior: { label: 'Safe choices', color: 'var(--color-safety)' },
}

function ScoreRing({ value }: { value: number }) {
  const r = 42
  const c = 2 * Math.PI * r
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-primary-100)" strokeWidth="9" />
        <circle
          className="score-ring"
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span key={value} className="score-num text-3xl font-extrabold tabular text-primary" data-testid="learning-score">
          {value}
        </span>
        <span className="text-[11px] font-semibold text-muted">of 100</span>
      </div>
    </div>
  )
}

function LearningPanel() {
  const status = useAsync(() => api.learning.status(), [])
  const s = status.data
  const ref = useRef<HTMLDivElement>(null)
  const [focus, setFocus] = useState<ScoreComponent | null>(null)

  useAnime(
    ref,
    () => {
      if (!s) return
      animate(svg.createDrawable('.score-ring'), { draw: ['0 0', `0 1`], duration: 1400, ease: 'outExpo', delay: 200 })
      countUp(ref.current?.querySelector('.score-num') ?? null, s.score.total, String, 1400, 200)
      animate('.seg', { scaleX: { from: 0 }, duration: 700, delay: stagger(90, { start: 400 }), ease: 'outBack(1.4)' })
      animate('.req', { opacity: { from: 0 }, x: { from: -8 }, delay: stagger(70, { start: 600 }), duration: 400 })
    },
    [s],
  )

  return (
    <PanelShell index="01 · UNDERSTANDING" title="Learning" chip={<DomainChip domain="learning" />} accent="var(--color-primary)">
      {!s ? (
        <p className="text-sm text-muted">Loading your learning status…</p>
      ) : (
        <div ref={ref} className="flex flex-1 flex-col">
          <div className="flex items-center gap-4">
            <ScoreRing value={s.score.total} />
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Level {s.level.current || 0} of 5</p>
              <p className="text-xl font-extrabold leading-tight">{s.level.current_title}</p>
              <Link to="/app/progress" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                How it’s worked out <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </div>

          {/* What the score is made of: hover or focus a segment to see its part */}
          <div className="mt-4">
            <div className="flex h-2.5 gap-1 overflow-hidden rounded-full" role="group" aria-label="Score breakdown">
              {s.score.components.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-label={`${SEGMENT[c.key].label}: ${Math.round(c.points)} of ${c.weight} points`}
                  onMouseEnter={() => setFocus(c)}
                  onFocus={() => setFocus(c)}
                  onMouseLeave={() => setFocus(null)}
                  onBlur={() => setFocus(null)}
                  className="seg relative h-full origin-left overflow-hidden rounded-full bg-line transition-opacity hover:opacity-90"
                  style={{ flexGrow: c.weight }}
                >
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(c.points / c.weight) * 100}%`, background: SEGMENT[c.key].color }} />
                </button>
              ))}
            </div>
            <p className="mt-2 min-h-[2.5em] text-xs leading-snug text-muted" aria-live="polite">
              {focus ? (
                <>
                  <span className="font-bold text-ink">
                    {SEGMENT[focus.key].label} · {Math.round(focus.points)}/{focus.weight}
                  </span>{' '}
                  {focus.recovery || focus.explanation}
                </>
              ) : (
                'Checks 40 · Decisions 30 · Reflection 20 · Safe choices 10. Point at a bar to see yours.'
              )}
            </p>
          </div>

          {s.level.next && (
            <div className="mt-auto rounded-xl border border-primary-100 bg-primary-soft/60 p-3 text-sm">
              <p className="font-bold text-primary-ink">
                Next: Level {s.level.next.level} · {s.level.next.title}
              </p>
              <ul className="mt-2 space-y-1.5">
                {s.level.next.requirements.slice(0, 3).map((r) => (
                  <li key={r.key} className="req flex items-start gap-2 text-primary-ink/90">
                    <span
                      className={cn(
                        'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border',
                        r.met ? 'border-accent bg-accent text-white' : 'border-primary/40 bg-white',
                      )}
                    >
                      {r.met && <Check className="size-3" strokeWidth={3} aria-hidden />}
                    </span>
                    <span className={cn(r.met && 'text-muted line-through')}>{r.label}</span>
                    <span className="sr-only">{r.met ? '(done)' : '(to do)'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </PanelShell>
  )
}

function RewardsPanel() {
  const wallet = useAsync(() => api.wallet.get(3), [])
  const w = wallet.data
  const ref = useRef<HTMLDivElement>(null)

  useAnime(
    ref,
    () => {
      if (!w) return
      animate('.coin', { rotateY: { from: -540 }, scale: { from: 0.4 }, duration: 1300, ease: 'outElastic(1, .6)' })
      countUp(ref.current?.querySelector('.bal') ?? null, w.balance, inr, 1300, 150)
      animate('.hist', { opacity: { from: 0 }, y: { from: 10 }, delay: stagger(80, { start: 500 }), duration: 450, ease: 'outQuad' })
    },
    [w],
  )

  function jiggle() {
    animate(ref.current?.querySelector('.coin') ?? [], { rotateY: [0, 360], duration: 800, ease: 'inOutQuad' })
  }

  return (
    <PanelShell index="02 · EARNED" title="Rewards" chip={<DomainChip domain="reward" />} accent="var(--color-reward)">
      {!w ? (
        <p className="text-sm text-muted">Loading your wallet…</p>
      ) : (
        <div ref={ref} className="flex flex-1 flex-col">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={jiggle}
              aria-label="Spin the coin"
              className="coin grid size-16 shrink-0 place-items-center rounded-full border-4 border-reward/50 bg-reward-soft text-reward-ink shadow-[inset_0_-4px_0_rgb(232_163_23/0.25)] [transform-style:preserve-3d]"
            >
              <Coins className="size-7" aria-hidden />
            </button>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-reward-ink">Wallet balance</p>
              <p className="text-4xl font-extrabold tabular leading-none">
                <span key={w.balance} className="bal">
                  {inr(w.balance)}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted">Total earned {inr(w.total_earned)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Earned for showing understanding. Not mastery, and separate from your portfolio.
          </p>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line text-sm">
            {w.history.length === 0 && <li className="hist p-3 text-muted">Finish a mission to earn your first reward.</li>}
            {w.history.map((e) => (
              <li key={e.id} className="hist flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate" title={e.reason}>
                  {e.reason}
                </span>
                <span className={cn('tabular font-bold', e.amount > 0 ? 'text-accent-ink' : 'text-danger-ink')}>
                  {e.amount > 0 ? '+' : '−'}
                  {inr(Math.abs(e.amount))}
                </span>
              </li>
            ))}
          </ul>
          <Button asChild variant="link" className="mt-auto self-start px-0 pt-3">
            <Link to="/app/wallet">
              See reward history <ArrowRight />
            </Link>
          </Button>
        </div>
      )}
    </PanelShell>
  )
}

function PortfolioPanel() {
  const pf = useAsync(() => api.portfolio.get(), [])
  const v = pf.data
  const p = v?.portfolio
  const ref = useRef<HTMLDivElement>(null)

  useAnime(
    ref,
    () => {
      if (!v) return
      if (ref.current?.querySelector('.lock')) animate('.lock', { rotate: [0, -14, 12, -8, 6, 0], duration: 900, delay: 700, ease: 'inOutSine' })
      animate('.pf-fig', { opacity: { from: 0 }, y: { from: 8 }, delay: stagger(90, { start: 300 }), duration: 450 })
    },
    [v],
  )

  return (
    <PanelShell index="03 · PRACTICE" title="Practice portfolio" chip={<DomainChip domain="portfolio" />} accent="var(--color-investing)">
      <div ref={ref} className="flex flex-1 flex-col">
        {!v ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : !v.access.open ? (
          <>
            <div className="flex items-center gap-4">
              <span className="lock grid size-16 shrink-0 place-items-center rounded-2xl border border-investing/30 bg-investing-soft text-investing">
                <Lock className="size-7" aria-hidden />
              </span>
              <p className="text-sm leading-relaxed text-ink-soft">{v.access.reason}</p>
            </div>
            <div className="mt-4 rounded-xl border border-dashed border-investing/40 p-3 text-sm text-ink-soft">
              <p className="flex items-center gap-1.5 font-bold text-investing">
                <KeyRound className="size-4" aria-hidden /> Your key
              </p>
              <p className="mt-1">Complete one investing mission in Learn. The quest opens with ₹10,000 of pretend money.</p>
            </div>
            <Button asChild variant="link" className="mt-auto self-start px-0 pt-3">
              <Link to="/app/portfolio">
                What unlocks it <ArrowRight />
              </Link>
            </Button>
          </>
        ) : !p ? (
          <>
            <p className="text-sm text-ink-soft">Practise with ₹10,000 of pretend money. Nothing here is real or a prediction.</p>
            <Button asChild className="mt-auto" size="sm">
              <Link to="/app/portfolio">
                Start Portfolio Quest <ArrowRight />
              </Link>
            </Button>
          </>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="pf-fig rounded-xl bg-canvas p-3">
                <dt className="text-xs font-bold uppercase tracking-wider text-muted">Practice cash</dt>
                <dd className="mt-1 text-lg font-extrabold tabular">{inrPaise(p.cash_paise)}</dd>
              </div>
              <div className="pf-fig rounded-xl bg-canvas p-3">
                <dt className="text-xs font-bold uppercase tracking-wider text-muted">Invested</dt>
                <dd className="mt-1 text-lg font-extrabold tabular">{inrPaise(p.invested_paise)}</dd>
              </div>
              <div className="pf-fig col-span-2 rounded-xl bg-canvas p-3">
                <dt className="text-xs font-bold uppercase tracking-wider text-muted">
                  Simulated gain / loss · year {p.round} of {p.max_round}
                </dt>
                <dd className={cn('mt-1 text-2xl font-extrabold tabular', p.gain_paise > 0 ? 'text-accent-ink' : p.gain_paise < 0 ? 'text-danger-ink' : '')}>
                  {signedPaise(p.gain_paise)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">
              {v.access.single_company_unlocked
                ? 'Single-company instruments unlocked.'
                : 'Single-company instruments stay locked until you show you understand diversification.'}
            </p>
            <Button asChild variant="link" className="mt-auto self-start px-0 pt-3">
              <Link to="/app/portfolio">
                Open Portfolio Quest <ArrowRight />
              </Link>
            </Button>
          </>
        )}
      </div>
    </PanelShell>
  )
}
