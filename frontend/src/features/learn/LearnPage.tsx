import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PILLARS, PillarIcon } from '@/components/common/pillars'
import { ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import { api } from '@/lib/api/endpoints'
import { useI18n } from '@/lib/i18n'
import { useAsync } from '@/lib/useAsync'

export default function LearnPage() {
  const { t } = useI18n()
  const modules = useAsync(() => api.content.modules(), [])
  const progress = useAsync(() => api.progress.me(), [])

  return (
    <div>
      <PageHeader
        eyebrow={t('nav.learn')}
        title="Four pillars of money skills"
        description="Each module has story-based simulations at three difficulty levels and a short quiz. Complete one simulation and pass the quiz (60%) to finish a module."
      />
      {modules.error && <ErrorState message={modules.error.message} onRetry={modules.reload} />}
      {modules.loading ? (
        <LoadingState rows={4} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {modules.data?.map((m) => {
            const meta = PILLARS[m.pillar]
            const mp = progress.data?.modules.find((x) => x.slug === m.slug)
            return (
              <Card key={m.slug} className="flex flex-col p-6">
                <div className="flex items-center gap-3">
                  <PillarIcon pillar={m.pillar} size={44} />
                  <div>
                    <p className="text-xs font-bold text-muted">Module {m.order}</p>
                    <h2 className="text-lg font-bold">{t(meta.titleKey)}</h2>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{m.summary}</p>
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {m.objectives.slice(0, 3).map((o) => (
                    <li key={o} className="rounded-full bg-canvas px-2.5 py-1 text-xs text-ink-soft ring-1 ring-line">
                      {o}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-5">
                  <div className="mb-1.5 flex justify-between text-xs text-muted">
                    <span>{m.scenarios.length} simulations · 1 quiz</span>
                    <span>{mp?.percent ?? 0}%</span>
                  </div>
                  <ProgressBar value={mp?.percent ?? 0} label={`${m.title} progress`} color={meta.color} />
                  <Link
                    to={`/app/learn/${m.slug}`}
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                  >
                    Open module <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
