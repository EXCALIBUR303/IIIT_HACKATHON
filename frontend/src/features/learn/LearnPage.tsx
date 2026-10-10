import { ArrowRight, Check, ChevronDown, Gamepad2, ListChecks, Lock, Target } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DifficultyBadge } from '@/components/common/badges'
import { PILLARS, PillarIcon } from '@/components/common/pillars'
import { ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { ProgressRing } from '@/components/motion/ProgressRing'
import { api } from '@/lib/api/endpoints'
import type { Module, Progress } from '@/lib/api/types'
import { useI18n } from '@/lib/i18n'
import { EASE_OUT, fadeUp, staggerChildren } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useAsync } from '@/lib/useAsync'

type ModuleProgress = Progress['modules'][number]

function statusOf(mp?: ModuleProgress) {
  if (mp?.completed) return { label: 'Complete', cta: 'Review', tone: 'text-accent-ink bg-accent-soft' }
  if (mp && mp.percent > 0) return { label: 'In progress', cta: 'Continue', tone: 'text-primary-ink bg-primary-soft' }
  return { label: 'Not started', cta: 'Start', tone: 'text-muted bg-canvas' }
}

/** What finishing a module takes, as a checklist the student can read at a glance. */
function Requirements({ m, mp }: { m: Module; mp?: ModuleProgress }) {
  const passed = (mp?.quiz_best ?? 0) >= 60
  const rows = [
    { done: !!mp?.simulation_done, text: 'Finish one mission' },
    { done: passed, text: m.quiz_slug ? `Pass the quiz with 60% or more${mp?.quiz_best != null ? ` (best ${mp.quiz_best}%)` : ''}` : 'No quiz in this module' },
  ]
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.text} className="flex items-start gap-2 text-sm">
          <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border', r.done ? 'border-accent bg-accent text-white' : 'border-line-strong bg-surface')}>
            {r.done && <Check className="size-3" strokeWidth={3} aria-hidden />}
          </span>
          <span className={cn(r.done ? 'text-muted' : 'text-ink-soft')}>{r.text}</span>
          <span className="sr-only">{r.done ? '(done)' : '(to do)'}</span>
        </li>
      ))}
    </ul>
  )
}

