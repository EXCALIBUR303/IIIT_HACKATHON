import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { inr } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Public, read-only walkthrough of the four learning stages. Local demo: nothing is saved and no account is needed. */
const STAGES = [
  {
    key: 'explorer',
    label: 'Explorer',
    grades: 'Classes 7–8',
    mission: 'Meera’s first monthly budget: needs first, then wants.',
    words: ['pocket money', 'need', 'want', 'save'],
    unlocks: 'Budget and scam-spotting missions. Short, story-led, one action per screen.',
    tool: 'Split ₹2,000 pocket money',
  },
  {
    key: 'builder',
    label: 'Builder',
    grades: 'Classes 9–10',
    mission: 'The ₹500 Money Lab: goal, surprise, inflation and a growth basket.',
    words: ['goal', 'emergency fund', 'inflation', 'UPI PIN'],
    unlocks: 'Saving, the Money Lab, digital-payment scams and the Banking Explorer.',
    tool: 'Saving for a goal',
  },
  {
    key: 'future_planner',
    label: 'Future Planner',
    grades: 'Classes 11–12',
    mission: 'Allocate across fictional baskets, face a fall, and see 1,000 possible futures.',
    words: ['compounding', 'diversification', 'time horizon', 'liquidity'],
    unlocks: 'Investing missions, then Portfolio Quest once an investing mission is done.',
    tool: 'Compounding explorer',
  },
  {
    key: 'investor_sandbox',
    label: 'Investor Sandbox',
    grades: 'Age 18',
    mission: 'A calm practice portfolio with strong guardrails and honest limits.',
    words: ['risk and return', 'rebalancing', 'cost awareness', 'long-term discipline'],
    unlocks: 'Everything above. Single-company instruments only after diversification is understood.',
    tool: 'Compounding explorer',
  },
] as const

function Compounding({ monthly, years }: { monthly: number; years: number }) {
  const rate = 0.06 / 12
  let compound = 0
  for (let m = 0; m < years * 12; m++) compound = (compound + monthly) * (1 + rate)
  const simple = monthly * years * 12 * (1 + 0.06 * (years / 2))
  const put = monthly * years * 12
  return (
    <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
      <div className="rounded-xl bg-canvas p-3"><dt className="text-xs text-muted">You put in</dt><dd className="font-bold tabular">{inr(put)}</dd></div>
      <div className="rounded-xl bg-canvas p-3"><dt className="text-xs text-muted">Simple interest</dt><dd className="font-bold tabular">{inr(simple)}</dd></div>
      <div className="rounded-xl bg-primary-soft p-3"><dt className="text-xs text-primary-ink">Compounding</dt><dd className="font-bold tabular text-primary">{inr(compound)}</dd></div>
    </dl>
  )
}

export default function JourneyDemoPage() {
  const [active, setActive] = useState(2)
  const [monthly, setMonthly] = useState(200)
  const [years, setYears] = useState(5)
  const s = STAGES[active]
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <Link to="/"><Logo /></Link>
        <Button asChild size="sm"><Link to="/register">Start learning</Link></Button>
      </header>
      <main id="main" className="mx-auto max-w-4xl space-y-6 px-4 pb-16">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Local demo · nothing is saved</p>
          <h1 className="mt-1 text-3xl font-extrabold">How RupeeRise grows with you</h1>
          <p className="mt-2 max-w-2xl text-ink-soft">Four stages, from first pocket money to a calm practice portfolio. What opens next depends on what you show you understand, never on how much fictional money you hold.</p>
        </div>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Stages">
          {STAGES.map((st, i) => (
            <li key={st.key}>
              <button
                onClick={() => setActive(i)}
                aria-current={i === active ? 'step' : undefined}
                className={cn('h-full min-h-11 w-full rounded-xl border p-3 text-left', i === active ? 'border-primary bg-primary-soft' : 'border-line-strong bg-surface hover:bg-canvas')}
              >
                <span className="block text-sm font-bold">{st.label}</span>
                <span className="block text-xs text-muted">{st.grades}</span>
              </button>
            </li>
          ))}
        </ol>
        <Card className="p-5 sm:p-7">
          <h2 className="text-xl font-extrabold">{s.label}</h2>
          <p className="mt-1 text-ink-soft">{s.mission}</p>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted">Words you meet</p>
          <ul className="mt-1 flex flex-wrap gap-2">{s.words.map((w) => <li key={w} className="rounded-full bg-canvas px-3 py-1 text-sm font-semibold">{w}</li>)}</ul>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted">What opens</p>
          <p className="text-ink-soft">{s.unlocks}</p>
          {active >= 1 && (
            <div className="mt-6 rounded-xl border border-line p-4">
              <h3 className="font-bold">Try it: {s.tool}</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">Monthly saving: <span className="tabular">{inr(monthly)}</span>
                  <input type="range" min={50} max={2000} step={50} value={monthly} onChange={(e) => setMonthly(Number(e.target.value))} className="mt-2 block h-11 w-full" />
                </label>
                <label className="text-sm font-semibold">Years: <span className="tabular">{years}</span>
                  <input type="range" min={1} max={15} value={years} onChange={(e) => setYears(Number(e.target.value))} className="mt-2 block h-11 w-full" />
                </label>
              </div>
              <Compounding monthly={monthly} years={years} />
              <p className="mt-3 text-xs text-muted">Illustrative 6% a year, fictional rupees. Real rates differ. This is education, not advice.</p>
            </div>
          )}
          <Button asChild className="mt-6"><Link to="/register">Try the real thing <ArrowRight /></Link></Button>
        </Card>
      </main>
    </div>
  )
}
