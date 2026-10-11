import { Area, AreaChart, CartesianGrid, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { LabSession } from '@/lib/api/types'
import { inrPaise } from '@/lib/format'
import { prefersReducedMotion } from '@/lib/motion'

/** Portfolio value against an equal-weight "whole market" benchmark, with news days marked. */
export function AnimatedPortfolioChart({ session, dark = false, height = 220 }: { session: LabSession; dark?: boolean; height?: number }) {
  const reduce = prefersReducedMotion()
  const data = session.series.map((p) => ({ label: p.label, value: p.total_paise / 100, market: p.benchmark_paise / 100 }))
  // A single point cannot draw a line, so show the opening value as a flat start.
  if (data.length === 1) data.push({ ...data[0], label: 'Now' })
  const values = data.flatMap((d) => [d.value, d.market])
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = Math.max((hi - lo) * 0.25, hi * 0.01)
  const up = session.pnl_paise >= 0
  const stroke = dark ? (up ? '#5eead4' : '#fca5a5') : up ? 'var(--color-investing)' : 'var(--color-danger)'
  const tick = dark ? '#94a3b8' : 'var(--color-muted)'
  const events = session.events.filter((e) => e.step < data.length)
  const fmt = (v: number) => (v >= 100000 ? `₹${(v / 100000).toFixed(2)}L` : `₹${Math.round(v / 1000)}k`)
  const summary = data.map((d) => `${d.label} ${inrPaise(Math.round(d.value * 100))}`).join(', ')
  return (
    <div style={{ height }} role="img" aria-label={`Portfolio value so far: ${summary}. Dashed line: the whole market, equal weight.`}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`pv-${dark ? 'd' : 'l'}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={dark ? 0.35 : 0.22} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={dark ? 'rgba(148,163,184,0.15)' : 'var(--color-line)'} vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: tick }} interval="preserveStartEnd" />
          <YAxis domain={[lo - pad, hi + pad]} tickFormatter={fmt} width={52} tickLine={false} axisLine={false} fontSize={11} tick={{ fill: tick }} />
          <Tooltip
            formatter={(v, name) => [inrPaise(Math.round(Number(v) * 100)), name === 'value' ? 'Your portfolio' : 'Whole market']}
            contentStyle={{ borderRadius: 12, border: '1px solid var(--color-line)', fontSize: 12 }}
          />
          <Line type="monotone" dataKey="market" stroke={dark ? '#64748b' : 'var(--color-line-strong)'} strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={!reduce} />
          <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2.5} fill={`url(#pv-${dark ? 'd' : 'l'})`} isAnimationActive={!reduce} animationDuration={900} dot={{ r: 2.5, fill: stroke, strokeWidth: 0 }} />
          {events.map((e) => (
            <ReferenceDot key={`${e.step}-${e.headline}`} x={data[e.step]?.label} y={data[e.step]?.value} r={5} fill={dark ? '#0f1838' : '#fff'} stroke="#e8a317" strokeWidth={2} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
