import { ArrowLeft, Play, Target } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DifficultyBadge } from '@/components/common/badges'
import { KIND_TO_PILLAR, PILLARS, PillarIcon } from '@/components/common/pillars'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api/endpoints'
import type { ResultReward, Session } from '@/lib/api/types'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { errorMessage, useAsync } from '@/lib/useAsync'
import { BudgetSimulator } from './kinds/BudgetSimulator'
import { InvestingSimulator } from './kinds/InvestingSimulator'
import { SafetyChallenge } from './kinds/SafetyChallenge'
import { ReflectionCard } from './ReflectionCard'
import { MoneyLabSimulator } from './kinds/MoneyLabSimulator'
import { SavingsSimulator } from './kinds/SavingsSimulator'
import { ResultHeader } from './shared'

export interface KindProps<S extends Session> {
  session: S
  decide: (type: string, payload: Record<string, unknown>) => Promise<Session | undefined>
  busy: boolean
  error: string | null
}

const PHASES: Record<Session['kind'], { key: string; label: string }[]> = {
  budget: [
    { key: 'allocate', label: 'Plan the budget' },
    { key: 'respond_event', label: 'Handle the surprise' },
    { key: 'done', label: 'See consequences' },
  ],
  savings: [
    { key: 'plan', label: 'Plan savings' },
    { key: 'respond_event', label: 'Handle the surprise' },
    { key: 'done', label: 'See the year' },
  ],
  investing: [
    { key: 'allocate', label: 'Choose a mix' },
    { key: 'respond_event', label: 'React to the market' },
    { key: 'done', label: 'See outcomes' },
  ],
  money_lab: [
    { key: 'plan', label: 'Split the ₹500' },
    { key: 'respond_event', label: 'Handle the surprise' },
    { key: 'done', label: 'See the result' },
  ],
  safety: [
    { key: 'classify', label: 'Judge each message' },
    { key: 'done', label: 'Review' },
  ],
}

function PhaseSteps({ session }: { session: Session }) {
  const phases = PHASES[session.kind]
  const current = phases.findIndex((p) => p.key === session.phase)
  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Simulation steps">
      {phases.map((p, i) => (
        <li key={p.key} className={cn('flex items-center gap-2 text-sm font-semibold', i <= current ? 'text-primary' : 'text-muted')} aria-current={i === current ? 'step' : undefined}>
          <span
            className={cn(
              'inline-flex size-6 items-center justify-center rounded-full text-xs',
              i < current ? 'bg-primary text-white' : i === current ? 'bg-primary-soft text-primary ring-2 ring-primary' : 'bg-line text-muted',
            )}
          >
            {i + 1}
          </span>
          {p.label}
        </li>
      ))}
    </ol>
  )
}

export default function SimulationPage() {
  const { scenarioSlug = '' } = useParams()
  const { t } = useI18n()
  const scenario = useAsync(() => api.content.scenario(scenarioSlug), [scenarioSlug])
  const history = useAsync(() => api.simulations.list(scenarioSlug), [scenarioSlug])
  const [session, setSession] = useState<Session | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setBusy(true)
    setError(null)
    try {
      setSession(await api.simulations.start(scenarioSlug))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function decide(type: string, payload: Record<string, unknown>) {
    if (!session) return undefined
    setBusy(true)
    setError(null)
    try {
      const next = await api.simulations.decide(session.id, type, payload)
      setSession(next)
      if (next.phase !== session.phase) window.scrollTo({ top: 0, behavior: 'smooth' })
      if (next.status === 'completed') history.reload()
      return next
    } catch (err) {
      setError(errorMessage(err))
      return undefined
    } finally {
      setBusy(false)
    }
  }

  if (scenario.error)
    return scenario.error.status === 404 ? (
      <EmptyState title="Simulation not found" action={<Button asChild variant="outline"><Link to="/app/learn">Browse modules</Link></Button>} />
    ) : (
      <ErrorState message={scenario.error.message} onRetry={scenario.reload} />
    )
  if (scenario.loading || !scenario.data) return <LoadingState rows={3} />

  const s = scenario.data
  const pillar = KIND_TO_PILLAR[s.kind]
  const meta = PILLARS[pillar]
  const moduleLink = `/app/learn/${s.module_slug}`
  const completed = (history.data ?? []).filter((h) => h.status === 'completed')

  return (
    <div className="space-y-6">
      <Link to={moduleLink} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> {t(meta.titleKey)}
      </Link>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <PillarIcon pillar={pillar} size={48} />
          <div>
            <h1 className="text-2xl font-extrabold sm:text-[1.7rem]">{s.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              <DifficultyBadge level={s.difficulty} />
              <span>{t('common.fictional')}</span>
            </div>
          </div>
        </div>
        {session && <PhaseSteps session={session} />}
      </header>

      {!session ? (
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-[1.4fr_1fr]">
            <div className="p-6 sm:p-8">
              <p className="text-lg leading-relaxed text-ink">{s.intro}</p>
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-primary-soft/70 p-3 text-sm text-primary-ink">
                <Target className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <strong>Your objective: </strong>
                  {s.objective}
                </span>
              </p>
              {error && (
                <Alert tone="danger" className="mt-4">
                  {error}
                </Alert>
              )}
              <Button size="lg" className="mt-6" onClick={start} loading={busy}>
                <Play /> {completed.length ? 'Start a new attempt' : 'Start simulation'}
              </Button>
            </div>
            <div className="border-t border-line bg-canvas p-6 md:border-l md:border-t-0">
              <h2 className="text-sm font-bold">Your attempts</h2>
              {completed.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No attempts yet. There’s no penalty for mistakes; retrying with a new strategy is part of learning.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {completed.slice(0, 5).map((h) => (
                    <li key={h.id} className="flex justify-between rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-line">
                      <span>Attempt {h.attempt_number}</span>
                      <span className="tabular font-semibold">{h.score}/100</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <>
          {session.status === 'completed' && session.score != null && (
            <ResultHeader
              score={session.score}
              previousBest={session.previous_best}
              attempt={session.attempt_number}
              newAchievements={session.new_achievements}
              rewards={(session.result as { rewards?: ResultReward[] } | null)?.rewards}
              retry={start}
              moduleLink={moduleLink}
              sessionId={session.id}
              title={s.title}
            />
          )}
          {session.kind === 'budget' && <BudgetSimulator key={session.id} session={session} decide={decide} busy={busy} error={error} />}
          {session.kind === 'savings' && <SavingsSimulator key={session.id} session={session} decide={decide} busy={busy} error={error} />}
          {session.kind === 'investing' && <InvestingSimulator key={session.id} session={session} decide={decide} busy={busy} error={error} />}
          {session.kind === 'money_lab' && <MoneyLabSimulator key={session.id} session={session} decide={decide} busy={busy} error={error} />}
          {session.kind === 'safety' && <SafetyChallenge key={session.id} session={session} decide={decide} busy={busy} error={error} />}
          {session.status === 'completed' && <ReflectionCard key={`reflect-${session.id}`} sessionId={session.id} />}
        </>
      )}
    </div>
  )
}
