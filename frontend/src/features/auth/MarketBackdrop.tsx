import { ArrowDownRight, ArrowUpRight, BarChart3, CandlestickChart, LineChart, TrendingDown, TrendingUp } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Interactive practice-market visual for the auth screens. Everything here is
 * fictional: made-up tickers, a seeded price series and a gentle random walk on
 * the chips. Nothing is fetched and nothing resembles a real quote.
 */

type Candle = { id: number; o: number; c: number; lo: number; hi: number }
type Mode = 'candles' | 'line' | 'columns'

const VISIBLE = 18
const W = 600
const H = 300

// Small seeded PRNG so the opening picture is identical on every visit.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function nextCandle(prev: Candle | undefined, rand: () => number, bias = 0.15): Candle {
  const o = prev ? prev.c : 130
  const c = Math.max(60, Math.round(o + (rand() - 0.5 + bias) * 14))
  return {
    id: (prev?.id ?? -1) + 1,
    o,
    c,
    lo: Math.min(o, c) - Math.round(rand() * 5 + 1),
    hi: Math.max(o, c) + Math.round(rand() * 5 + 1),
  }
}

function seedCandles(rand: () => number) {
  const out: Candle[] = []
  for (let i = 0; i < VISIBLE; i++) out.push(nextCandle(out[i - 1], rand))
  return out
}

const TICKERS = [
  { symbol: 'NAVARA', start: 1.2, className: 'right-[6%] top-[2%]' },
  { symbol: 'KESARI', start: -0.6, className: 'left-[34%] top-[12%]' },
  { symbol: 'TANTU', start: -0.3, className: 'right-[4%] top-[58%]' },
]

function TickerChip({ symbol, start, className, delay }: (typeof TICKERS)[number] & { delay: number }) {
  const reduce = useReducedMotion()
  const [change, setChange] = useState(start)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    if (reduce) return
    let off: number | undefined
    const id = window.setInterval(
      () => {
        setChange((c) => {
          const next = Math.max(-2.5, Math.min(2.5, Math.round((c + (Math.random() - 0.5) * 0.4) * 10) / 10))
          setFlash(next >= c ? 'up' : 'down')
          return next
        })
        off = window.setTimeout(() => setFlash(null), 600)
      },
      2600 + delay * 900,
    )
    return () => {
      window.clearInterval(id)
      window.clearTimeout(off)
    }
  }, [reduce, delay])

  const up = change >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <motion.span
      initial={reduce ? false : { opacity: 0, y: 12, scale: 0.94 }}
      animate={reduce ? undefined : { opacity: 1, y: [0, -5, 0], scale: 1 }}
      transition={{
        opacity: { delay: 0.9 + delay * 0.25, duration: 0.4 },
        scale: { delay: 0.9 + delay * 0.25, duration: 0.4 },
        y: { delay: 1.3 + delay * 0.25, duration: 4 + delay, repeat: Infinity, ease: 'easeInOut' },
      }}
      className={cn(
        'pointer-events-none absolute z-10 inline-flex items-center gap-2 rounded-xl border bg-white/90 px-3 py-2 text-xs font-bold shadow-[var(--shadow-raised)] backdrop-blur-sm transition-colors duration-500',
        flash === 'up' ? 'border-accent/60 bg-accent-soft' : flash === 'down' ? 'border-danger/50 bg-danger-soft' : 'border-line',
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', up ? 'bg-accent' : 'bg-danger')} />
      <span className="tracking-wide text-ink">{symbol}</span>
      <span className={cn('inline-flex items-center tabular-nums', up ? 'text-accent-ink' : 'text-danger-ink')}>
        <Icon className="size-3.5" />
        {up ? '+' : '−'}
        {Math.abs(change).toFixed(1)}%
      </span>
    </motion.span>
  )
}

const MODES: { key: Mode; label: string; icon: typeof LineChart }[] = [
  { key: 'candles', label: 'Candles', icon: CandlestickChart },
  { key: 'line', label: 'Line', icon: LineChart },
  { key: 'columns', label: 'Columns', icon: BarChart3 },
]

const UP = '#10b981'
const DOWN = '#ef4444'

