import { AlertTriangle, Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Disclaimer, FeedbackList } from '@/components/common/feedback'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import type { BudgetCategory, BudgetSession } from '@/lib/api/types'
import { inr } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EventCard, MoneyControl, OptionCard, ScoreBreakdown, StatTile } from '../shared'
import type { KindProps } from '../SimulationPage'

const KIND_COLOR = { need: 'var(--color-primary)', want: 'var(--color-warning)', savings: 'var(--color-saving)' }
const KIND_LABEL = { need: 'Needs', want: 'Wants', savings: 'Savings' }

/** Pure helper (unit-tested): totals and client-side warnings for the live summary. */
// eslint-disable-next-line react-refresh/only-export-components
export function summarize(categories: BudgetCategory[], alloc: Record<string, number>, income: number) {
  const totals = { need: 0, want: 0, savings: 0 }
  for (const c of categories) totals[c.kind] += alloc[c.key] ?? 0
  const allocated = totals.need + totals.want + totals.savings
  const shortfalls = categories.filter((c) => c.kind === 'need' && (alloc[c.key] ?? 0) < c.essential_min)
  return { totals, allocated, remaining: income - allocated, over: allocated > income, shortfalls }
}

function initialAllocation(categories: BudgetCategory[]): Record<string, number> {
  return Object.fromEntries(categories.map((c) => [c.key, 0]))
}

