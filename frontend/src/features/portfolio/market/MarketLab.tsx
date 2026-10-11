import { ArrowDown, Info, LineChart, Newspaper, ShieldCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, useState, type ReactNode } from 'react'
import { ErrorState, LoadingState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ApiError } from '@/lib/api/client'
import { api } from '@/lib/api/endpoints'
import type { LabSession } from '@/lib/api/types'
import { inr } from '@/lib/format'
import { EASE_OUT } from '@/lib/motion'
import { useAsync } from '@/lib/useAsync'
import { DataStatusBadge } from './bits'
import { newRequestId, watchRows } from './lib'
import { DebriefCard } from './DebriefCard'
import { DecisionJournal } from './DecisionJournal'
import { HoldingsTable } from './HoldingsTable'
import { MarketNewsFeed } from './MarketNewsFeed'
import { PortfolioSummary } from './PortfolioSummary'
import { RewardsPanel } from './RewardsPanel'
import { ScenarioPicker } from './ScenarioPicker'
import { ScenarioTimeline } from './ScenarioTimeline'
import { StockDrawer } from './StockDrawer'
import { StreakHeatmap } from './StreakHeatmap'
import { WatchlistPanel } from './WatchlistPanel'

/** Reveal lower sections once as they scroll into view (Motion's whileInView, reduced-motion safe). */
function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5, ease: EASE_OUT }}>
      {children}
    </motion.div>
  )
}

/** Portfolio Quest's market simulator: real company names, fictional money, news-driven days. */
export function MarketLab() {
  const overview = useAsync(() => api.market.overview(), [])
  const market = useAsync(() => api.market.data(), [])
  const news = useAsync(() => api.market.news(), [])
  const streak = useAsync(() => api.market.streak(), [])
  const [local, setLocal] = useState<LabSession | null | undefined>(undefined)
  const session = local === undefined ? overview.data?.session ?? null : local
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const advanceId = useRef(newRequestId())
  const debriefRef = useRef<HTMLElement>(null)
  const scenariosRef = useRef<HTMLDivElement>(null)

  if (overview.loading && !overview.data) return <LoadingState rows={4} />
  if (overview.error && !overview.data) return <ErrorState message={overview.error.message} onRetry={overview.reload} />
  const ov = overview.data!

  const quotes = market.data?.quotes ?? []
  const names = Object.fromEntries((session?.companies ?? quotes).map((c) => [c.key, c.name]))

  function onSession(next: LabSession) {
    setLocal(next)
    streak.reload()
    if (next.status === 'completed') overview.reload()
  }

  async function begin(key: string) {
    setBusyKey(key)
    setError(null)
    try {
      const out = await api.market.start(newRequestId(), key)
      overview.setData(out)
      setLocal(out.session)
      setPending(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start that scenario.')
    } finally {
      setBusyKey(null)
    }
  }

  function requestStart(key: string) {
    if (session && session.status === 'active') setPending(key)
    else void begin(key)
  }

  async function advance() {
    setBusy(true)
    setError(null)
    try {
      const next = await api.market.advance(advanceId.current)
      advanceId.current = newRequestId()
      setLocal(next)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The market could not move on.')
    } finally {
      setBusy(false)
    }
  }

  function toDebrief() {
    debriefRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    debriefRef.current?.focus({ preventScroll: true })
  }

  const status = (
    <div className="flex flex-wrap items-center gap-2">
      {market.data && <DataStatusBadge what="Reference prices" status={market.data.status} />}
      {news.data && <DataStatusBadge what="News" status={news.data.status} />}
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink-soft">
        <ShieldCheck className="size-3.5 text-accent-ink" aria-hidden /> Practice money only · Not financial advice
      </span>
      {session && (
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => scenariosRef.current?.scrollIntoView({ behavior: 'smooth' })}>
          Change scenario <ArrowDown />
        </Button>
      )}
    </div>
  )

  const scenarios = (
    <div ref={scenariosRef} className="scroll-mt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-extrabold">{session ? 'Scenarios' : 'Choose your first market scenario'}</h2>
          <p className="mt-1 text-sm text-ink-soft">Each starts with {inr(ov.starting_cash_paise / 100)} of practice cash and teaches one market idea.</p>
        </div>
      </div>
      <ScenarioPicker scenarios={ov.scenarios} activeKey={session?.status === 'active' ? session.scenario.key : null} busyKey={busyKey} onStart={requestStart} />
    </div>
  )

  return (
    <div className="space-y-6">
      {status}
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger-ink">
          {error}
        </p>
      )}

      {session ? (
        <>
          <PortfolioSummary session={session} onAdvance={advance} onFinish={toDebrief} busy={busy} />
          {session.debrief && <DebriefCard ref={debriefRef} key={session.id + session.status} session={session} onSession={onSession} onPlayAnother={() => scenariosRef.current?.scrollIntoView({ behavior: 'smooth' })} />}
          <ScenarioTimeline session={session} onOpenCompany={setOpenKey} />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="min-w-0 space-y-6 xl:col-span-4">
              <WatchlistPanel rows={watchRows(quotes, session.companies)} onOpen={setOpenKey} simulated />
              <DecisionJournal entries={session.journal} onOpen={setOpenKey} />
            </div>
            <div className="min-w-0 space-y-6 xl:col-span-8">
              <HoldingsTable session={session} onOpen={setOpenKey} />
              <MarketNewsFeed wide feed={news.data} events={session.events} names={names} onOpen={setOpenKey} />
            </div>
          </div>
        </>
      ) : (
        <>
          <Intro onStart={() => requestStart(ov.scenarios[0].key)} busy={busyKey !== null} cash={ov.starting_cash_paise} limit={ov.max_weight_pct} />
          {scenarios}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="min-w-0 xl:col-span-5">{quotes.length > 0 && <WatchlistPanel rows={watchRows(quotes)} onOpen={setOpenKey} simulated={false} />}</div>
            <MarketNewsFeed className="xl:col-span-7" wide feed={news.data} events={[]} names={names} onOpen={setOpenKey} />
          </div>
        </>
      )}

      <Reveal className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7">{streak.data && <StreakHeatmap streak={streak.data} />}</div>
        <div className="min-w-0 xl:col-span-5">
          <RewardsPanel balance={ov.wallet_balance} scenarios={ov.scenarios} />
        </div>
      </Reveal>

      {session && <Reveal>{scenarios}</Reveal>}

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          {ov.disclaimer} {market.data?.note}
        </span>
      </p>

      <StockDrawer companyKey={openKey} onClose={() => setOpenKey(null)} session={session?.status === 'active' ? session : null} quotes={quotes} news={news.data?.items ?? []} reasons={ov.reasons} onSession={onSession} />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title="Switch scenario?"
        description="Your current scenario ends here. Its decisions stay in your history, but you can’t come back to it."
        confirmLabel="Start new scenario"
        busy={busyKey !== null}
        onConfirm={() => pending && void begin(pending)}
      />
    </div>
  )
}

