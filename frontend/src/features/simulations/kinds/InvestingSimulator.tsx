import { TrendingDown } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Disclaimer, FeedbackList } from '@/components/common/feedback'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { InvestingSession } from '@/lib/api/types'
import { inr, signedPct } from '@/lib/format'
import { AllocationEditor, FanChart, HorizonPicker, LossByHorizon, RISK_STYLE, useProjection } from '../investing-ui'
import { OptionCard, ScoreBreakdown, StatTile } from '../shared'
import type { KindProps } from '../SimulationPage'

const ACTION_LABEL = { hold: 'Stay invested', sell_all: 'Sell everything', rebalance: 'Rebalance' }

export function InvestingSimulator({ session, decide, busy, error }: KindProps<InvestingSession>) {
  const { state } = session
  const [allocation, setAllocation] = useState<Record<string, number>>(() =>
    Object.fromEntries(state.assets.map((a, i) => [a.key, i === 0 ? 100 : 0])),
  )
  const [horizon, setHorizon] = useState(state.horizons[state.horizons.length - 1])
  const [action, setAction] = useState<string | null>(null)
  const preview = useProjection(state.amount, allocation, horizon)
  const total = Object.values(allocation).reduce((a, b) => a + b, 0)

  if (session.phase === 'allocate') {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          <HorizonPicker horizons={state.horizons} value={horizon} onChange={setHorizon} />
          <AllocationEditor assets={state.assets} allocation={allocation} onChange={setAllocation} />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Possible futures for {inr(state.amount)}</CardTitle>
              <CardDescription>1,000 simulated markets using fictional assumptions. The shaded band covers 8 in 10 outcomes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {preview.data ? (
                <>
                  <FanChart mc={preview.data.monte_carlo} amount={state.amount} />
                  <div className="grid grid-cols-3 gap-2">
                    <StatTile label="Weak outcome" value={inr(preview.data.monte_carlo.worst_case_p10)} />
                    <StatTile label="Middle" value={inr(preview.data.monte_carlo.median)} />
                    <StatTile label="Strong outcome" value={inr(preview.data.monte_carlo.best_case_p90)} />
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge tone={RISK_STYLE[preview.data.risk_level].tone}>{RISK_STYLE[preview.data.risk_level].label}</Badge>
                    <Badge>Diversification {Math.round(preview.data.diversification * 100)}%</Badge>
                    <Badge tone="warning">{Math.round(preview.data.monte_carlo.probability_of_loss * 100)}% chance of a loss</Badge>
                  </div>
                </>
              ) : (
                <p className="flex h-60 items-center justify-center rounded-xl bg-canvas p-4 text-center text-sm text-muted">
                  {total === 100 ? 'Calculating…' : 'Make your percentages add up to 100% to see possible outcomes.'}
                </p>
              )}
              {error && <Alert tone="danger">{error}</Alert>}
              <Button
                className="w-full"
                size="lg"
                loading={busy}
                disabled={total !== 100}
                onClick={() =>
                  decide('allocate', {
                    allocation: Object.fromEntries(Object.entries(allocation).filter(([, v]) => v > 0)),
                    horizon_years: horizon,
                  })
                }
              >
                Invest and fast-forward time
              </Button>
              <Disclaimer>{state.disclaimer}</Disclaimer>
            </CardContent>
          </Card>
        </aside>
      </div>
    )
  }

  if (session.phase === 'respond_event' && state.event) {
    const e = state.event
    return (
      <div className="mx-auto grid max-w-3xl gap-5">
        <div className="rounded-2xl border-2 border-danger bg-danger-soft p-5">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-danger-ink">
            <TrendingDown className="size-4" aria-hidden /> Market news · Year {e.year}
          </p>
          <h3 className="mt-1 text-xl font-extrabold">The market fell {Math.abs(e.market_change_pct)}% this year</h3>
          <p className="mt-1 text-sm text-ink-soft">Headlines are gloomy. Friends say they are selling.</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Your portfolio now" value={inr(e.value)} />
          <StatTile label="Change this year" value={signedPct(e.year_change_pct)} tone={e.year_change_pct < 0 ? 'bad' : 'good'} />
          <StatTile label="Since you started" value={signedPct(e.change_pct)} tone={e.change_pct < 0 ? 'bad' : 'good'} />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-bold">You still have {(state.horizon_years ?? 0) - e.year} year(s) before you need this money. What do you do?</legend>
          <div className="space-y-2" role="radiogroup">
            {e.options.map((o) => (
              <OptionCard key={o.key} selected={action === o.key} onSelect={() => setAction(o.key)} title={o.label} />
            ))}
          </div>
        </fieldset>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button size="lg" disabled={!action} loading={busy} onClick={() => action && decide('respond_event', { action })}>
          Fast-forward to the end
        </Button>
      </div>
    )
  }

  const r = session.result
  if (!r) return null
  const pathRows = r.path_result?.rows.map((row) => ({ year: `Y${row.year}`, value: row.value })) ?? []
  const comparison = r.path_result
    ? (Object.entries(r.path_result.outcome_by_action) as [keyof typeof ACTION_LABEL, number][]).map(([k, v]) => ({
        label: ACTION_LABEL[k],
        value: v,
        chosen: k === r.action,
      }))
    : []
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        {r.path_result && (
          <Card>
            <CardHeader>
              <CardTitle>Your path: “{r.path_result.label}”</CardTitle>
              <CardDescription>
                One illustrative market. Your {inr(state.amount)} ended at {inr(r.path_result.final)} after {r.horizon_years} years.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="h-56" role="img" aria-label={`Portfolio value by year, ending at ${inr(r.path_result.final)}`}>
                <ResponsiveContainer>
                  <LineChart data={pathRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--color-line)" vertical={false} />
                    <XAxis dataKey="year" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} fontSize={12} width={48} />
                    <Tooltip formatter={(v) => inr(Number(v))} />
                    <ReferenceLine y={state.amount} stroke="var(--color-muted)" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="value" name="Portfolio" stroke="var(--color-investing)" strokeWidth={2.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div>
                <h3 className="mb-1 text-sm font-bold">What each choice would have led to on this path</h3>
                <div className="h-36" role="img" aria-label={comparison.map((c) => `${c.label}: ${inr(c.value)}`).join(', ')}>
                  <ResponsiveContainer>
                    <BarChart data={comparison} layout="vertical" margin={{ left: 8, right: 80 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="label" width={120} fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v) => inr(Number(v))} />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                        {comparison.map((c) => (
                          <Cell key={c.label} fill={c.chosen ? 'var(--color-investing)' : 'var(--color-line-strong)'} />
                        ))}
                        <LabelList dataKey="value" position="right" formatter={(v) => inr(Number(v))} fontSize={12} fill="var(--color-ink)" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>The bigger picture: 1,000 possible futures</CardTitle>
            <CardDescription>One path is just one story. This is the range the same mix could produce.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <FanChart mc={r.monte_carlo} amount={state.amount} />
            <div>
              <h3 className="text-sm font-bold">Chance of ending with less than you put in</h3>
              <LossByHorizon data={r.loss_probability_by_horizon} />
              <p className="text-xs text-muted">Longer horizons give falls more time to recover, but nothing is guaranteed.</p>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card className="self-start">
        <CardHeader>
          <CardTitle>How your reasoning scored</CardTitle>
          <CardDescription>Scored on decisions, not luck: the same choices score the same in any market.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ScoreBreakdown
            items={[
              { label: 'Diversification', value: r.components.diversification ?? 0, max: 25 },
              { label: 'Risk matches your horizon', value: r.components.risk_matches_horizon ?? 0, max: 35 },
              { label: 'Avoided concentration', value: r.components.concentration ?? 0, max: 15 },
              { label: 'Calm response to the fall', value: r.components.steady_response ?? 0, max: 25 },
            ]}
          />
          <FeedbackList items={r.feedback} />
          <Disclaimer>{r.disclaimer}</Disclaimer>
        </CardContent>
      </Card>
    </div>
  )
}