export function BudgetSimulator({ session, decide, busy, error }: KindProps<BudgetSession>) {
  const { state } = session
  const [alloc, setAlloc] = useState<Record<string, number>>(() => initialAllocation(state.categories))
  const [response, setResponse] = useState<string | null>(null)
  const sum = useMemo(() => summarize(state.categories, alloc, state.income), [state.categories, alloc, state.income])

  if (session.phase === 'allocate') {
    const groups = (['need', 'want', 'savings'] as const).map((kind) => ({
      kind,
      items: state.categories.filter((c) => c.kind === kind),
    }))
    const pie = [
      { name: 'Needs', value: sum.totals.need, color: KIND_COLOR.need },
      { name: 'Wants', value: sum.totals.want, color: KIND_COLOR.want },
      { name: 'Savings', value: sum.totals.savings, color: KIND_COLOR.savings },
      { name: 'Unallocated', value: Math.max(0, sum.remaining), color: 'var(--color-line)' },
    ].filter((d) => d.value > 0)

    return (
      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          {groups.map(({ kind, items }) => (
            <section key={kind} aria-labelledby={`grp-${kind}`}>
              <h3 id={`grp-${kind}`} className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-soft">
                <span className="size-2.5 rounded-full" style={{ background: KIND_COLOR[kind] }} aria-hidden />
                {KIND_LABEL[kind]}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                {items.map((c) => {
                  const short = c.kind === 'need' && (alloc[c.key] ?? 0) < c.essential_min
                  return (
                    <MoneyControl
                      key={c.key}
                      id={`alloc-${c.key}`}
                      label={c.label}
                      value={alloc[c.key] ?? 0}
                      max={state.income}
                      color={KIND_COLOR[c.kind]}
                      marker={c.essential_min || undefined}
                      onChange={(v) => setAlloc((a) => ({ ...a, [c.key]: v }))}
                      hint={
                        <span className={cn(short && 'font-medium text-warning-ink')}>
                          {c.hint}
                          {c.essential_min > 0 && ` Minimum ${inr(c.essential_min)}.`}
                        </span>
                      }
                    />
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Your plan</CardTitle>
              <CardDescription>Income this month: {inr(state.income)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-32 w-32 shrink-0" aria-hidden>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pie.length ? pie : [{ name: 'Empty', value: 1, color: 'var(--color-line)' }]} dataKey="value" innerRadius={38} outerRadius={60} stroke="none" isAnimationActive={false}>
                        {(pie.length ? pie : [{ color: 'var(--color-line)' }]).map((d, i) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => inr(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <dl className="flex-1 space-y-1.5 text-sm">
                  {(['need', 'want', 'savings'] as const).map((k) => (
                    <div key={k} className="flex justify-between">
                      <dt className="flex items-center gap-2 text-ink-soft">
                        <span className="size-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} aria-hidden /> {KIND_LABEL[k]}
                      </dt>
                      <dd className="tabular font-semibold">{inr(sum.totals[k])}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-line pt-1.5">
                    <dt className="font-semibold">{sum.over ? 'Over budget by' : 'Left unallocated'}</dt>
                    <dd className={cn('tabular font-bold', sum.over ? 'text-danger-ink' : 'text-ink')}>{inr(Math.abs(sum.remaining))}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-ink-soft">
                  <span>Goal: {state.goal.label}</span>
                  <span>
                    {inr(sum.totals.savings)} / {inr(state.goal.monthly_target)} per month
                  </span>
                </div>
                <ProgressBar value={(sum.totals.savings / state.goal.monthly_target) * 100} label="Monthly goal saving" color="var(--color-saving)" />
              </div>
              <div aria-live="polite" className="space-y-2">
                {sum.over && (
                  <Alert tone="danger">You’re planning to spend more than you have. A budget can’t exceed income.</Alert>
                )}
                {!sum.over && sum.shortfalls.length > 0 && (
                  <p className="flex gap-2 text-sm text-warning-ink">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {sum.shortfalls.length} need{sum.shortfalls.length > 1 ? 's are' : ' is'} below the essential minimum.
                  </p>
                )}
              </div>
              {error && <Alert tone="danger">{error}</Alert>}
              <Button
                className="w-full"
                size="lg"
                loading={busy}
                disabled={sum.over}
                onClick={() => decide('allocate', { allocations: alloc })}
              >
                <Lock /> Lock in my budget
              </Button>
              <p className="text-center text-xs text-muted">Something unexpected may happen once you lock it in.</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    )
  }

  if (session.phase === 'respond_event' && state.allocation && state.event && state.options) {
    const a = state.allocation
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>How your plan scored</CardTitle>
            <CardDescription>Planning score {a.score}/100 before the surprise</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ScoreBreakdown
              items={[
                { label: 'Needs covered', value: a.components.needs_covered, max: 40 },
                { label: 'Savings habit', value: a.components.savings_habit, max: 25 },
                { label: 'Wants in check', value: a.components.wants_in_check, max: 15 },
                { label: 'Goal on track', value: a.components.goal_on_track, max: 20 },
              ]}
            />
            <FeedbackList items={a.feedback} />
          </CardContent>
        </Card>
        <div className="space-y-4">
          <EventCard
            title={state.event.title}
            description={state.event.description}
            amount={state.event.amount}
            label={state.event.kind === 'income_drop' ? 'Income shock!' : state.event.essential ? 'Surprise expense!' : 'Tempting offer'}
          />
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Wants budget" value={inr(a.wants_total)} />
            <StatTile label="Savings" value={inr(a.savings_total)} />
            <StatTile label="Cash buffer" value={inr(a.buffer)} />
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">How will you handle it?</legend>
            <div className="space-y-2" role="radiogroup">
              {state.options.map((o) => (
                <OptionCard
                  key={o.key}
                  selected={response === o.key}
                  disabled={!o.feasible}
                  onSelect={() => setResponse(o.key)}
                  title={o.label}
                  description={o.feasible ? o.explanation : `Not possible: ${o.explanation}`}
                />
              ))}
            </div>
          </fieldset>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button className="w-full" size="lg" disabled={!response} loading={busy} onClick={() => response && decide('respond_event', { response })}>
            Confirm my choice
          </Button>
        </div>
      </div>
    )
  }

  const r = session.result
  if (!r) return null
  const o = r.outcome
  const label = (key: string) => state.options?.find((x) => x.key === key)?.label ?? key.replaceAll('_', ' ')
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>What happened</CardTitle>
          <CardDescription>
            {r.event.title}: {inr(o.cost)}. You chose “{label(o.response)}”.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="From wants" value={inr(o.paid_from.wants)} />
            <StatTile label="From buffer" value={inr(o.paid_from.buffer)} />
            <StatTile label="From savings" value={inr(o.paid_from.savings)} tone={o.paid_from.savings > 0 ? 'warn' : 'neutral'} />
            <StatTile label="Borrowed" value={inr(o.borrowed)} tone={o.borrowed > 0 ? 'bad' : 'good'} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-ink-soft">
              <span>Goal progress this month: {state.goal.label}</span>
              <span>{o.goal_progress_pct}% of {inr(state.goal.amount)}</span>
            </div>
            <ProgressBar value={o.goal_progress_pct} label="Goal progress" color="var(--color-saving)" />
          </div>
          <FeedbackList items={o.feedback} />
          {o.response !== o.best_response && (
            <p className="rounded-xl bg-primary-soft p-3 text-sm text-primary-ink">
              <strong>Strongest option here:</strong> {label(o.best_response)}. Retry to see how it changes the outcome.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Your score</CardTitle>
          <CardDescription>70% planning quality + 30% how you handled the surprise</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ScoreBreakdown
            items={[
              { label: 'Needs covered', value: r.allocation.components.needs_covered, max: 40 },
              { label: 'Savings habit', value: r.allocation.components.savings_habit, max: 25 },
              { label: 'Wants in check', value: r.allocation.components.wants_in_check, max: 15 },
              { label: 'Goal on track', value: r.allocation.components.goal_on_track, max: 20 },
              { label: 'Handling the surprise', value: o.handling_score, max: 100 },
            ]}
          />
          <FeedbackList items={r.allocation.feedback} />
          <Disclaimer>Amounts are fictional and simplified to one month so you can focus on the decision.</Disclaimer>
        </CardContent>
      </Card>
    </div>
  )
}