function Intro({ onStart, busy, cash, limit }: { onStart: () => void; busy: boolean; cash: number; limit: number }) {
  const steps = [
    { icon: Newspaper, title: 'Read the news', text: 'Each day brings headlines. Some matter to your companies, some do not.' },
    { icon: LineChart, title: 'Buy, sell or hold', text: `Trade real company names with fictional money. One company can be at most ${limit}% of your portfolio.` },
    { icon: ShieldCheck, title: 'See what happened', text: 'Your journal shows what each decision did to your money, and why.' },
  ]
  return (
    <section aria-labelledby="pq-intro" className="relative overflow-hidden rounded-[var(--radius-panel)] bg-navy p-6 text-white shadow-[var(--shadow-hero)] sm:p-8">
      <div className="bg-grid-dark absolute inset-0 opacity-60" aria-hidden />
      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-200">Market lab · simulated</p>
          <h2 id="pq-intro" className="mt-2 text-3xl font-extrabold leading-tight text-white sm:text-4xl">Feel a market move before it costs real money.</h2>
          <p className="mt-3 max-w-lg text-slate-300">
            Start with {inr(cash / 100)} of practice cash, a watchlist of nine well-known Indian companies and a few days of news. Prices start from reference closes and then follow a simulation.
          </p>
          <button
            type="button"
            onClick={onStart}
            disabled={busy}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-navy transition-[background-color,transform] hover:bg-emerald-300 active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? 'Opening the market…' : 'Start market day'}
          </button>
        </div>
        <ol className="grid gap-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10 text-teal-200">
                <s.icon className="size-4" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-bold">
                  {i + 1}. {s.title}
                </span>
                <span className="mt-0.5 block text-sm text-slate-300">{s.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
