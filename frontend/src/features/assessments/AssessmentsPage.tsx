import { animate, stagger } from 'animejs'
import { ArrowRight, CheckCircle2, Clock, Flag, GraduationCap, Lock } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PILLARS, PillarIcon } from '@/components/common/pillars'
import { ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { useAnime } from '@/lib/anime'
import { api } from '@/lib/api/endpoints'
import type { AssessmentSummary, Module } from '@/lib/api/types'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAsync } from '@/lib/useAsync'

function ScoreMeter({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Best score ${value}%`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
        <div
          className="as-meter h-full origin-left rounded-full"
          style={{ width: `${value}%`, background: value >= 60 ? 'var(--color-accent)' : 'var(--color-warning)' }}
        />
      </div>
      <span className="font-mono text-xs font-bold">{value}%</span>
    </div>
  )
}

function Row({ a, module }: { a: AssessmentSummary; module?: Module }) {
  const { t } = useI18n()
  const oneShot = a.kind !== 'module'
  const done = a.attempts > 0
  const locked = !a.available
  return (
    <div
      data-card=""
      className={cn(
        'group relative flex flex-col gap-4 rounded-2xl border bg-surface p-5 shadow-[var(--shadow-card)] transition-[transform,box-shadow,border-color] duration-200 sm:flex-row sm:items-center',
        locked ? 'border-dashed border-line-strong' : 'border-line hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--shadow-raised)]',
      )}
    >
      {module ? (
        <PillarIcon pillar={module.pillar} size={46} />
      ) : (
        <span className="inline-flex size-[46px] shrink-0 items-center justify-center rounded-xl bg-[#14123a] text-emerald-300" aria-hidden>
          {a.kind === 'initial' ? <Flag className="size-5" /> : <GraduationCap className="size-5" />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-extrabold">{module ? `${t(PILLARS[module.pillar].titleKey)} quiz` : a.title}</h3>
          {done && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent-ink">
              <CheckCircle2 className="size-3.5" aria-hidden /> {oneShot ? 'Done' : `${a.attempts} attempt${a.attempts > 1 ? 's' : ''}`}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{a.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden /> {a.question_count} questions · about {Math.ceil(a.question_count * 0.5)} {t('common.minutes')}
          </span>
          {done && a.best_score != null && <ScoreMeter value={a.best_score} />}
        </div>
        {locked && a.locked_reason && (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-warning-ink">
            <Lock className="size-3.5" aria-hidden /> {a.locked_reason}
          </p>
        )}
      </div>
      {a.available && (
        <Button asChild variant={done ? 'outline' : 'primary'} className="group/btn">
          <Link to={`/app/assessments/${a.slug}`}>
            {done ? 'Retake' : 'Start'} <ArrowRight className="transition-transform group-hover/btn:translate-x-0.5" />
          </Link>
        </Button>
      )}
    </div>
  )
}

function Stage({ n, title, note, done, children }: { n: number; title: string; note: string; done: boolean; children: ReactNode }) {
  return (
    <section className="relative pl-12 sm:pl-16">
      <span
        className={cn(
          'as-node absolute left-0 top-0 z-10 grid size-9 place-items-center rounded-full border-2 font-mono text-sm font-black sm:size-11',
          done ? 'border-accent bg-accent text-white' : 'border-primary bg-surface text-primary',
        )}
        aria-hidden
      >
        {done ? <CheckCircle2 className="size-5" /> : n}
      </span>
      <div className="mb-3 pt-1 sm:pt-2">
        <h2 className="text-lg font-extrabold">{title}</h2>
        <p className="text-sm text-muted">{note}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export default function AssessmentsPage() {
  const data = useAsync(() => Promise.all([api.assessments.list(), api.content.modules()]), [])
  const ref = useRef<HTMLDivElement>(null)

  useAnime(
    ref,
    () => {
      if (!data.data) return
      animate('.as-line', { scaleY: { from: 0 }, duration: 1600, ease: 'inOutQuart', delay: 200 })
      animate('.as-node', { scale: { from: 0 }, delay: stagger(250, { start: 250 }), duration: 700, ease: 'outBack(2.2)' })
      animate('.as-meter', { scaleX: { from: 0 }, delay: stagger(80, { start: 700 }), duration: 900, ease: 'outExpo' })
    },
    [!!data.data],
  )

  if (data.error) return <ErrorState message={data.error.message} onRetry={data.reload} />
  if (data.loading || !data.data) return <LoadingState rows={4} />
  const [items, modules] = data.data
  const initial = items.find((a) => a.kind === 'initial')
  const post = items.find((a) => a.kind === 'post')
  const quizzes = items.filter((a) => a.kind === 'module')
  const quizzesDone = quizzes.filter((q) => (q.best_score ?? 0) >= 60).length

  return (
    <div ref={ref}>
      <PageHeader
        eyebrow="Checks & quizzes"
        title="Show what you understand"
        description="Every answer comes with an explanation. Your understanding scores count first attempts most, and answers given in under two seconds count less, so take your time."
      />
      <div className="relative space-y-10">
        <span className="as-line absolute bottom-6 left-[17px] top-6 w-0.5 origin-top rounded-full bg-gradient-to-b from-primary via-primary/40 to-line sm:left-[21px]" aria-hidden />
        {initial && (
          <Stage n={1} title="Starting point" note="One attempt, so your starting and final scores compare fairly." done={initial.attempts > 0}>
            <Row a={initial} />
          </Stage>
        )}
        <Stage n={2} title="Module quizzes" note={`${quizzesDone} of ${quizzes.length} passed at 60% or more. Retake as often as you like.`} done={quizzesDone === quizzes.length}>
          {quizzes.map((q) => (
            <Row key={q.slug} a={q} module={modules.find((m) => m.slug === q.module_slug)} />
          ))}
        </Stage>
        {post && (
          <Stage n={3} title="Final check" note="See how far you have come since the starting point." done={post.attempts > 0}>
            <Row a={post} />
          </Stage>
        )}
      </div>
    </div>
  )
}
