import { AlertTriangle, Copy, Info, Plus, RefreshCw, Users } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PILLARS } from '@/components/common/pillars'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/form'
import { ProgressBar } from '@/components/ui/progress'
import { StatTile } from '@/features/simulations/shared'
import { api } from '@/lib/api/endpoints'
import type { CohortOverview } from '@/lib/api/types'
import { useAuth } from '@/lib/auth'
import { relativeDate } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { errorMessage, useAsync } from '@/lib/useAsync'

function masteryColor(v: number | null) {
  if (v == null) return 'var(--color-line-strong)'
  if (v < 0.5) return 'var(--color-danger)'
  if (v < 0.8) return 'var(--color-warning)'
  return 'var(--color-accent)'
}

function CreateCohort({ onCreated }: { onCreated: (id: number) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const c = await api.educator.createCohort(name.trim())
      setName('')
      onCreated(c.id)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Field label="New class name" error={error}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Class 12-B, Saturday batch" maxLength={80} />}
        </Field>
      </div>
      <Button type="submit" loading={busy} disabled={name.trim().length < 2}>
        <Plus /> Create class
      </Button>
    </form>
  )
}

function Overview({ data }: { data: CohortOverview }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const n = data.student_count
  const conceptChart = data.concepts
    .filter((c) => c.avg_mastery != null)
    .map((c) => ({ name: c.title, value: Math.round((c.avg_mastery ?? 0) * 100), raw: c.avg_mastery }))

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted">Students join with this class code</p>
          <p className="mt-1 font-mono text-2xl font-extrabold tracking-[0.2em] text-primary" data-testid="join-code">{data.cohort.join_code}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(data.cohort.join_code).then(() => setCopied(true))
          }}
        >
          <Copy /> {copied ? 'Copied' : 'Copy code'}
        </Button>
      </Card>

      {n === 0 ? (
        <EmptyState title="No students yet">
          Share the class code. Students enter it when they sign up, or later under Settings → Join a class.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Students" value={n} />
            <StatTile label="Finished onboarding" value={`${data.participation.onboarded}/${n}`} />
            <StatTile label="Started learning" value={`${data.participation.started}/${n}`} />
            <StatTile label="Active in last 7 days" value={`${data.participation.active_7d}/${n}`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Module completion</CardTitle>
                <CardDescription>Completed = one simulation + quiz passed (60%)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.modules.map((m) => (
                  <div key={m.slug}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{t(PILLARS[m.pillar].titleKey)}</span>
                      <span className="tabular text-muted">
                        {m.completed} done · {m.started} started
                      </span>
                    </div>
                    <ProgressBar value={(m.completed / n) * 100} label={`${m.title} completion`} className="mt-1.5" color={PILLARS[m.pillar].color} />
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Starting vs final check</CardTitle>
                <CardDescription>{data.assessment.note}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  <StatTile label={`Starting avg (${data.assessment.initial_count ?? 0})`} value={data.assessment.initial_avg != null ? `${data.assessment.initial_avg}%` : '—'} />
                  <StatTile label={`Final avg (${data.assessment.post_count ?? 0})`} value={data.assessment.post_avg != null ? `${data.assessment.post_avg}%` : '—'} />
                  <StatTile
                    label={`Avg change (${data.assessment.paired} paired)`}
                    value={data.assessment.avg_change != null ? `${data.assessment.avg_change > 0 ? '+' : ''}${data.assessment.avg_change}` : '—'}
                    tone={data.assessment.avg_change != null && data.assessment.avg_change > 0 ? 'good' : 'neutral'}
                  />
                </div>
                {data.assessment.paired < 5 && (
                  <p className="mt-3 flex gap-2 text-xs text-muted">
                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    Fewer than 5 students have taken both checks, so treat the change as early signal, not evidence.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Concept-level understanding</CardTitle>
              <CardDescription>Average mastery among students with evidence for each concept</CardDescription>
            </CardHeader>
            <CardContent>
              {conceptChart.length === 0 ? (
                <p className="text-sm text-muted">No assessment evidence yet.</p>
              ) : (
                <div style={{ height: Math.max(200, conceptChart.length * 30) }} role="img" aria-label={conceptChart.map((c) => `${c.name} ${c.value}%`).join(', ')}>
                  <ResponsiveContainer>
                    <BarChart data={conceptChart} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <CartesianGrid stroke="var(--color-line)" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={11} />
                      <YAxis type="category" dataKey="name" width={190} fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Bar dataKey="value" name="Avg mastery" radius={[0, 6, 6, 0]}>
                        {conceptChart.map((c) => (
                          <Cell key={c.name} fill={masteryColor(c.raw)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-warning" aria-hidden /> Topics needing support
                </CardTitle>
                <CardDescription>Average mastery below 60%</CardDescription>
              </CardHeader>
              <CardContent>
                {data.support_topics.length === 0 ? (
                  <p className="text-sm text-muted">No topics below 60% right now.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.support_topics.map((s) => (
                      <li key={s.concept} className="flex items-center justify-between rounded-xl bg-warning-soft/60 px-3 py-2 text-sm">
                        <span className="font-medium">{s.title}</span>
                        <span className="text-warning-ink">
                          {Math.round((s.avg_mastery ?? 0) * 100)}% · {s.needs_practice} need practice
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Most common misconceptions</CardTitle>
                <CardDescription>From incorrect answers across checks and quizzes</CardDescription>
              </CardHeader>
              <CardContent>
                {data.misconceptions.length === 0 ? (
                  <p className="text-sm text-muted">None recorded yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.misconceptions.map((m) => (
                      <li key={m.key} className="flex items-center justify-between gap-3 text-sm">
                        <span className="first-letter:uppercase">{m.label}</span>
                        <Badge tone="warning">{m.count}×</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Suggested follow-up</CardTitle>
                <CardDescription>Rule-based ideas from the gaps above</CardDescription>
              </CardHeader>
              <CardContent>
                {data.follow_ups.length === 0 ? (
                  <p className="text-sm text-muted">Nothing to suggest yet.</p>
                ) : (
                  <ul className="space-y-3 text-sm">
                    {data.follow_ups.map((f) => (
                      <li key={f.topic + f.suggestion}>
                        <p className="font-semibold">{f.topic}</p>
                        <p className="text-ink-soft">{f.suggestion}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Where explanations go wrong</CardTitle>
                <CardDescription>From post-mission reflection questions</CardDescription>
              </CardHeader>
              <CardContent>
                {data.reflection_gaps.length === 0 ? (
                  <p className="text-sm text-muted">None recorded yet.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {data.reflection_gaps.map((g) => (
                      <li key={g.concept + g.label} className="flex items-center justify-between gap-3">
                        <span className="first-letter:uppercase">{g.label}</span>
                        <Badge tone="warning">{g.count}×</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Learning stages</CardTitle>
                <CardDescription>Students per stage (derived from class)</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {data.stages.map((st) => (
                    <li key={st.key} className="flex items-center justify-between">
                      <span>{st.label} <span className="text-muted">({st.grades})</span></span>
                      <span className="tabular font-semibold">{st.students}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted">Educators see learning data only. Reward balances and practice portfolios are never shown.</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Students</CardTitle>
              <CardDescription>Nicknames only. RupeeRise collects no contact details or real financial data.</CardDescription>
            </CardHeader>
            <CardContent className="relative overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                    <th scope="col" className="py-2 pr-3 font-semibold">Student</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Modules</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Avg mastery</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Start → Final</th>
                    <th scope="col" className="py-2 font-semibold">Last active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.students.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2.5 pr-3">
                        <span className="font-medium">{s.display_name}</span>
                        {!s.onboarded && <Badge className="ml-2">Not onboarded</Badge>}
                        {s.needs_support && (
                          <Badge tone="warning" className="ml-2">
                            Needs support
                          </Badge>
                        )}
                      </td>
                      <td className="tabular py-2.5 pr-3">{s.modules_completed}/4</td>
                      <td className="tabular py-2.5 pr-3">{s.avg_mastery != null ? `${Math.round(s.avg_mastery * 100)}%` : '—'}</td>
                      <td className="tabular py-2.5 pr-3">
                        {s.initial_score != null ? `${s.initial_score}%` : '—'} → {s.post_score != null ? `${s.post_score}%` : '—'}
                      </td>
                      <td className="py-2.5 text-muted">{relativeDate(s.last_active_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

export default function EducatorDashboard() {
  const { user } = useAuth()
  const cohorts = useAsync(() => api.educator.cohorts(), [])
  const [selected, setSelected] = useState<number | null>(null)
  const overview = useAsync(() => (selected ? api.educator.overview(selected) : Promise.resolve(null)), [selected])

  useEffect(() => {
    if (selected == null && cohorts.data?.length) setSelected(cohorts.data[0].id)
  }, [cohorts.data, selected])

  return (
    <div>
      <PageHeader
        eyebrow="Educator / NGO"
        title={`Welcome, ${user?.display_name ?? ''}`}
        description="Track participation, completion and concept-level understanding for your classes. Use the misconceptions list to plan your next session."
        actions={
          selected && (
            <Button variant="outline" onClick={overview.reload}>
              <RefreshCw /> Refresh
            </Button>
          )
        }
      />
      {cohorts.error && <ErrorState message={cohorts.error.message} onRetry={cohorts.reload} />}
      {cohorts.loading ? (
        <LoadingState rows={3} />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardContent className="grid gap-4 pt-5 sm:pt-6 md:grid-cols-[1fr_1.4fr] md:items-end">
              {cohorts.data && cohorts.data.length > 0 ? (
                <Field label="Class">
                  {(p) => (
                    <Select {...p} value={selected ?? ''} onChange={(e) => setSelected(Number(e.target.value))}>
                      {cohorts.data!.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.student_count} students)
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Users className="size-5" aria-hidden /> Create your first class to get a join code.
                </p>
              )}
              <CreateCohort
                onCreated={(id) => {
                  cohorts.reload()
                  setSelected(id)
                }}
              />
            </CardContent>
          </Card>
          {overview.error && <Alert tone="danger">{overview.error.message}</Alert>}
          {selected && (overview.loading && !overview.data ? <LoadingState rows={3} /> : overview.data && <Overview data={overview.data} />)}
        </div>
      )}
    </div>
  )
}
