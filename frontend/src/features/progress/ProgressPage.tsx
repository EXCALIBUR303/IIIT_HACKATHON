import { ArrowRight, ClipboardCheck, Gamepad2, Info, Sparkles, Target } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AchievementTile } from '@/components/common/badges'
import { Panel } from '@/components/common/panel'
import { PILLAR_ORDER, PILLARS, PillarIcon } from '@/components/common/pillars'
import { ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { AnimatedNumber } from '@/components/motion/AnimatedNumber'
import { Button } from '@/components/ui/button'
import { LEVEL_STYLE, recommendationLink } from '@/features/dashboard/DashboardPage'
import { api } from '@/lib/api/endpoints'
import type { MasteryLevel, Progress } from '@/lib/api/types'
import { relativeDate } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { EASE_OUT, fadeUp, staggerChildren, swap } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useAsync } from '@/lib/useAsync'
import { LearningScoreCard } from './LearningScoreCard'

type Concept = Progress['concepts'][number]

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold">
        <AnimatedNumber value={value} />
        {suffix && <span className="text-base font-bold text-muted">{suffix}</span>}
      </p>
    </div>
  )
}

export default function ProgressPage() {
  const { t } = useI18n()
  const data = useAsync(() => Promise.all([api.progress.me(), api.progress.achievements()]), [])
  if (data.error) return <ErrorState message={data.error.message} onRetry={data.reload} />
  if (data.loading || !data.data) return <LoadingState rows={4} />
  const [p, achievements] = data.data
  const earned = achievements.filter((a) => a.earned)
  const pp = p.pre_post
  const titleOf = (k: string) => p.concepts.find((c) => c.concept === k)?.title ?? k
  const prePostChart = pp?.concepts.map((c) => ({ concept: titleOf(c.concept), Start: Math.round(c.initial * 100), Final: c.post != null ? Math.round(c.post * 100) : undefined }))

  return (
    <div>
      <PageHeader
        eyebrow={t('nav.progress')}
        title="How your understanding is growing"
        description="Understanding is measured from your answers and decisions. Activities finished and badges earned are tracked separately."
        actions={
          <Button asChild>
            <Link to={recommendationLink(p.recommendation)}>
              Next activity <ArrowRight />
            </Link>
          </Button>
        }
      />

      <motion.div variants={staggerChildren(0.07)} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Modules completed" value={p.activity.modules_completed} suffix=" / 4" />
          <Stat label="Simulations completed" value={p.activity.simulations_completed} />
          <Stat label="Checks & quizzes taken" value={p.activity.assessments_completed} />
          <Stat label="Badges earned" value={earned.length} suffix={` / ${achievements.length}`} />
        </motion.div>

        <motion.div variants={fadeUp}>
          <MasteryMap p={p} />
        </motion.div>

        <motion.div variants={fadeUp}>
          <LearningScoreCard />
        </motion.div>

        <motion.div variants={fadeUp} className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <Panel id="prepost-h" kicker="Before and after" title="Starting check vs final check">
            {!pp ? (
              <p className="rounded-xl bg-canvas p-4 text-sm text-muted">
                Take the starting check to set your baseline.{' '}
                <Link to="/app/assessments/initial" className="font-semibold text-primary hover:underline">
                  Start it now
                </Link>
              </p>
            ) : (
              <div className="space-y-4">
                <dl className="grid grid-cols-3 divide-x divide-line rounded-xl border border-line">
                  {[
                    { k: 'Starting check', v: `${pp.initial_score}%` },
                    { k: 'Final check', v: pp.post_score != null ? `${pp.post_score}%` : 'Not yet' },
                    { k: 'Change', v: pp.change != null ? `${pp.change > 0 ? '+' : ''}${pp.change} pts` : '—', tone: pp.change == null ? '' : pp.change > 0 ? 'text-accent-ink' : pp.change < 0 ? 'text-danger-ink' : '' },
                  ].map((x) => (
                    <div key={x.k} className="p-3">
                      <dt className="text-xs font-semibold text-muted">{x.k}</dt>
                      <dd className={cn('mt-0.5 text-lg font-extrabold', x.tone)}>{x.v}</dd>
                    </div>
                  ))}
                </dl>
                {pp.post_score != null && prePostChart && (
                  <div className="h-72" role="img" aria-label="Bar chart of starting versus final check by concept">
                    <ResponsiveContainer>
                      <BarChart data={prePostChart} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                        <CartesianGrid stroke="var(--color-line)" vertical={false} />
                        <XAxis dataKey="concept" angle={-30} textAnchor="end" interval={0} fontSize={11} tickLine={false} height={60} />
                        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={12} width={40} tickLine={false} axisLine={false} />
                        <Tooltip formatter={(v) => `${v}%`} />
                        <Legend verticalAlign="top" />
                        <Bar dataKey="Start" fill="var(--color-line-strong)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Final" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <p className="flex gap-2 text-xs text-muted">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {pp.note}
                </p>
              </div>
            )}
          </Panel>

          <Panel id="focus-h" kicker="From your evidence" title="Strengths and focus areas">
            <div className="space-y-5">
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-accent-ink">
                  <Sparkles className="size-3.5" aria-hidden /> Strengths
                </p>
                {p.strengths.length ? (
                  <ul className="flex flex-wrap gap-2">
                    {p.strengths.map((s) => (
                      <li key={s} className="rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-ink">
                        {s}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Strengths appear after you show consistent understanding of a concept across several answers.</p>
                )}
              </div>
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-warning-ink">
                  <Target className="size-3.5" aria-hidden /> Areas to practise
                </p>
                {p.practice_areas.length ? (
                  <ul className="flex flex-wrap gap-2">
                    {p.practice_areas.map((s) => (
                      <li key={s} className="rounded-full bg-warning-soft px-3 py-1 text-sm font-semibold text-warning-ink">
                        {s}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Nothing flagged right now.</p>
                )}
              </div>
            </div>
          </Panel>
        </motion.div>

        <motion.div variants={fadeUp} className="grid gap-6 lg:grid-cols-[1fr_1.35fr]">
          <Panel id="recent-h" kicker="Latest first" title="Recent activity">
            {p.recent.length === 0 ? (
              <p className="text-sm text-muted">No activity yet.</p>
            ) : (
              <ol className="relative space-y-1">
                <span className="absolute bottom-3 left-[15px] top-3 w-px bg-line" aria-hidden />
                {p.recent.map((r, i) => {
                  const Icon = r.type === 'simulation' ? Gamepad2 : ClipboardCheck
                  return (
                    <li key={i} className="relative flex items-center gap-3 py-2">
                      <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface text-muted" aria-hidden>
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{r.title}</p>
                        <p className="text-xs text-muted">
                          {r.type === 'simulation' ? 'Mission' : 'Check or quiz'} · {relativeDate(r.at)}
                        </p>
                      </div>
                      {r.score != null && (
                        <span className="tabular shrink-0 rounded-lg bg-canvas px-2 py-1 text-sm font-bold">
                          {r.score}
                          <span className="text-xs text-muted">{r.type === 'simulation' ? '/100' : '%'}</span>
                        </span>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </Panel>
          <Panel id="badges-h" kicker={`${earned.length} of ${achievements.length} earned`} title="Badges" color="var(--color-warning)">
            <p className="-mt-2 mb-3 text-sm text-muted">For effort and good habits, separate from understanding scores.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[...earned, ...achievements.filter((a) => !a.earned)].map((a) => (
                <AchievementTile key={a.slug} a={a} />
              ))}
            </div>
          </Panel>
        </motion.div>
      </motion.div>
    </div>
  )
}

const LEGEND: MasteryLevel[] = ['not_started', 'needs_practice', 'developing', 'mastered']

/** Concept tiles: shade, glyph and number together, so colour is never the only signal. */
function tileStyle(c: Concept) {
  if (c.level === 'not_started') return { background: 'var(--color-canvas)' }
  const strength = Math.round(18 + (c.mastery ?? 0) * 42)
  return { background: `color-mix(in srgb, ${LEVEL_STYLE[c.level].bar} ${strength}%, white)` }
}

function MasteryMap({ p }: { p: Progress }) {
  const { t } = useI18n()
  const [sel, setSel] = useState<Concept>(() => p.concepts.find((c) => c.level === 'needs_practice') ?? p.concepts.find((c) => c.level !== 'not_started') ?? p.concepts[0])
  const selModule = p.modules.find((m) => m.pillar === sel?.pillar)
  const next =
    sel?.level === 'mastered'
      ? 'Strong. Keep it fresh with a harder mission in this track.'
      : sel?.level === 'not_started'
        ? 'Not assessed yet. A mission or quiz in this track will show where you stand.'
        : 'Practise this idea in a mission, then check it with the track’s quiz.'

  return (
    <section aria-labelledby="concepts-h" className="rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-5 sm:p-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Concept mastery</p>
          <h2 id="concepts-h" className="mt-1 text-lg font-extrabold">
            What you understand, idea by idea
          </h2>
          <p className="mt-0.5 text-sm text-muted">Select a tile to see the evidence behind it and what to do next.</p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-soft" aria-label="Legend">
          {LEGEND.map((l) => (
            <li key={l} className="inline-flex items-center gap-1.5">
              <span className="grid size-4 place-items-center rounded text-[10px] font-black ring-1 ring-line" style={tileStyle({ level: l, mastery: 0.7 } as Concept)} aria-hidden>
                {LEVEL_STYLE[l].short}
              </span>
              {LEVEL_STYLE[l].label}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid lg:grid-cols-[1.5fr_1fr]">
        <div className="grid grid-cols-1 content-start gap-x-6 gap-y-5 p-5 sm:grid-cols-2 sm:p-6">
          {PILLAR_ORDER.map((pillar) => {
            const m = p.modules.find((x) => x.pillar === pillar)
            const concepts = p.concepts.filter((c) => c.pillar === pillar)
            return (
              <div key={pillar} role="group" aria-label={t(PILLARS[pillar].titleKey)}>
                <div className="mb-2.5 flex items-center gap-2">
                  <PillarIcon pillar={pillar} size={26} />
                  <p className="min-w-0 flex-1 truncate text-xs font-bold">{t(PILLARS[pillar].titleKey)}</p>
                  <span className="font-mono text-[10px] text-muted">{m?.completed ? 'done' : `${Math.round(m?.percent ?? 0)}%`}</span>
                </div>
                <ul className="grid grid-cols-4 gap-1.5">
                  {concepts.map((c) => {
                    const on = sel?.concept === c.concept
                    return (
                      <li key={c.concept}>
                        <button
                          type="button"
                          onClick={() => setSel(c)}
                          onMouseEnter={() => setSel(c)}
                          onFocus={() => setSel(c)}
                          aria-pressed={on}
                          title={`${c.title} · ${LEVEL_STYLE[c.level].label}`}
                          aria-label={`${c.title}: ${LEVEL_STYLE[c.level].label}${c.mastery != null ? `, ${Math.round(c.mastery * 100)} out of 100` : ''}`}
                          className={cn(
                            'relative flex aspect-square w-full flex-col justify-between rounded-lg border p-1.5 text-left transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-px',
                            on ? 'border-ink shadow-[0_0_0_2px_var(--color-ink)]' : 'border-line hover:border-line-strong',
                          )}
                          style={tileStyle(c)}
                        >
                          <span className={cn('text-[10px] font-black leading-none', c.level === 'not_started' ? 'text-muted' : 'text-ink/70')} aria-hidden>
                            {LEVEL_STYLE[c.level].short}
                          </span>
                          <span className={cn('font-mono text-sm font-bold leading-none', c.level === 'not_started' ? 'text-muted' : 'text-ink')} aria-hidden>
                            {c.mastery != null ? Math.round(c.mastery * 100) : '–'}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>

        {sel && (
          <div className="border-t border-line bg-canvas/60 p-5 sm:p-6 lg:border-l lg:border-t-0" aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.div key={sel.concept} variants={swap} initial="hidden" animate="show" exit="exit">
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted">
                  <PillarIcon pillar={sel.pillar} size={20} /> {t(PILLARS[sel.pillar].titleKey)}
                </p>
                <p className="mt-2 text-xl font-extrabold leading-tight">{sel.title}</p>
                <p className={cn('mt-1 text-sm font-bold', LEVEL_STYLE[sel.level].color)}>{LEVEL_STYLE[sel.level].label}</p>
                <div className="mt-4 flex items-end gap-2">
                  {sel.mastery != null ? (
                    <AnimatedNumber value={Math.round(sel.mastery * 100)} className="text-5xl font-black leading-none" />
                  ) : (
                    <span className="text-5xl font-black leading-none text-muted">–</span>
                  )}
                  <span className="pb-1 text-sm text-muted">/ 100 understanding</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
                  <motion.div
                    className="h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(sel.mastery ?? 0) * 100}%` }}
                    transition={{ duration: 0.6, ease: EASE_OUT }}
                    style={{ background: LEVEL_STYLE[sel.level].bar }}
                  />
                </div>
                <p className="mt-3 text-sm text-ink-soft">
                  Based on <strong>{sel.evidence_count}</strong> piece{sel.evidence_count === 1 ? '' : 's'} of evidence from your answers and decisions.
                </p>
                <div className="mt-4 rounded-xl border border-line bg-surface p-3.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">Next step</p>
                  <p className="mt-1 text-sm text-ink-soft">{next}</p>
                  {selModule && (
                    <Link to={`/app/learn/${selModule.slug}`} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                      Open {t(PILLARS[sel.pillar].titleKey)} <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </section>
  )
}
