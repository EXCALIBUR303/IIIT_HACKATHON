import { ArrowDownRight, ArrowUpRight, Sprout, Waves } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Disclaimer } from '@/components/common/feedback'
import { ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { AnimatedNumber } from '@/components/motion/AnimatedNumber'
import { SegmentedTabs } from '@/components/motion/SegmentedTabs'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { AllocationEditor, FanChart, HorizonPicker, LossByHorizon, RISK_STYLE, useProjection } from '@/features/simulations/investing-ui'
import { MoneyControl } from '@/features/simulations/shared'
import { api } from '@/lib/api/endpoints'
import type { SavingsComparison } from '@/lib/api/types'
import { inr } from '@/lib/format'
import { swap } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useAsync } from '@/lib/useAsync'

/** A labelled number that counts to its new value when inputs change. */
function Readout({ label, value, tone, big }: { label: string; value: number; tone?: 'good' | 'muted'; big?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className={cn('mt-1 font-extrabold leading-tight', big ? 'text-2xl' : 'text-lg', tone === 'good' && 'text-accent-ink')}>
        <AnimatedNumber value={value} format={(n) => inr(Math.round(n))} duration={0.6} />
      </p>
    </div>
  )
}

/** "What changed": names the control that moved and what it did to the result. */
function ChangeNote({ note }: { note: { id: number; text: string; delta: number } | null }) {
  return (
    <div className="min-h-[2.75rem]" aria-live="polite">
      <AnimatePresence mode="wait">
        {note && (
          <motion.p
            key={note.id}
            variants={swap}
            initial="hidden"
            animate="show"
            exit="exit"
            className={cn(
              'inline-flex items-start gap-2 rounded-xl px-3 py-2 text-sm',
              note.delta > 0 ? 'bg-accent-soft text-accent-ink' : note.delta < 0 ? 'bg-warning-soft text-warning-ink' : 'bg-canvas text-ink-soft',
            )}
          >
            {note.delta >= 0 ? <ArrowUpRight className="mt-0.5 size-4 shrink-0" aria-hidden /> : <ArrowDownRight className="mt-0.5 size-4 shrink-0" aria-hidden />}
            <span>{note.text}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

type Inputs = { deposit: number; years: number; rate: number }
const INPUT_LABEL: Record<keyof Inputs, (v: number) => string> = {
  deposit: (v) => `monthly saving to ${inr(v)}`,
  years: (v) => `time to ${v} year${v === 1 ? '' : 's'}`,
  rate: (v) => `the rate to ${v}%`,
}

function CompoundingLab() {
  const reduce = useReducedMotion()
  const [inputs, setInputs] = useState<Inputs>({ deposit: 500, years: 10, rate: 6 })
  const [data, setData] = useState<SavingsComparison | null>(null)
  const [head, setHead] = useState<{ early: { final_balance: number }; late: { final_balance: number } } | null>(null)
  const [note, setNote] = useState<{ id: number; text: string; delta: number } | null>(null)
  const lastChange = useRef<keyof Inputs | null>(null)
  const prevFinal = useRef<number | null>(null)
  const { deposit, years, rate } = inputs

  const set = (key: keyof Inputs) => (v: number) => {
    lastChange.current = key
    setInputs((x) => ({ ...x, [key]: v }))
  }

  useEffect(() => {
    let live = true
    const timer = setTimeout(() => {
      api.calculators
        .savings({ monthly_deposit: deposit, months: years * 12, annual_rate: rate / 100 })
        .then((d) => {
          if (!live) return
          const key = lastChange.current
          if (key && prevFinal.current != null) {
            const delta = d.compound.final_balance - prevFinal.current
            setNote({
              id: Date.now(),
              delta,
              text:
                Math.round(delta) === 0
                  ? `Changing ${INPUT_LABEL[key](inputs[key])} left the final balance the same.`
                  : `Changing ${INPUT_LABEL[key](inputs[key])} ${delta > 0 ? 'added' : 'took away'} ${inr(Math.abs(Math.round(delta)))} at the end.`,
            })
          }
          prevFinal.current = d.compound.final_balance
          setData(d)
        })
        .catch(() => live && setData(null))
      if (years > 5)
        api.calculators
          .headStart({ monthly_deposit: deposit, annual_rate: rate / 100, total_years: years, delay_years: 5 })
          .then((h) => live && setHead(h))
          .catch(() => live && setHead(null))
      else setHead(null)
    }, 250)
    return () => {
      live = false
      clearTimeout(timer)
    }
    // inputs is read for the note only; the three numbers are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deposit, years, rate])

  const chart = data
    ? data.compound.rows
        .filter((r) => r.month % 12 === 0)
        .map((r, i) => ({ year: `Y${r.month / 12}`, compound: r.balance, simple: data.simple.rows[(i + 1) * 12 - 1]?.balance, deposited: deposit * r.month }))
    : []

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
      <div className="space-y-3 rounded-[var(--radius-panel)] border border-line bg-canvas-deep/40 p-4">
        <p className="px-1 text-xs font-bold uppercase tracking-wider text-muted">Your inputs</p>
        <MoneyControl id="cx-deposit" label="Monthly saving" value={deposit} max={5000} step={50} onChange={set('deposit')} color="var(--color-saving)" />
        <MoneyControl id="cx-years" label="Years" value={years} max={30} min={1} step={1} onChange={set('years')} prefix="" suffix="yrs" color="var(--color-saving)" />
        <MoneyControl
          id="cx-rate"
          label="Interest rate % per year"
          value={rate}
          max={12}
          min={0}
          step={1}
          onChange={set('rate')}
          prefix=""
          suffix="%"
          color="var(--color-saving)"
          hint="An assumption for exploring; real rates vary."
        />
      </div>

      <section aria-labelledby="cx-h" className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="cx-h" className="text-lg font-extrabold">
              Simple vs compound interest
            </h2>
            <p className="mt-0.5 text-sm text-muted">Same deposits, same rate. Compound interest also earns interest on interest.</p>
          </div>
          {data && (
            <div className="text-right">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">After {years} years</p>
              <p className="text-2xl font-extrabold text-accent-ink">
                <AnimatedNumber value={data.compound.final_balance} format={(n) => inr(Math.round(n))} duration={0.6} />
              </p>
            </div>
          )}
        </div>
        <ChangeNote note={note} />
        <div className="mt-1 h-64" role="img" aria-label={`Line chart: compound interest reaches ${data ? inr(data.compound.final_balance) : 'a higher total'} against simple interest and your deposits`}>
          <ResponsiveContainer>
            <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cx-area" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--color-saving)" stopOpacity={0.18} />
                  <stop offset="1" stopColor="var(--color-saving)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="year" tickLine={false} axisLine={false} fontSize={12} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} fontSize={12} width={52} />
              <Tooltip formatter={(v) => inr(Number(v))} contentStyle={{ borderRadius: 12, border: '1px solid var(--color-line)' }} />
              <Area type="monotone" dataKey="compound" name="Compound" stroke="var(--color-saving)" strokeWidth={2.5} fill="url(#cx-area)" isAnimationActive={!reduce} animationDuration={500} />
              <Line type="monotone" dataKey="simple" name="Simple" stroke="var(--color-primary)" strokeWidth={2} dot={false} isAnimationActive={!reduce} animationDuration={500} />
              <Line type="monotone" dataKey="deposited" name="Your deposits" stroke="var(--color-muted)" strokeDasharray="4 4" dot={false} isAnimationActive={!reduce} animationDuration={500} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-2 flex flex-wrap gap-4 text-xs text-muted" aria-hidden>
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-saving" /> Compound
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-primary" /> Simple
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t-2 border-dashed border-muted" /> Your deposits
          </li>
        </ul>
        {data && (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Readout label="You deposit" value={data.compound.total_deposited} />
            <Readout label="Simple interest total" value={data.simple.final_balance} />
            <Readout label="Extra from compounding" value={data.compounding_advantage} tone="good" />
          </div>
        )}
        {head && (
          <p className="mt-4 rounded-xl bg-primary-soft p-3 text-sm text-primary-ink">
            <strong>Starting 5 years later</strong> with the same {inr(deposit)}/month ends at {inr(head.late.final_balance)} instead of {inr(head.early.final_balance)}.
            Time is compounding’s main ingredient.
          </p>
        )}
      </section>
    </div>
  )
}

function RiskLab() {
  const catalog = useAsync(() => api.content.investingCatalog(), [])
  const [allocation, setAllocation] = useState<Record<string, number>>({ steady_deposit: 40, balanced_basket: 30, growth_basket: 30 })
  const [horizon, setHorizon] = useState(5)
  const amount = 10000
  const preview = useProjection(amount, allocation, horizon)
  const [note, setNote] = useState<{ id: number; text: string; delta: number } | null>(null)
  const prev = useRef<{ risk: string; loss: number } | null>(null)
  const d = preview.data
  const lossNow = d?.loss_probability_by_horizon.find((x) => x.horizon_years === horizon)?.probability_of_loss

  useEffect(() => {
    if (!d || lossNow == null) return
    const before = prev.current
    prev.current = { risk: d.risk_level, loss: lossNow }
    if (!before) return
    const diff = Math.round((lossNow - before.loss) * 100)
    const riskText = before.risk !== d.risk_level ? ` Risk moved from ${RISK_STYLE[before.risk as keyof typeof RISK_STYLE].label.toLowerCase()} to ${RISK_STYLE[d.risk_level].label.toLowerCase()}.` : ''
    setNote({
      id: Date.now(),
      delta: -diff,
      text: diff === 0 ? `The chance of ending below ${inr(amount)} stayed about the same.${riskText}` : `The chance of ending below ${inr(amount)} went ${diff > 0 ? 'up' : 'down'} by ${Math.abs(diff)} points.${riskText}`,
    })
  }, [d, lossNow])

  if (catalog.error) return <ErrorState message={catalog.error.message} onRetry={catalog.reload} />
  if (!catalog.data) return <LoadingState rows={2} />
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
      <div className="space-y-4 rounded-[var(--radius-panel)] border border-line bg-canvas-deep/40 p-4">
        <p className="px-1 text-xs font-bold uppercase tracking-wider text-muted">Your mix</p>
        <HorizonPicker horizons={catalog.data.horizons} value={horizon} onChange={setHorizon} />
        <AllocationEditor assets={catalog.data.assets} allocation={allocation} onChange={setAllocation} keepTotal />
      </div>
      <div className="space-y-5">
        <section aria-labelledby="rx-h" className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 id="rx-h" className="text-lg font-extrabold">
              {inr(amount)} of fictional money over {horizon} year{horizon === 1 ? '' : 's'}
            </h2>
            {d && (
              <div className="flex flex-wrap gap-2">
                <Badge tone={RISK_STYLE[d.risk_level].tone}>{RISK_STYLE[d.risk_level].label}</Badge>
                <Badge>Diversification {Math.round(d.diversification * 100)}%</Badge>
              </div>
            )}
          </div>
          <ChangeNote note={note} />
          {d ? (
            <>
              <FanChart mc={d.monte_carlo} amount={amount} />
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {d.paths.map((p) => (
                  <div key={p.key} className="rounded-xl border border-line p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{p.label}</p>
                    <p className={cn('mt-1 text-lg font-extrabold', p.final < amount && 'text-danger-ink')}>
                      <AnimatedNumber value={p.final} format={(n) => inr(Math.round(n))} duration={0.6} />
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="rounded-xl bg-canvas p-6 text-center text-sm text-muted">Make the mix add up to 100% to see results.</p>
          )}
        </section>
        {d && (
          <section aria-labelledby="loss-h" className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <h2 id="loss-h" className="text-lg font-extrabold">
              Chance of ending below {inr(amount)}
            </h2>
            <p className="mb-3 mt-0.5 text-sm text-muted">For this same mix, held for different lengths of time.</p>
            <LossByHorizon data={d.loss_probability_by_horizon} />
          </section>
        )}
        <Disclaimer>{catalog.data.disclaimer}</Disclaimer>
      </div>
    </div>
  )
}

const TOOLS = [
  { value: 'compounding', label: 'Compounding', note: 'Small savings, many years', icon: Sprout },
  { value: 'investing', label: 'Risk & time', note: '1,000 possible futures', icon: Waves },
]

export default function ExplorePage() {
  const [tool, setTool] = useState('compounding')
  return (
    <div>
      <PageHeader
        eyebrow="Practice tools"
        title="The practice lab"
        description="Move a slider and see what changes, and why. Nothing here is saved or scored, so experiment as much as you like."
      />
      <Tabs value={tool} onValueChange={setTool}>
        <SegmentedTabs id="lab" segments={TOOLS} value={tool} className="mb-6" />
        <TabsContent value="compounding" className="outline-none">
          <CompoundingLab />
        </TabsContent>
        <TabsContent value="investing" className="outline-none">
          <RiskLab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
