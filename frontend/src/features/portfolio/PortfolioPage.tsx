import { ArrowRight, CalendarClock, LineChart as LineChartIcon, Lock, RotateCcw, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { DomainChip } from '@/components/common/rewards'
import { ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Field, Input } from '@/components/ui/form'
import { api } from '@/lib/api/endpoints'
import { ApiError } from '@/lib/api/client'
import type { PortfolioEvent, PortfolioInstrument, PortfolioView, TradeQuote } from '@/lib/api/types'
import { inr, inrPaise, relativeDate, signedPaise } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

const newRequestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '') : `${Date.now()}${Math.random().toString(16).slice(2)}`.padEnd(16, '0')

const RISK: Record<PortfolioInstrument['risk_level'], string> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
  very_high: 'Very high risk',
}

const KIND_LABEL: Record<string, string> = {
  open: 'Started with practice cash',
  buy: 'Bought',
  sell: 'Sold',
  transfer_in: 'Moved in from wallet',
  advance: 'Moved to next year',
  reset: 'Practice reset',
}

function Readout({ label, value, tone, note }: { label: string; value: string; tone?: 'gain' | 'loss'; note?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-[0.68rem] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className={cn('mt-1 text-2xl font-extrabold tabular', tone === 'gain' && 'text-accent-ink', tone === 'loss' && 'text-danger-ink')}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  )
}

export default function PortfolioPage() {
  const state = useAsync(() => api.portfolio.get(), [])
  const [view, setView] = useState<PortfolioView | null>(null)
  const current = view ?? state.data
  const [event, setEvent] = useState<PortfolioEvent | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<PortfolioView>) {
    setBusy(true)
    setError(null)
    try {
      const next = await action()
      setView(next)
      setEvent(next.event ?? null)
      return next
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong')
      return null
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Fictional portfolio"
        title="Portfolio Quest"
        description="Practise holding, buying and selling with pretend money while fictional markets move. It teaches judgement. It does not predict or recommend anything real."
        actions={<DomainChip domain="portfolio" />}
      />
      {state.loading && !current && <LoadingState rows={3} />}
      {state.error && !current && <ErrorState message={state.error.message} onRetry={state.reload} />}
      {current && (
        <PortfolioBody view={current} event={event} busy={busy} error={error} run={run} clearError={() => setError(null)} />
      )}
    </div>
  )
}

function PortfolioBody({ view, event, busy, error, run, clearError }: {
  view: PortfolioView
  event: PortfolioEvent | null
  busy: boolean
  error: string | null
  run: (action: () => Promise<PortfolioView>) => Promise<PortfolioView | null>
  clearError: () => void
}) {
  const p = view.portfolio
  if (!view.access.open) {
    return (
      <Card className="p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-line text-muted" aria-hidden>
            <Lock className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-extrabold">Not unlocked yet</h2>
            <p className="mt-1 text-ink-soft">{view.access.reason}</p>
            <Button asChild className="mt-4">
              <Link to="/app/learn">
                Go to your missions <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </Card>
    )
  }
  if (!p) {
    return (
      <Card className="p-6 sm:p-8">
        <h2 className="text-xl font-extrabold">Start with ₹10,000 of practice cash</h2>
        <p className="mt-2 max-w-2xl text-ink-soft">
          You can buy fictional baskets that move through up to 10 pretend years. Every action is recorded, you can reset any time, and nothing here is real money or
          real prices. Single-company instruments stay locked until you show you understand diversification.
        </p>
        {error && <p role="alert" className="mt-3 text-sm font-medium text-danger-ink">{error}</p>}
        <Button className="mt-5" loading={busy} onClick={() => run(() => api.portfolio.open(newRequestId()))}>
          <LineChartIcon /> Start Portfolio Quest
        </Button>
      </Card>
    )
  }
  const gain = p.gain_paise
  return (
    <div className="space-y-6">
      <section aria-label="Portfolio summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Readout label="Practice cash" value={inrPaise(p.cash_paise)} />
        <Readout label="Invested value" value={inrPaise(p.invested_paise)} />
        <Readout label="Total value" value={inrPaise(p.total_paise)} note={`Put in so far: ${inrPaise(p.contributed_paise)}`} />
        <Readout
          label="Simulated gain / loss"
          value={signedPaise(gain)}
          tone={gain > 0 ? 'gain' : gain < 0 ? 'loss' : undefined}
          note="Practice result only"
        />
      </section>

      <YearPanel view={view} event={event} busy={busy} error={error} run={run} />
      <ValueChart view={view} />
      <Market view={view} run={run} />
      <Holdings view={view} run={run} />
      <TransferPanel view={view} run={run} />
      <Transactions view={view} />
      <ResetPanel run={run} busy={busy} clearError={clearError} />
      <p className="text-xs text-muted">{view.disclaimer}</p>
    </div>
  )
}

