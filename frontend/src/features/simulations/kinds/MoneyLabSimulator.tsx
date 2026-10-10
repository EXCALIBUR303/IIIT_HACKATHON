import { useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Disclaimer, FeedbackList } from '@/components/common/feedback'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { MoneyLabSession } from '@/lib/api/types'
import { inr } from '@/lib/format'
import { EventCard, MoneyControl, OptionCard, ScoreBreakdown, StatTile } from '../shared'
import type { KindProps } from '../SimulationPage'

const COLORS = { spend: 'var(--color-warning)', ready: 'var(--color-muted)', deposit: 'var(--color-saving)', growth: 'var(--color-investing)' }
type Bucket = 'spend' | 'ready' | 'deposit' | 'growth'

function Assumptions({ a }: { a: MoneyLabSession['state']['assumptions'] }) {
  return (
    <details className="rounded-xl border border-line bg-surface p-4 text-sm">
      <summary className="cursor-pointer font-bold">Assumptions and limits of this lab</summary>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-ink-soft">
        <li>Time: {a.months} months. Contributions: {a.contributions}</li>
        <li>Steady deposit: {a.deposit_rate_pct}% a year, added monthly. Inflation: {a.inflation_pct}% a year.</li>
        <li>Borrowing costs {a.borrow_extra_pct}% extra to repay.</li>
        <li>{a.growth}</li>
        {a.limitations.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">{a.disclaimer}</p>
    </details>
  )
}

export function MoneyLabSimulator({ session, decide, busy, error }: KindProps<MoneyLabSession>) {
  const { state } = session
  const [plan, setPlan] = useState<Record<Bucket, number>>({ spend: state.essential_min, ready: 0, deposit: 0, growth: 0 })
  const [source, setSource] = useState<string | null>(null)
  const used = plan.spend + plan.ready + plan.deposit + plan.growth
  const left = state.total - used

  const set = (key: Bucket) => (value: number) => {
    const others = used - plan[key]
    setPlan({ ...plan, [key]: Math.min(value, state.total - others) })
  }

  if (session.phase === 'plan') {
    const growthShare = Math.round((plan.growth / state.total) * 100)
    return (
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <p className="text-ink-soft">
            Goal: <strong>{state.goal.label}</strong>, costing {inr(state.goal.amount)} today. Prices rise about {state.inflation_pct}% a year, so it will cost a little more in {state.months} months.
          </p>
          {state.buckets.map((b) => (
            <MoneyControl
              key={b.key}
              id={`lab-${b.key}`}
              label={b.label}
              value={plan[b.key]}
              min={b.key === 'spend' ? state.essential_min : 0}
              max={state.total}
              step={10}
              color={COLORS[b.key]}
              onChange={set(b.key)}
              hint={b.key === 'spend' ? `${b.note} At least ${inr(state.essential_min)} is needed for something essential.` : b.note}
            />
          ))}
          <Assumptions a={state.assumptions} />
        </div>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Your split</CardTitle>
              <CardDescription>Every rupee needs a job. Time, inflation and a surprise come next.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatTile label="Still to place" value={inr(left)} tone={left === 0 ? 'good' : 'warn'} sub={`of ${inr(state.total)}`} />
              <StatTile label="In the growth basket" value={`${growthShare}%`} tone={growthShare > 60 ? 'bad' : growthShare > 40 ? 'warn' : 'neutral'} sub="A big share in one risky place can hurt in a bad period" />
              {error && <Alert tone="danger">{error}</Alert>}
              <Button className="w-full" size="lg" loading={busy} disabled={left !== 0} onClick={() => decide('plan', plan)}>
                Start the six months
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    )
  }

  if (session.phase === 'respond_event' && state.event && state.options && state.at_event && state.plan) {
    return (
      <div className="mx-auto grid max-w-3xl gap-5">
        <p className="text-ink-soft">Months 1 to {state.event.month - 1} passed. Then, in month {state.event.month}…</p>
        <EventCard title={state.event.title} description={state.event.description} amount={state.event.amount} />
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Kept ready" value={inr(state.at_event.ready)} />
          <StatTile label="Steady deposit" value={inr(state.at_event.deposit, { paise: true })} />
          <StatTile label="Growth basket" value={inr(state.at_event.growth, { paise: true })} sub={state.at_event.growth < state.plan.growth ? 'Down from where you started' : undefined} />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-bold">How will you pay for it?</legend>
          <div className="space-y-2" role="radiogroup">
            {state.options.map((o) => (
              <OptionCard key={o.key} selected={source === o.key} disabled={!o.feasible} onSelect={() => setSource(o.key)} title={o.label} description={o.feasible ? o.note : `${o.note} (not enough money there)`} />
            ))}
          </div>
        </fieldset>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button size="lg" disabled={!source} loading={busy} onClick={() => source && decide('respond_event', { source })}>
          See where you end up
        </Button>
      </div>
    )
  }

  const r = session.result
  if (!r) return null
  const chart = r.timeline.map((t) => ({ month: `M${t.month}`, total: t.total }))
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>{r.goal_reached ? `Goal reached: you could buy the ${state.goal.label}` : `Goal not reached: ${inr(r.goal_price)} needed`}</CardTitle>
          <CardDescription>Fictional growth path this time: {r.path_label}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-56" role="img" aria-label={`Line chart of total savings by month ending at ${inr(r.timeline[r.timeline.length - 1].total)} against a goal price of ${inr(r.goal_price)}`}>
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(v) => `₹${v}`} tickLine={false} axisLine={false} fontSize={12} width={56} />
                <Tooltip formatter={(v) => inr(Number(v), { paise: true })} />
                <Legend />
                <ReferenceLine y={r.goal_price} stroke="var(--color-saving)" strokeDasharray="4 4" label={{ value: 'Goal price', fontSize: 11, fill: 'var(--color-accent-ink)', position: 'insideTopLeft' }} />
                <Line type="monotone" dataKey="total" name="Savings before the surprise" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="You ended with" value={inr(r.saved_total, { paise: true })} tone={r.goal_reached ? 'good' : 'warn'} />
            <StatTile label="Worth in today’s rupees" value={inr(r.real_value, { paise: true })} sub={`Inflation took ${inr(r.inflation_drag, { paise: true })}`} />
            <StatTile label="Goal price by month 6" value={inr(r.goal_price, { paise: true })} />
            <StatTile label="Borrowing cost" value={inr(r.repay_extra, { paise: true })} tone={r.repay_extra > 0 ? 'bad' : 'neutral'} />
          </div>
          <div className="mt-4">
            <Assumptions a={r.assumptions} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Score breakdown</CardTitle>
          <CardDescription>Judged on how robust your plan was, not on the lucky path.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ScoreBreakdown
            items={[
              { label: 'Goal plan', value: r.components.goal_plan ?? 0, max: 35 },
              { label: 'Money ready (liquidity)', value: r.components.liquidity ?? 0, max: 25 },
              { label: 'Risk balance', value: r.components.risk_balance ?? 0, max: 20 },
              { label: 'Inflation awareness', value: r.components.inflation_awareness ?? 0, max: 20 },
            ]}
          />
          <FeedbackList items={r.feedback} />
          <Disclaimer>{r.assumptions.disclaimer}</Disclaimer>
        </CardContent>
      </Card>
    </div>
  )
}