function Chart({ candles, mode, fresh }: { candles: Candle[]; mode: Mode; fresh: number | null }) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const lo = Math.min(...candles.map((k) => k.lo)) - 6
  const hi = Math.max(...candles.map((k) => k.hi)) + 6
  const step = W / candles.length
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H
  const x = (i: number) => i * step + step / 2
  const last = candles.length - 1
  const pts = candles.map((k, i) => [x(i), y(mode === 'line' ? k.c : (k.o + k.c) / 2)] as const)
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const area = `${line} L${x(last)},${H} L${x(0)},${H} Z`
  const spring = { type: 'spring', stiffness: 160, damping: 22 } as const

  function onMove(e: React.PointerEvent) {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    setHover(Math.max(0, Math.min(last, Math.floor(((e.clientX - r.left) / r.width) * candles.length))))
  }

  const h = hover != null ? candles[hover] : null
  return (
    <div ref={ref} className="absolute inset-0 cursor-crosshair" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id="rr-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={mode === 'line' ? 0.3 : 0.18} />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.2, 0.45, 0.7].map((g) => (
          <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="var(--color-primary)" strokeOpacity="0.12" strokeDasharray="3 7" vectorEffect="non-scaling-stroke" />
        ))}
        <motion.path
          fill="url(#rr-area)"
          initial={reduce ? false : { opacity: 0, d: area }}
          animate={{ opacity: mode === 'columns' ? 0 : 1, d: area }}
          transition={{ opacity: { duration: 0.5 }, d: spring }}
        />

        {candles.map((k, i) => {
          const up = k.c >= k.o
          const color = up ? UP : DOWN
          const top = y(Math.max(k.o, k.c))
          const body = Math.max(4, Math.abs(y(k.o) - y(k.c)))
          const dim = hover != null && hover !== i
          const show = mode !== 'line'
          const isNew = k.id === fresh
          return (
            <motion.g
              key={k.id}
              initial={reduce ? false : isNew ? { opacity: 0, x: 30 } : { opacity: 0, scaleY: 0.2 }}
              animate={{ opacity: show ? (dim ? 0.3 : 1) : 0, x: 0, scaleY: 1 }}
              style={{ transformOrigin: `${x(i)}px ${H}px` }}
              transition={{
                opacity: { duration: hover != null ? 0.12 : 0.35 },
                scaleY: { delay: reduce ? 0 : 0.15 + i * 0.045, duration: 0.5 },
                x: spring,
              }}
            >
              {mode === 'columns' ? (
                <motion.rect
                  initial={false}
                  animate={{ x: x(i) - step * 0.36, y: y(k.c), height: H - y(k.c), width: step * 0.72 }}
                  transition={spring}
                  rx="3"
                  fill={color}
                  fillOpacity="0.75"
                />
              ) : (
                <>
                  <motion.line
                    initial={false}
                    animate={{ x1: x(i), x2: x(i), y1: y(k.hi), y2: y(k.lo) }}
                    transition={spring}
                    stroke={color}
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                  <motion.rect
                    initial={false}
                    animate={{ x: x(i) - step * 0.24, y: top, height: body, width: step * 0.48 }}
                    transition={spring}
                    rx="2.5"
                    fill={color}
                    fillOpacity="0.85"
                  />
                </>
              )}
            </motion.g>
          )
        })}

        <motion.path
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={mode === 'line' ? 3 : 2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          initial={reduce ? false : { pathLength: 0, d: line }}
          animate={{ pathLength: 1, d: line, opacity: mode === 'columns' ? 0.35 : 1 }}
          transition={{ pathLength: { delay: 0.4, duration: 1.6, ease: 'easeInOut' }, d: spring, opacity: { duration: 0.4 } }}
        />
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="var(--color-ink)" strokeOpacity="0.25" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      {/* Pulsing "live" dot on the latest price */}
      <motion.span
        className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2"
        initial={false}
        animate={{ left: `${(pts[last][0] / W) * 100}%`, top: `${(pts[last][1] / H) * 100}%` }}
        transition={spring}
      >
        {!reduce && <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />}
        <span className="absolute inset-0.5 rounded-full border-2 border-white bg-primary" />
      </motion.span>

      <AnimatePresence>
        {h && hover != null && (
          <motion.div
            key="tip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lg"
            style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(h.hi) / H) * 100 - 14}%` }}
          >
            <span className="text-white/60">Day {h.id + 1} · </span>₹{h.c}{' '}
            <span className={h.c >= h.o ? 'text-emerald-300' : 'text-red-300'}>
              {h.c >= h.o ? '▲' : '▼'} {Math.abs(((h.c - h.o) / h.o) * 100).toFixed(1)}%
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

type Round = { guess: 'up' | 'down'; actual: 'up' | 'down' }

/** "Call the next candle": a tiny game showing that short-term moves are close to a coin flip. */
function PredictGame({ onPredict, busy, rounds }: { onPredict: (g: 'up' | 'down') => void; busy: boolean; rounds: Round[] }) {
  const last = rounds.at(-1)
  const right = rounds.filter((r) => r.guess === r.actual).length
  const lesson =
    rounds.length >= 5
      ? `${right} of ${rounds.length} right. Short-term moves are close to a coin flip, so investors plan for years, not days.`
      : last
        ? last.guess === last.actual
          ? 'You called it! Was that skill or luck? Try a few more.'
          : 'Missed this one. Nobody can reliably predict a single day.'
        : 'Will the next candle close higher or lower?'
  return (
    <div className="rounded-2xl border border-line bg-white/85 p-3 shadow-[var(--shadow-card)] backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-primary">Call the next candle</p>
        {rounds.length > 0 && (
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold tabular-nums text-primary-ink">
            {right}/{rounds.length}
          </span>
        )}
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={lesson}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="mt-1 min-h-[2.5em] text-xs leading-snug text-ink-soft"
        >
          {lesson}
        </motion.p>
      </AnimatePresence>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(['up', 'down'] as const).map((g) => {
          const Icon = g === 'up' ? TrendingUp : TrendingDown
          return (
            <motion.button
              key={g}
              type="button"
              whileTap={{ scale: 0.94 }}
              disabled={busy}
              onClick={() => onPredict(g)}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold transition-colors disabled:opacity-50',
                g === 'up'
                  ? 'border-accent/40 bg-accent-soft text-accent-ink hover:bg-accent-ink hover:text-white'
                  : 'border-danger/30 bg-danger-soft text-danger-ink hover:bg-danger-ink hover:text-white',
              )}
            >
              <Icon className="size-4" aria-hidden /> {g === 'up' ? 'Higher' : 'Lower'}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

export function MarketBackdrop() {
  const rand = useMemo(() => mulberry32(2026), [])
  const [candles, setCandles] = useState(() => seedCandles(rand))
  const [mode, setMode] = useState<Mode>('candles')
  const [rounds, setRounds] = useState<Round[]>([])
  const [busy, setBusy] = useState(false)
  const [fresh, setFresh] = useState<number | null>(null)

  function predict(guess: 'up' | 'down') {
    setBusy(true)
    // Unbiased walk for the game, so a guess really is a coin flip.
    const next = nextCandle(candles.at(-1), Math.random, 0)
    setFresh(next.id)
    setCandles((cs) => [...cs.slice(1), next])
    setRounds((r) => [...r.slice(-19), { guess, actual: next.c >= next.o ? 'up' : 'down' }])
    window.setTimeout(() => setBusy(false), 650)
  }

  return (
    <div className="relative mt-6 flex min-h-0 flex-1 flex-col">
      <div className="relative -mx-10 min-h-[220px] flex-1" aria-hidden>
        <div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,transparent,black_12%)]">
          <Chart candles={candles} mode={mode} fresh={fresh} />
        </div>
        {TICKERS.map((t, i) => (
          <TickerChip key={t.symbol} {...t} delay={i} />
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        className="relative z-10 mt-4 grid items-end gap-3 xl:grid-cols-[1fr_auto]"
      >
        <PredictGame onPredict={predict} busy={busy} rounds={rounds} />
        <div role="radiogroup" aria-label="Chart type" className="inline-flex self-end justify-self-start rounded-xl border border-line bg-white/85 p-1 shadow-[var(--shadow-card)] backdrop-blur-sm">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={mode === m.key}
              onClick={() => setMode(m.key)}
              className={cn(
                'relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
                mode === m.key ? 'text-white' : 'text-ink-soft hover:text-ink',
              )}
            >
              {mode === m.key && (
                <motion.span layoutId="rr-mode" className="absolute inset-0 rounded-lg bg-primary" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
              )}
              <m.icon className="relative size-3.5" aria-hidden />
              <span className="relative">{m.label}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
