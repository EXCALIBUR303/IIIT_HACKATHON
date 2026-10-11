import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Sheet } from '@/components/ui/sheet'
import type { LabEvent, LabSession, NewsItem, ReferenceQuote } from '@/lib/api/types'
import { inrPaise } from '@/lib/format'
import { prefersReducedMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { CategoryChip, Delta, ImpactChip } from './bits'
import { TradeTicket } from './TradeTicket'

const RISK: Record<string, string> = { low: 'Lower risk', medium: 'Medium risk', high: 'Higher risk' }

/** One company: reference history into the simulation, your position, related news, and the ticket. */
export function StockDrawer({ companyKey, onClose, session, quotes, news, reasons, onSession }: {
  companyKey: string | null
  onClose: () => void
  session: LabSession | null
  quotes: ReferenceQuote[]
  news: NewsItem[]
  reasons: { key: string; label: string }[]
  onSession: (s: LabSession) => void
}) {
  const quote = quotes.find((q) => q.key === companyKey)
  const company = session?.companies.find((c) => c.key === companyKey)
  const holding = session?.holdings.find((h) => h.key === companyKey)
  const name = company?.name ?? quote?.name ?? ''
  const events: LabEvent[] = session?.events.filter((e) => companyKey && e.affected.includes(companyKey)) ?? []
  const related = news.filter((n) => companyKey && n.affected.includes(companyKey)).slice(0, 3)

  const refPoints = (quote?.history ?? []).map((h) => ({ label: h.date.slice(5), ref: h.close_paise / 100 }))
  const simPoints = (company?.history_paise ?? []).map((p, i) => ({ label: session!.scenario.labels[i], sim: p / 100 }))
  // Join the two lines at the reference close where the simulation starts.
  if (refPoints.length && simPoints.length) simPoints[0] = { ...simPoints[0], ...{ ref: refPoints[refPoints.length - 1].ref } }
  const data = [...refPoints.slice(0, -1), ...(simPoints.length ? simPoints : refPoints.slice(-1))]
  const reduce = prefersReducedMotion()

  return (
    <Sheet open={!!companyKey} onOpenChange={(o) => !o && onClose()} title={name} description={quote ? `${quote.symbol} · ${quote.sector}` : undefined}>
      {companyKey && (
        <div className="space-y-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-3xl font-extrabold tabular">{inrPaise(company?.price_paise ?? quote?.price_paise ?? 0)}</p>
              <p className="mt-0.5 text-sm">
                <Delta pct={company?.change_pct ?? quote?.change_pct ?? 0} /> <span className="text-muted">{session ? (session.scenario.unit === 'year' ? 'this year' : 'today (simulated)') : `reference day, ${quote?.as_of ?? ''}`}</span>
              </p>
            </div>
            <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-ink-soft">{RISK[quote?.risk_level ?? 'medium']}</span>
          </div>
          <p className="text-sm text-ink-soft">{quote?.about}</p>

          {data.length > 1 && (
            <div>
              <div className="h-44" role="img" aria-label={`${name}: reference closes${simPoints.length ? ' followed by simulated prices' : ''}.`}>
                <ResponsiveContainer>
                  <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--color-line)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} interval="preserveStartEnd" minTickGap={24} />
                    <YAxis domain={['auto', 'auto']} width={48} tickLine={false} axisLine={false} fontSize={10} tickFormatter={(v: number) => `₹${Math.round(v)}`} />
                    <Tooltip formatter={(v, k) => [inrPaise(Math.round(Number(v) * 100)), k === 'ref' ? 'Reference close' : 'Simulated']} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    {simPoints.length > 0 && <ReferenceLine x={simPoints[0].label} stroke="var(--color-line-strong)" strokeDasharray="3 3" />}
                    <Line dataKey="ref" stroke="var(--color-muted)" strokeWidth={1.5} dot={false} isAnimationActive={!reduce} connectNulls />
                    <Line dataKey="sim" stroke="var(--color-investing)" strokeWidth={2.5} dot={{ r: 2.5 }} isAnimationActive={!reduce} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-xs text-muted">
                Grey: reference closes ({quote?.source === 'demo' ? 'demo data' : 'delayed real data'}).{simPoints.length ? ' Teal: this scenario’s simulated prices.' : ''}
              </p>
            </div>
          )}

          {holding && (
            <div className="grid grid-cols-3 gap-3 rounded-2xl border border-line p-3 text-sm">
              <Mini label="You hold" value={`${holding.quantity} shares`} />
              <Mini label="Average price" value={inrPaise(holding.avg_cost_paise)} />
              <Mini label="Gain / loss" value={`${holding.pnl_paise >= 0 ? '▲ +' : '▼ −'}${inrPaise(Math.abs(holding.pnl_paise))}`} tone={holding.pnl_paise > 0 ? 'gain' : holding.pnl_paise < 0 ? 'loss' : undefined} />
            </div>
          )}

          {(events.length > 0 || related.length > 0) && (
            <div>
              <h3 className="text-sm font-bold">News about {name}</h3>
              <ul className="mt-2 space-y-2">
                {events.map((e) => (
                  <li key={e.headline} className="rounded-xl border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <CategoryChip category={e.category} />
                      <ImpactChip impact={e.impact} />
                      <span className="text-[11px] text-muted">{e.label} · fictional event</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold">{e.headline}</p>
                  </li>
                ))}
                {related.map((n) => (
                  <li key={n.id} className="rounded-xl border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <CategoryChip category={n.category} />
                      <ImpactChip impact={n.impact} />
                      <span className="text-[11px] text-muted">{n.is_demo ? 'Demo explainer' : n.source}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold">{n.title}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {session && company && session.status === 'active' ? (
            <div className="border-t border-line pt-5">
              <h3 className="mb-3 text-sm font-bold">Practice ticket</h3>
              <TradeTicket key={`${company.key}-${session.step}`} company={company} session={session} reasons={reasons} onDone={onSession} initialSide="buy" />
            </div>
          ) : (
            <p className="rounded-xl bg-canvas p-3 text-sm text-ink-soft">Start a scenario to practise buying, selling or holding {name} with fictional money.</p>
          )}
        </div>
      )}
    </Sheet>
  )
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: 'gain' | 'loss' }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={cn('truncate font-bold tabular', tone === 'gain' && 'text-accent-ink', tone === 'loss' && 'text-danger-ink')}>{value}</p>
    </div>
  )
}