function YearPanel({ view, event, busy, error, run }: {
  view: PortfolioView
  event: PortfolioEvent | null
  busy: boolean
  error: string | null
  run: (a: () => Promise<PortfolioView>) => Promise<PortfolioView | null>
}) {
  const p = view.portfolio!
  const [open, setOpen] = useState(false)
  const rid = useRef(newRequestId())
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Run {p.run_number}</p>
          <h2 className="flex items-center gap-2 text-xl font-extrabold">
            <CalendarClock className="size-5 text-investing" aria-hidden /> Year {p.round} of {p.max_round}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {p.complete ? 'This run is complete. Reset to try a different strategy.' : 'Trade now at today’s prices, then let a year pass to see what the fictional market does.'}
          </p>
        </div>
        {!p.complete && (
          <Button onClick={() => setOpen(true)} disabled={busy}>
            Let a year pass <ArrowRight />
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Move to the next year?"
        description="Prices will change. You cannot go back, but you can reset the run to practise again."
        confirmLabel="Yes, next year"
        busy={busy}
        error={error}
        onConfirm={async () => {
          const out = await run(() => api.portfolio.advance(rid.current))
          if (out) {
            rid.current = newRequestId()
            setOpen(false)
          }
        }}
      />
      {event && (
        <div className="mt-5 rounded-xl border border-investing/30 bg-investing-soft p-4" role="status">
          <p className="font-bold text-ink">{event.headline}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            {event.reflection.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function ValueChart({ view }: { view: PortfolioView }) {
  const history = view.portfolio!.history
  if (history.length < 2) return null
  const data = history.map((h) => ({ year: `Y${h.round}`, value: h.total_paise / 100 }))
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-extrabold">Total value by year</h2>
      <div className="mt-3 h-56" role="img" aria-label={`Total portfolio value by year: ${data.map((d) => `${d.year} ${inr(d.value)}`).join(', ')}`}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis dataKey="year" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickFormatter={(v: number) => inr(v)} width={64} tickLine={false} axisLine={false} fontSize={12} />
            <Tooltip formatter={(v) => inr(Number(v))} />
            <Line type="monotone" dataKey="value" stroke="var(--color-investing)" strokeWidth={2.5} dot />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Total value by year</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.year}>
              <th scope="row">{d.year}</th>
              <td>{inr(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function Market({ view, run }: { view: PortfolioView; run: (a: () => Promise<PortfolioView>) => Promise<PortfolioView | null> }) {
  const [target, setTarget] = useState<{ instrument: PortfolioInstrument; side: 'buy' | 'sell' } | null>(null)
  return (
    <section aria-labelledby="market-title">
      <h2 id="market-title" className="mb-3 text-lg font-extrabold">
        Fictional market
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {view.instruments.map((i) => {
          const hist = i.price_history_paise ?? [i.price_paise]
          const change = hist.length > 1 ? hist[hist.length - 1] - hist[0] : 0
          return (
            <Card key={i.key} className={cn('flex flex-col p-4', i.locked && 'opacity-80')}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">{i.label}</h3>
                  <p className="text-xs font-semibold text-investing">{RISK[i.risk_level]}</p>
                </div>
                <div className="text-right">
                  <p className="tabular text-lg font-extrabold">{inrPaise(i.price_paise)}</p>
                  <p className={cn('text-xs font-semibold tabular', change > 0 ? 'text-accent-ink' : change < 0 ? 'text-danger-ink' : 'text-muted')}>
                    {change === 0 ? 'since start: no change' : `since start ${signedPaise(change)}`}
                  </p>
                </div>
              </div>
              <p className="mt-2 flex-1 text-sm text-ink-soft">{i.description}</p>
              {i.locked ? (
                <p className="mt-3 flex items-start gap-2 text-xs text-muted">
                  <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {i.lock_reason}
                </p>
              ) : (
                <Button size="sm" variant="secondary" className="mt-3 self-start" onClick={() => setTarget({ instrument: i, side: 'buy' })} disabled={view.portfolio!.cash_paise < i.price_paise}>
                  Buy {i.label}
                </Button>
              )}
            </Card>
          )
        })}
      </div>
      {target && <TradeDialog view={view} target={target} onClose={() => setTarget(null)} run={run} />}
    </section>
  )
}

function Holdings({ view, run }: { view: PortfolioView; run: (a: () => Promise<PortfolioView>) => Promise<PortfolioView | null> }) {
  const rows = view.portfolio!.holdings
  const [sell, setSell] = useState<PortfolioInstrument | null>(null)
  const byKey = Object.fromEntries(view.instruments.map((i) => [i.key, i]))
  return (
    <section aria-labelledby="holdings-title">
      <h2 id="holdings-title" className="mb-3 text-lg font-extrabold">
        Your holdings
      </h2>
      {rows.length === 0 ? (
        <Card className="p-5 text-sm text-ink-soft">You hold only cash right now. Buy something from the fictional market above to see how it behaves as years pass.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <caption className="sr-only">Current holdings</caption>
            <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="p-3">Instrument</th>
                <th scope="col" className="p-3 text-right">Units</th>
                <th scope="col" className="p-3 text-right">Avg cost</th>
                <th scope="col" className="p-3 text-right">Value</th>
                <th scope="col" className="p-3 text-right">Gain / loss</th>
                <th scope="col" className="p-3 text-right">Share</th>
                <th scope="col" className="p-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular">
              {rows.map((r) => (
                <tr key={r.instrument_key}>
                  <th scope="row" className="p-3 font-semibold">{byKey[r.instrument_key]?.label ?? r.instrument_key}</th>
                  <td className="p-3 text-right">{r.quantity}</td>
                  <td className="p-3 text-right">{inrPaise(r.avg_cost_paise)}</td>
                  <td className="p-3 text-right font-semibold">{inrPaise(r.value_paise)}</td>
                  <td className={cn('p-3 text-right font-semibold', r.gain_paise > 0 ? 'text-accent-ink' : r.gain_paise < 0 ? 'text-danger-ink' : '')}>{signedPaise(r.gain_paise)}</td>
                  <td className="p-3 text-right">{r.weight_pct}%</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setSell(byKey[r.instrument_key])}>
                      Sell
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {sell && <TradeDialog view={view} target={{ instrument: sell, side: 'sell' }} onClose={() => setSell(null)} run={run} />}
    </section>
  )
}

function TradeDialog({ view, target, onClose, run }: {
  view: PortfolioView
  target: { instrument: PortfolioInstrument; side: 'buy' | 'sell' }
  onClose: () => void
  run: (a: () => Promise<PortfolioView>) => Promise<PortfolioView | null>
}) {
  const { instrument, side } = target
  const [qty, setQty] = useState('1')
  const [quote, setQuote] = useState<TradeQuote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const rid = useRef(newRequestId())
  const quantity = Number(qty)
  const valid = Number.isInteger(quantity) && quantity >= 1

  async function getQuote(next: string) {
    setQty(next)
    setQuote(null)
    const n = Number(next)
    if (!Number.isInteger(n) || n < 1) {
      setQuoteError('Enter a whole number of units, at least 1.')
      return
    }
    try {
      setQuote(await api.portfolio.quote({ instrument_key: instrument.key, side, quantity: n }))
      setQuoteError(null)
    } catch (e) {
      setQuoteError(e instanceof ApiError ? e.message : 'Could not price this order')
    }
  }

  useEffect(() => {
    let alive = true
    api.portfolio
      .quote({ instrument_key: instrument.key, side, quantity: 1 })
      .then((q) => alive && setQuote(q))
      .catch((e: unknown) => alive && setQuoteError(e instanceof ApiError ? e.message : 'Could not price this order'))
    return () => {
      alive = false
    }
  }, [instrument.key, side])

  async function confirm() {
    setBusy(true)
    const out = await run(() => api.portfolio.trade({ request_id: rid.current, instrument_key: instrument.key, side, quantity }))
    setBusy(false)
    if (out) onClose()
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${side === 'buy' ? 'Buy' : 'Sell'} ${instrument.label}`}
      description={`Practice order at ${inrPaise(instrument.price_paise)} per unit. Nothing here is real money.`}
      confirmLabel={side === 'buy' ? 'Confirm purchase' : 'Confirm sale'}
      busy={busy}
      error={quoteError}
      onConfirm={() => valid && quote && confirm()}
    >
      <Field label="Number of units" hint="Whole units only">
        {(f) => <Input {...f} inputMode="numeric" value={qty} onChange={(e) => void getQuote(e.target.value)} />}
      </Field>
      {quote && (
        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-muted">{side === 'buy' ? 'Total cost' : 'Total received'}</dt><dd className="tabular font-bold">{inrPaise(quote.total_paise)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Practice cash after</dt><dd className="tabular font-bold">{inrPaise(quote.cash_after_paise)}</dd></div>
        </dl>
      )}
      {quote?.warnings.map((w) => (
        <Alert key={w} tone="warning" className="mt-3">{w}</Alert>
      ))}
      <span className="sr-only">{view.disclaimer}</span>
    </ConfirmDialog>
  )
}

function TransferPanel({ view, run }: { view: PortfolioView; run: (a: () => Promise<PortfolioView>) => Promise<PortfolioView | null> }) {
  const p = view.portfolio!
  const [amount, setAmount] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const rid = useRef(newRequestId())
  const n = Number(amount)
  const valid = Number.isInteger(n) && n >= 1 && n <= view.wallet_balance && n <= p.transfer_remaining_rupees
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-extrabold">Add from your learning wallet</h2>
      <p className="mt-1 text-sm text-ink-soft">
        You may move some earned learning money into this practice portfolio. Transfers are one-way and are not refunded on reset. Wallet balance: <strong className="tabular">{inr(view.wallet_balance)}</strong>
        . You can still move up to <strong className="tabular">{inr(p.transfer_remaining_rupees)}</strong> this run.
      </p>
      <div className="mt-4 flex max-w-sm items-end gap-2">
        <div className="flex-1">
          <Field label="Amount (whole rupees)">
            {(f) => <Input {...f} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 50" />}
          </Field>
        </div>
        <Button variant="secondary" disabled={!valid} onClick={() => { setErr(null); setOpen(true) }}>
          <Send /> Move
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Move ${inr(n)} into your portfolio?`}
        description="This takes fictional learning money out of your wallet. It cannot be moved back."
        confirmLabel="Yes, move it"
        busy={busy}
        error={err}
        onConfirm={async () => {
          setBusy(true)
          const out = await run(() => api.portfolio.transfer(rid.current, n))
          setBusy(false)
          if (out) {
            rid.current = newRequestId()
            setAmount('')
            setOpen(false)
          } else setErr('That transfer could not be completed.')
        }}
      />
    </Card>
  )
}

function Transactions({ view }: { view: PortfolioView }) {
  if (view.transactions.length === 0) return null
  const byKey = Object.fromEntries(view.instruments.map((i) => [i.key, i.label]))
  return (
    <section aria-labelledby="tx-title">
      <h2 id="tx-title" className="mb-3 text-lg font-extrabold">
        Transaction history
      </h2>
      <Card>
        <ul className="divide-y divide-line">
          {view.transactions.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">
                  {KIND_LABEL[t.kind]}
                  {t.instrument_key && <> {t.quantity} × {byKey[t.instrument_key] ?? t.instrument_key}</>}
                </p>
                <p className="text-xs text-muted">Run {t.run_number} · year {t.round} · {relativeDate(t.created_at)}{t.note ? ` · ${t.note}` : ''}</p>
              </div>
              <p className="tabular shrink-0 font-semibold">{t.amount_paise === 0 ? '—' : signedPaise(t.amount_paise)}</p>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}

function ResetPanel({ run, busy, clearError }: { run: (a: () => Promise<PortfolioView>) => Promise<PortfolioView | null>; busy: boolean; clearError: () => void }) {
  const [open, setOpen] = useState(false)
  const rid = useRef(newRequestId())
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line-strong p-4">
      <p className="text-sm text-ink-soft">Want to try a different strategy? Reset starts a fresh market run with ₹10,000 practice cash.</p>
      <Button variant="outline" onClick={() => { clearError(); setOpen(true) }}>
        <RotateCcw /> Reset practice run
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Start a new practice run?"
        description="Holdings are cleared and cash goes back to the starting amount. Your history stays, and any wallet money you moved in earlier is not refunded."
        confirmLabel="Reset"
        danger
        busy={busy}
        onConfirm={async () => {
          const out = await run(() => api.portfolio.reset(rid.current))
          if (out) {
            rid.current = newRequestId()
            setOpen(false)
          }
        }}
      />
    </div>
  )
}
