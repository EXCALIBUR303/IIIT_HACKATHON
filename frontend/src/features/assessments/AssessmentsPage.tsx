import { CheckCircle2, ClipboardCheck, Flag, GraduationCap, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PILLARS, PillarIcon } from '@/components/common/pillars'
import { ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api/endpoints'
import type { AssessmentSummary, Module } from '@/lib/api/types'
import { useI18n } from '@/lib/i18n'
import { useAsync } from '@/lib/useAsync'

function Row({ a, module }: { a: AssessmentSummary; module?: Module }) {
  const { t } = useI18n()
  const oneShot = a.kind !== 'module'
  const done = a.attempts > 0
  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      {module ? (
        <PillarIcon pillar={module.pillar} size={44} />
      ) : (
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary" aria-hidden>
          {a.kind === 'initial' ? <Flag className="size-5" /> : <GraduationCap className="size-5" />}
        </span>
      )}
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">{module ? `${t(PILLARS[module.pillar].titleKey)} quiz` : a.title}</h3>
          {done && (
            <Badge tone="success">
              <CheckCircle2 /> {oneShot ? `Done · ${a.best_score}%` : `Best ${a.best_score}%`}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-ink-soft">{a.description}</p>
        <p className="mt-1 text-xs text-muted">
          {a.question_count} questions · about {Math.ceil(a.question_count * 0.5)} {t('common.minutes')}
          {!oneShot && a.attempts > 0 && ` · ${a.attempts} attempt${a.attempts > 1 ? 's' : ''}`}
        </p>
        {!a.available && a.locked_reason && (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning-ink">
            <Lock className="size-3.5" aria-hidden /> {a.locked_reason}
          </p>
        )}
      </div>
      {a.available && (
        <Button asChild variant={done ? 'outline' : 'primary'}>
          <Link to={`/app/assessments/${a.slug}`}>
            <ClipboardCheck /> {done ? 'Retake' : 'Start'}
          </Link>
        </Button>
      )}
    </Card>
  )
}

export default function AssessmentsPage() {
  const data = useAsync(() => Promise.all([api.assessments.list(), api.content.modules()]), [])
  if (data.error) return <ErrorState message={data.error.message} onRetry={data.reload} />
  if (data.loading || !data.data) return <LoadingState rows={4} />
  const [items, modules] = data.data
  const initial = items.find((a) => a.kind === 'initial')
  const post = items.find((a) => a.kind === 'post')
  const quizzes = items.filter((a) => a.kind === 'module')
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Checks & quizzes"
        title="Show what you understand"
        description="Every answer comes with an explanation. Your understanding scores count first attempts most, and answers given in under two seconds count less, so take your time."
      />
      {initial && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">1. Starting point</h2>
          <Row a={initial} />
        </section>
      )}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">2. Module quizzes</h2>
        {quizzes.map((q) => (
          <Row key={q.slug} a={q} module={modules.find((m) => m.slug === q.module_slug)} />
        ))}
      </section>
      {post && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">3. Final check</h2>
          <Row a={post} />
        </section>
      )}
    </div>
  )
}