function TrackDetail({ m, mp, color }: { m: Module; mp?: ModuleProgress; color: string }) {
  const quizOpen = !!mp?.simulation_done
  return (
    <div className="grid gap-6 border-t border-line p-5 sm:p-6 md:grid-cols-3">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          <Target className="size-3.5" aria-hidden /> You will be able to
        </p>
        <ul className="space-y-2">
          {m.objectives.map((o) => (
            <li key={o} className="flex gap-2 text-sm text-ink-soft">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
              {o}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          <Gamepad2 className="size-3.5" aria-hidden /> Missions
        </p>
        <ul className="space-y-1.5">
          {m.scenarios.map((s) => (
            <li key={s.slug}>
              <Link to={`/app/play/${s.slug}`} className="group flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:border-line-strong hover:bg-canvas">
                <span className="min-w-0 truncate font-semibold">{s.title}</span>
                <DifficultyBadge level={s.difficulty} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          <ListChecks className="size-3.5" aria-hidden /> To complete
        </p>
        <Requirements m={m} mp={mp} />
        {m.quiz_slug &&
          (quizOpen ? (
            <Link to={`/app/assessments/${m.quiz_slug}`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              {mp?.quiz_best != null ? 'Retake the quiz' : 'Take the quiz'} <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Lock className="size-3.5" aria-hidden /> The quiz opens after a mission.
            </p>
          ))}
      </div>
    </div>
  )
}

function Track({ m, mp, open, onToggle, index, total }: { m: Module; mp?: ModuleProgress; open: boolean; onToggle: () => void; index: number; total: number }) {
  const { t } = useI18n()
  const meta = PILLARS[m.pillar]
  const pct = Math.round(mp?.percent ?? 0)
  const status = statusOf(mp)
  const panelId = `track-${m.slug}`
  return (
    <motion.li variants={fadeUp} className="relative pl-12 sm:pl-16">
      {/* Node on the path */}
      <span
        className={cn(
          'absolute left-0 top-6 z-10 grid size-9 place-items-center rounded-full border-2 bg-surface font-mono text-sm font-extrabold sm:left-2',
          mp?.completed ? 'border-accent bg-accent text-white' : 'border-line-strong text-ink-soft',
        )}
        style={!mp?.completed && pct > 0 ? { borderColor: meta.color, color: meta.color } : undefined}
        aria-hidden
      >
        {mp?.completed ? <Check className="size-4" strokeWidth={3} /> : index + 1}
      </span>
      {index < total - 1 && <span className="absolute bottom-[-1.5rem] left-[17px] top-[3.75rem] w-0.5 bg-line sm:left-[25px]" aria-hidden />}

      <article className={cn('lift overflow-hidden rounded-[var(--radius-panel)] border bg-surface shadow-[var(--shadow-card)]', open ? 'border-line-strong' : 'border-line')}>
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <span className="absolute inset-y-0 left-0 w-1" style={{ background: meta.color }} aria-hidden />
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <PillarIcon pillar={m.pillar} size={46} />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
                Module {m.order}
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] normal-case tracking-normal', status.tone)}>{status.label}</span>
              </p>
              <h2 className="mt-1 text-xl font-extrabold leading-tight">{t(meta.titleKey)}</h2>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-soft">{m.summary}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4 sm:gap-5">
            <ProgressRing value={pct} size={58} stroke={5} color={meta.color} label={`${t(meta.titleKey)} progress`} delay={0.2 + index * 0.08} />
            <div className="flex flex-col gap-2">
              <Link to={`/app/learn/${m.slug}`} className="group inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-accent-ink px-4 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-[#065f46] active:scale-[0.98]">
                {status.cta} <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                aria-controls={panelId}
                className="inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                What’s inside <ChevronDown className={cn('size-3.5 transition-transform duration-200', open && 'rotate-180')} aria-hidden />
              </button>
            </div>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id={panelId}
              key="detail"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: EASE_OUT }}
              className="overflow-hidden"
            >
              <TrackDetail m={m} mp={mp} color={meta.color} />
            </motion.div>
          )}
        </AnimatePresence>
      </article>
    </motion.li>
  )
}

export default function LearnPage() {
  const { t } = useI18n()
  const modules = useAsync(() => api.content.modules(), [])
  const progress = useAsync(() => api.progress.me(), [])
  const [openSlug, setOpenSlug] = useState<string | null | undefined>(undefined)

  const list = modules.data ?? []
  const done = progress.data?.modules.filter((m) => m.completed).length ?? 0
  // Open the first unfinished track by default, so the page starts on "what next".
  const firstOpen = list.find((m) => !progress.data?.modules.find((x) => x.slug === m.slug)?.completed)?.slug ?? null
  const current = openSlug === undefined ? firstOpen : openSlug

  return (
    <div>
      <PageHeader
        eyebrow={t('nav.learn')}
        title="Four tracks of money skills"
        description="Each track has story missions at three levels and a short quiz. Finish one mission and pass the quiz (60%) to complete it."
        actions={
          progress.data && (
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-[var(--shadow-card)]">
              <ProgressRing value={(done / 4) * 100} size={40} stroke={4} color="var(--color-accent)" label="Tracks complete">
                <span className="font-mono text-[11px] font-bold">{done}/4</span>
              </ProgressRing>
              <span className="text-sm font-semibold leading-tight">
                tracks
                <br />
                complete
              </span>
            </div>
          )
        }
      />
      {modules.error && <ErrorState message={modules.error.message} onRetry={modules.reload} />}
      {modules.loading ? (
        <LoadingState rows={4} />
      ) : (
        <motion.ol variants={staggerChildren(0.07)} initial="hidden" animate="show" className="space-y-6">
          {list.map((m, i) => (
            <Track
              key={m.slug}
              m={m}
              mp={progress.data?.modules.find((x) => x.slug === m.slug)}
              index={i}
              total={list.length}
              open={current === m.slug}
              onToggle={() => setOpenSlug(current === m.slug ? null : m.slug)}
            />
          ))}
        </motion.ol>
      )}
    </div>
  )
}
