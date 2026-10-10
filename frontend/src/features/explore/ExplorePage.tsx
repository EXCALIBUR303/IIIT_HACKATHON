import { useEffect, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Disclaimer } from '@/components/common/feedback'
import { ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AllocationEditor, FanChart, HorizonPicker, LossByHorizon, RISK_STYLE, useProjection } from '@/features/simulations/investing-ui'
import { MoneyControl, StatTile } from '@/features/simulations/shared'
import { api } from '@/lib/api/endpoints'
import type { SavingsComparison } from '@/lib/api/types'
import { inr } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'

function CompoundingExplorer() {
  const [deposit, setDeposit] = useState(500)
  const [years, setYears] = useState(10)
  const [rate, setRate] = useState(6)
  const [data, setData] = useState<SavingsComparison | null>(null)
  const [head, setHead] = useState<{ early: { final_balance: number; deposited: number }; late: { final_balance: number; deposited: number } } | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      api.calculators.savings({ monthly_deposit: deposit, months: years * 12, annual_rate: rate / 100 }).then(setData).catch(() => setData(null))
      if (years > 5)
        api.calculators.headStart({ monthly_deposit: deposit, annual_rate: rate / 100, total_years: years, delay_years: 5 }).then(setHead).catch(() => setHead(null))
      else setHead(null)
    }, 300)
    return () => clearTimeout(timer)
  }, [deposit, years, rate])

  const chart = data
    ? data.compound.rows
        .filter((r) => r.month % 12 === 0)
        .map((r, i) => ({ year: `Y${r.month / 12}`, compound: r.balance, simple: data.simple.rows[(i + 1) * 12 - 1]?.balance, deposited: deposit * r.month }))
    : []

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <div className="space-y-3">
        <MoneyControl id="cx-deposit" label="Monthly saving" value={deposit} max={5000} step={50} onChange={setDeposit} color="var(--color-saving)" />
        <MoneyControl id="cx-years" label="Years" value={years} max={30} min={1} step={1} onChange={setYears} prefix="" suffix="yrs" />
        <MoneyControl id="cx-rate" label="Interest rate % per year" value={rate} max={12} min={0} step={1} onChange={setRate} prefix="" suffix="%" hint="An assumption for exploring; real rates vary." />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Simple vs compound interest</CardTitle>
          <CardDescription>Same deposits, same rate. Compound interest also earns interest on interest.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-60" role="img" aria-label="Line chart comparing compound and simple interest growth">
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="year" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} fontSize={12} width={50} />
                <Tooltip formatter={(v) => inr(Number(v))} />
                <Legend />
                <Line type="monotone" dataKey="compound" name="Compound" stroke="var(--color-saving)" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="simple" name="Simple" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="deposited" name="Your deposits" stroke="var(--color-muted)" strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {data && (
            <div className="grid grid-cols-3 gap-2">
              <StatTile label="You deposit" value={inr(data.compound.total_deposited)} />
              <StatTile label="Compound total" value={inr(data.compound.final_balance)} tone="good" />
              <StatTile label="Extra from compounding" value={inr(data.compounding_advantage)} tone="good" />
            </div>
          )}
          {head && (
            <p className="rounded-xl bg-primary-soft p-3 text-sm text-primary-ink">
              <strong>Starting 5 years later</strong> with the same {inr(deposit)}/month ends at {inr(head.late.final_balance)} instead of{' '}
              {inr(head.early.final_balance)}. Time is compounding’s main ingredient.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function InvestmentExplorer() {
  const catalog = useAsync(() => api.content.investingCatalog(), [])
  const [allocation, setAllocation] = useState<Record<string, number>>({ steady_deposit: 40, balanced_basket: 30, growth_basket: 30 })
  const [horizon, setHorizon] = useState(5)
  const [amount] = useState(10000)
  const preview = useProjection(amount, allocation, horizon)
  if (catalog.error) return <ErrorState message={catalog.error.message} onRetry={catalog.reload} />
  if (!catalog.data) return <LoadingState rows={2} />
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      <div className="space-y-4">
        <HorizonPicker horizons={catalog.data.horizons} value={horizon} onChange={setHorizon} />
        <AllocationEditor assets={catalog.data.assets} allocation={allocation} onChange={setAllocation} />
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{inr(amount)} of fictional money over {horizon} year(s)</CardTitle>
            {preview.data && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge tone={RISK_STYLE[preview.data.risk_level].tone}>{RISK_STYLE[preview.data.risk_level].label}</Badge>
                <Badge>Diversification {Math.round(preview.data.diversification * 100)}%</Badge>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {preview.data ? (
              <>
                <FanChart mc={preview.data.monte_carlo} amount={amount} />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {preview.data.paths.map((p) => (
                    <StatTile key={p.key} label={p.label} value={inr(p.final)} tone={p.final < amount ? 'bad' : 'neutral'} />
                  ))}
                </div>
              </>
            ) : (
              <p className="rounded-xl bg-canvas p-6 text-center text-sm text-muted">Make the mix add up to 100% to see results.</p>
            )}
          </CardContent>
        </Card>
        {preview.data && (
          <Card>
            <CardHeader>
              <CardTitle>Chance of ending below {inr(amount)}</CardTitle>
              <CardDescription>For this same mix, held for different lengths of time</CardDescription>
            </CardHeader>
            <CardContent>
              <LossByHorizon data={preview.data.loss_probability_by_horizon} />
            </CardContent>
          </Card>
        )}
        <Disclaimer>{catalog.data.disclaimer}</Disclaimer>
      </div>
    </div>
  )
}

export default function ExplorePage() {
  return (
    <div>
      <PageHeader
        eyebrow="Practice tools"
        title="Explore freely"
        description="Change the numbers and watch what happens. Nothing here is saved or scored, so experiment as much as you like."
      />
      <Tabs defaultValue="compounding">
        <TabsList className="mb-6">
          <TabsTrigger value="compounding">Compounding</TabsTrigger>
          <TabsTrigger value="investing">Risk & time</TabsTrigger>
        </TabsList>
        <TabsContent value="compounding">
          <CompoundingExplorer />
        </TabsContent>
        <TabsContent value="investing">
          <InvestmentExplorer />
        </TabsContent>
      </Tabs>
    </div>
  )
}
