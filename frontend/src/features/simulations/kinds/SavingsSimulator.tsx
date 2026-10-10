import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Disclaimer, FeedbackList } from '@/components/common/feedback'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { SavingsSession } from '@/lib/api/types'
import { inr } from '@/lib/format'
import { EventCard, MoneyControl, OptionCard, ScoreBreakdown, StatTile } from '../shared'
import type { KindProps } from '../SimulationPage'

const COMPOUNDING_LABEL = { none: 'No interest', simple: 'Simple interest', monthly: 'Compound interest (monthly)' }

export function SavingsSimulator({ session, decide, busy, error }: KindProps<SavingsSession>) {
  const { state } = session
  const [goalSaving, setGoalSaving] = useState(Math.round(state.capacity * 0.6))
  const [emergencySaving, setEmergencySaving] = useState(0)
  const [account, setAccount] = useState(state.accounts[0]?.key ?? '')
  const [source, setSource] = useState<string | null>(null)

  if (session.phase === 'plan') {
    const total = goalSaving + emergencySaving
    const over = total > state.capacity
    const roughMonths = goalSaving > 0 ? Math.ceil(state.goal.amount / goalSaving) : null
    return (
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Money each month" value={inr(state.income)} />
            <StatTile label="Regular spending" value={inr(state.fixed_spending)} />
            <StatTile label="You can save up to" value={inr(state.capacity)} tone="good" />
          </div>
          <MoneyControl
            id="goal-saving"
            label={`Monthly saving for ${state.goal.label}`}
            value={goalSaving}
            max={state.capacity}
            color="var(--color-saving)"
            onChange={setGoalSaving}
            hint={`Goal: ${inr(state.goal.amount)} in ${state.months} months.`}
          />
          <MoneyControl
            id="emergency-saving"
            label="Monthly saving for an emergency fund"
            value={emergencySaving}
            max={state.capacity}
            color="var(--color-primary)"
            onChange={setEmergencySaving}
            hint="Kept separate so surprises don’t eat into your goal."
          />
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Where will you keep the money?</legend>
            <div className="grid gap-2" role="radiogroup">
              {state.accounts.map((a) => (
                <OptionCard
                  key={a.key}
                  selected={account === a.key}
                  onSelect={() => setAccount(a.key)}
                  title={a.label}
                  description={`${COMPOUNDING_LABEL[a.compounding]}${a.annual_rate ? ` at ${(a.annual_rate * 100).toFixed(1)}% a year` : ''}. ${a.note}`}
                />
              ))}
            </div>
          </fieldset>
        </div>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Plan check</CardTitle>
              <CardDescription>A quick estimate before interest. The simulation calculates the rest.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatTile label="Total saved each month" value={inr(total)} tone={over ? 'bad' : 'neutral'} sub={`of ${inr(state.capacity)} available`} />
              <StatTile
                label={`Months to reach ${inr(state.goal.amount)}`}
                value={roughMonths ? `${roughMonths} month${roughMonths > 1 ? 's' : ''}` : '—'}
                tone={roughMonths && roughMonths <= state.months ? 'good' : 'warn'}
                sub={`Deadline: ${state.months} months, if nothing goes wrong…`}
              />
              {over && <Alert tone="danger">You can only save {inr(state.capacity)} a month.</Alert>}
              {error && <Alert tone="danger">{error}</Alert>}
              <Button
                className="w-full"
                size="lg"
                loading={busy}
                disabled={over || total === 0}
                onClick={() => decide('plan', { goal_saving: goalSaving, emergency_saving: emergencySaving, account })}
              >
                Start saving
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    )
  }

  if (session.phase === 'respond_event' && state.event && state.options && state.before_event) {
    return (
      <div className="mx-auto grid max-w-3xl gap-5">
        <p className="text-ink-soft">
          Months 1 to {state.before_event.month} went to plan. Then, in month {state.event.month}…
        </p>
        <EventCard title={state.event.title} description={state.event.description} amount={state.event.amount} />
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Goal savings so far" value={inr(state.before_event.goal_balance)} />
          <StatTile label="Emergency fund so far" value={inr(state.before_event.emergency_balance)} />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-bold">How will you pay for it?</legend>
          <div className="space-y-2" role="radiogroup">
            {state.options.map((o) => (
              <OptionCard
                key={o.key}
                selected={source === o.key}
                disabled={!o.feasible}
                onSelect={() => setSource(o.key)}
                title={o.label}
                description={o.explanation}
              />
            ))}
          </div>
        </fieldset>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button size="lg" disabled={!source} loading={busy} onClick={() => source && decide('respond_event', { source })}>
          See how the year ends
        </Button>
      </div>
    )
  }

  const r = session.result
  if (!r) return null
  const chart = r.goal_projection.rows.map((row, i) => ({
    month: `M${row.month}`,
    goal: row.balance,
    emergency: r.emergency_projection.rows[i]?.balance ?? 0,
  }))
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>{r.goal_reached ? `Goal reached in month ${r.goal_reached_month}` : 'Goal not reached in time'}</CardTitle>
          <CardDescription>Month-by-month balances calculated by the savings engine</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64" role="img" aria-label={`Line chart of goal savings ending at ${inr(r.goal_projection.final_balance)} and emergency fund ending at ${inr(r.emergency_projection.final_balance)}`}>
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(v) => `₹${v}`} tickLine={false} axisLine={false} fontSize={12} width={60} />
                <Tooltip formatter={(v) => inr(Number(v))} />
                <Legend />
                <ReferenceLine y={state.goal.amount} stroke="var(--color-saving)" strokeDasharray="4 4" label={{ value: 'Goal', fontSize: 11, fill: 'var(--color-accent-ink)', position: 'insideTopLeft' }} />
                <Line type="monotone" dataKey="goal" name="Goal savings" stroke="var(--color-saving)" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="emergency" name="Emergency fund" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Paid from emergency fund" value={inr(r.paid_from_emergency)} tone={r.paid_from_emergency > 0 ? 'good' : 'neutral'} />
            <StatTile label="Taken from goal" value={inr(r.paid_from_goal)} tone={r.paid_from_goal > 0 ? 'warn' : 'neutral'} />
            <StatTile label="Borrowed" value={inr(r.borrowed)} tone={r.borrowed > 0 ? 'bad' : 'neutral'} />
            <StatTile label="Interest earned" value={inr(r.goal_projection.total_interest + r.emergency_projection.total_interest, { paise: true })} />
          </div>
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-bold">Same deposits, different places to keep them</h3>
            <div className="h-40" role="img" aria-label="Bar chart comparing final balance by account type">
              <ResponsiveContainer>
                <BarChart data={r.account_comparison} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <XAxis type="number" hide domain={['dataMin - 200', 'dataMax']} />
                  <YAxis type="category" dataKey="label" width={170} fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => inr(Number(v), { paise: true })} />
                  <Bar dataKey="final_balance" name="Final balance" fill="var(--color-saving)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Score breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <ScoreBreakdown
            items={[
              { label: 'Goal reached', value: r.components.goal_reached ?? 0, max: 40 },
              { label: 'Surprise handled', value: r.components.event_handled ?? 0, max: 30 },
              { label: 'Emergency habit', value: r.components.emergency_habit ?? 0, max: 15 },
              { label: 'Where you saved', value: r.components.account_choice ?? 0, max: 15 },
            ]}
          />
          <FeedbackList items={r.feedback} />
          <Disclaimer>Interest rates here are illustrative assumptions, not real offers from any bank.</Disclaimer>
        </CardContent>
      </Card>
    </div>
  )
}
