import { useEffect, useState } from 'react'
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api/endpoints'
import type { Asset, InvestmentProjection, MonteCarlo } from '@/lib/api/types'
import { inr } from '@/lib/format'
import { cn } from '@/lib/utils'

export const RISK_STYLE: Record<Asset['risk_level'], { label: string; tone: 'success' | 'primary' | 'warning' | 'danger' }> = {
  low: { label: 'Low risk', tone: 'success' },
  medium: { label: 'Medium risk', tone: 'primary' },
  high: { label: 'High risk', tone: 'warning' },
  very_high: { label: 'Very high risk', tone: 'danger' },
}

export function AllocationEditor({ assets, allocation, onChange }: {
  assets: Asset[]
  allocation: Record<string, number>
  onChange: (next: Record<string, number>) => void
}) {
  const total = Object.values(allocation).reduce((a, b) => a + b, 0)
  return (
    <div className="space-y-3">
      {assets.map((a) => {
        const value = allocation[a.key] ?? 0
        return (
          <div key={a.key} className="rounded-xl border border-line bg-surface p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={`asset-${a.key}`} className="font-semibold">
                {a.label}
              </label>
              <div className="flex items-center gap-2">
                <Badge tone={RISK_STYLE[a.risk_level].tone}>{RISK_STYLE[a.risk_level].label}</Badge>
                <span className="tabular w-12 text-right text-sm font-bold">{value}%</span>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted">{a.description}</p>
            <input
              id={`asset-${a.key}`}
              type="range"
              min={0}
              max={100}
              step={5}
              value={value}
              className="rr-range mt-3 w-full"
              style={{ ['--range-color' as string]: 'var(--color-investing)', ['--range-fill' as string]: `${value}%` }}
              onChange={(e) => onChange({ ...allocation, [a.key]: Number(e.target.value) })}
            />
          </div>
        )
      })}
      <p
        className={cn('rounded-xl p-3 text-sm font-semibold', total === 100 ? 'bg-accent-soft text-accent-ink' : 'bg-warning-soft text-warning-ink')}
        aria-live="polite"
      >
        Total: {total}% {total === 100 ? '✓ ready' : total < 100 ? `(add ${100 - total}% more)` : `(remove ${total - 100}%)`}
      </p>
    </div>
  )
}

export function HorizonPicker({ horizons, value, onChange }: { horizons: number[]; value: number; onChange: (h: number) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold">When will you need this money?</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {horizons.map((h) => (
          <button
            key={h}
            type="button"
            role="radio"
            aria-checked={value === h}
            onClick={() => onChange(h)}
            className={cn(
              'rounded-xl border-2 px-4 py-2 text-sm font-semibold transition-colors',
              value === h ? 'border-investing bg-investing-soft text-investing' : 'border-line bg-surface hover:border-line-strong',
            )}
          >
            In {h} year{h > 1 ? 's' : ''}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export function FanChart({ mc, amount }: { mc: MonteCarlo; amount: number }) {
  const data = mc.bands.map((b) => ({ year: `Y${b.year}`, low: b.p10, band: b.p90 - b.p10, median: b.p50, start: amount }))
  return (
    <div className="h-60" role="img" aria-label={`Range of simulated outcomes: in 8 of 10 simulated futures the value ends between ${inr(mc.worst_case_p10)} and ${inr(mc.best_case_p90)}; middle outcome ${inr(mc.median)}.`}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="year" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} fontSize={12} width={48} />
          <Tooltip
            formatter={(v, name, item) => {
              const p = item.payload as { low: number; band: number; median: number }
              if (name === 'band') return [`${inr(p.low)} – ${inr(p.low + p.band)}`, 'Likely range (80%)']
              if (name === 'median') return [inr(Number(v)), 'Middle outcome']
              return [null, null]
            }}
          />
          <Area type="monotone" dataKey="low" stackId="r" stroke="none" fill="transparent" legendType="none" isAnimationActive={false} />
          <Area type="monotone" dataKey="band" stackId="r" stroke="none" fill="var(--color-investing)" fillOpacity={0.18} isAnimationActive={false} />
          <Line type="monotone" dataKey="median" stroke="var(--color-investing)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="start" stroke="var(--color-muted)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function LossByHorizon({ data }: { data: { horizon_years: number; probability_of_loss: number }[] }) {
  const rows = data.map((d) => ({ label: `${d.horizon_years} yr`, pct: Math.round(d.probability_of_loss * 100) }))
  return (
    <div className="h-44" role="img" aria-label={`Chance of ending below the starting amount: ${rows.map((r) => `${r.label} ${r.pct}%`).join(', ')}`}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis hide domain={[0, 'dataMax + 10']} />
          <Bar dataKey="pct" fill="var(--color-warning)" radius={[6, 6, 0, 0]}>
            <LabelList dataKey="pct" position="top" formatter={(v) => `${v}%`} fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Debounced live projection from the investing engine (stateless calculator endpoint). */
export function useProjection(amount: number, allocation: Record<string, number>, horizon: number) {
  const [data, setData] = useState<InvestmentProjection | null>(null)
  const [loading, setLoading] = useState(false)
  const total = Object.values(allocation).reduce((a, b) => a + b, 0)
  const key = JSON.stringify([amount, allocation, horizon])
  useEffect(() => {
    if (total !== 100) return
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      const clean = Object.fromEntries(Object.entries(allocation).filter(([, v]) => v > 0))
      api.calculators
        .investment({ amount, allocation: clean, horizon_years: horizon })
        .then((d) => !cancelled && setData(d))
        .catch(() => !cancelled && setData(null))
        .finally(() => !cancelled && setLoading(false))
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, total])
  return { data: total === 100 ? data : null, loading }
}
