import { CheckCircle2, Circle, Lock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import { api } from '@/lib/api/endpoints'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

const TITLES = {
  assessments: 'Quizzes',
  decisions: 'Mission decisions',
  reflection: 'Explaining your choices',
  safe_behavior: 'Safe financial behaviour',
} as const

/** Transparent breakdown of the learning score and the level checklist, with a recovery tip for every gap. */
export function LearningScoreCard() {
  const status = useAsync(() => api.learning.status(), [])
  const s = status.data
  if (!s) return null
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>
            Learning score: <span className="tabular text-primary">{s.score.total}</span>/100
          </CardTitle>
          <CardDescription>{s.score.note}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {s.score.components.map((c) => (
            <div key={c.key}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold">
                  {TITLES[c.key]} <span className="font-normal text-muted">({c.weight}% of the score)</span>
                </span>
                <span className="tabular font-bold">
                  {c.points}/{c.weight}
                </span>
              </div>
              <ProgressBar value={c.score} label={`${TITLES[c.key]} ${c.score} out of 100`} className="mt-1.5" />
              <p className="mt-1 text-xs text-muted">{c.explanation}</p>
              {c.score < 100 && <p className="text-xs font-medium text-primary-ink">To improve: {c.recovery}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            Level {s.level.current || 0}: {s.level.current_title}
          </CardTitle>
          <CardDescription>Levels open when you show understanding. Money, rewards and trading never unlock a level.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {s.level.levels.map((lv) => (
              <li key={lv.level} className={cn('rounded-xl border p-3', lv.unlocked ? 'border-accent/40 bg-accent-soft/60' : 'border-line')}>
                <p className="flex items-center gap-2 text-sm font-bold">
                  {lv.unlocked ? <CheckCircle2 className="size-4 text-accent-ink" aria-hidden /> : <Lock className="size-4 text-muted" aria-hidden />}
                  Level {lv.level}: {lv.title}
                  <span className="sr-only">{lv.unlocked ? ' (unlocked)' : ' (locked)'}</span>
                </p>
                {!lv.unlocked && (
                  <ul className="mt-2 space-y-1 text-xs text-ink-soft">
                    {lv.requirements.map((r) => (
                      <li key={r.key} className="flex items-start gap-1.5">
                        {r.met ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-accent-ink" aria-hidden /> : <Circle className="mt-0.5 size-3.5 shrink-0 text-line-strong" aria-hidden />}
                        <span className={r.met ? 'line-through opacity-70' : ''}>{r.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
