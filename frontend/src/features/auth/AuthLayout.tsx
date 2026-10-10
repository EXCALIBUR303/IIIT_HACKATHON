import { Lightbulb, Sparkles } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { MarketBackdrop } from './MarketBackdrop'

const HEADLINE = ['Learn', 'the', 'market'] as const
const HIGHLIGHT = ['without', 'risking', 'money'] as const

/** Short, factual money ideas that rotate under the form. Easy to edit or translate later. */
const TIPS = [
  'Compound interest earns interest on your interest, so starting early matters more than starting big.',
  'Banks and UPI apps never need your PIN or OTP to send you money. Anyone asking is a red flag.',
  'Diversifying means not keeping all your rupees in one basket, so one bad fall hurts less.',
  'An emergency fund turns a surprise expense into an inconvenience instead of a debt.',
  'Inflation means ₹100 today buys a little less next year. Saving should try to keep pace.',
]

function useFadeUp() {
  const reduce = useReducedMotion()
  return (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
        }
}

function greeting(d = new Date()) {
  const h = d.getHours()
  return h < 5 ? 'Up late?' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function TipCarousel() {
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (reduce || paused) return
    const id = window.setInterval(() => setI((n) => (n + 1) % TIPS.length), 6000)
    return () => window.clearInterval(id)
  }, [reduce, paused])

  return (
    <section
      aria-label="Money tip"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="rounded-2xl border border-primary-100 bg-primary-soft/60 p-4"
    >
      <div className="flex items-center justify-between">
        <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em] text-primary">
          <Lightbulb className="size-3.5" aria-hidden /> Did you know?
        </p>
        <div className="flex gap-1.5">
          {TIPS.map((_, n) => (
            <button
              key={n}
              type="button"
              onClick={() => setI(n)}
              aria-label={`Tip ${n + 1} of ${TIPS.length}`}
              aria-current={n === i}
              className="group grid size-4 place-items-center"
            >
              <span className={`block h-1.5 rounded-full transition-all ${n === i ? 'w-4 bg-primary' : 'w-1.5 bg-primary/25 group-hover:bg-primary/50'}`} />
            </button>
          ))}
        </div>
      </div>
      <div className="relative mt-2 min-h-[3.75rem]" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.p
            key={i}
            initial={reduce ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -12 }}
            transition={{ duration: 0.25 }}
            className="text-sm leading-relaxed text-primary-ink"
          >
            {TIPS[i]}
          </motion.p>
        </AnimatePresence>
      </div>
    </section>
  )
}

export function AuthLayout({ title, subtitle, children, footer }: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const fade = useFadeUp()
  const reduce = useReducedMotion()
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-primary-100 bg-[linear-gradient(160deg,#eef2ff_0%,#f8fafc_45%,#ecfdf5_100%)] p-10 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        {/* faint graph paper */}
        <div
          className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(to_right,rgb(67_56_202/0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgb(67_56_202/0.06)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]"
          aria-hidden
        />
        <motion.div {...fade(0)} className="relative z-10 flex items-center justify-between">
          <Link to="/">
            <Logo />
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-white/80 px-3 py-1 text-xs font-semibold text-accent-ink shadow-sm">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-70" />
              <span className="relative size-2 rounded-full bg-accent" />
            </span>
            Practice market · fictional
          </span>
        </motion.div>
        <div className="relative z-10 mt-10 max-w-lg">
          <h2 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-ink xl:text-[3.2rem]">
            {HEADLINE.map((w, i) => (
              <motion.span key={w} {...fade(0.1 + i * 0.07)} className="mr-[0.25em] inline-block">
                {w}
              </motion.span>
            ))}
            {HIGHLIGHT.map((w, i) => (
              <motion.span
                key={w}
                {...fade(0.32 + i * 0.07)}
                className="mr-[0.25em] inline-block bg-gradient-to-r from-primary to-accent-ink bg-clip-text text-transparent"
              >
                {w}
              </motion.span>
            ))}
          </h2>
          <motion.p {...fade(0.6)} className="mt-4 max-w-sm text-lg leading-relaxed text-ink-soft">
            Practise stock choices with fictional rupees. Simulated lessons, real confidence.
          </motion.p>
        </div>
        <MarketBackdrop />
        <motion.p {...fade(1)} className="relative z-10 mt-4 text-xs font-medium text-muted">
          Not financial advice. No real money involved.
        </motion.p>
      </aside>

      <main className="relative flex flex-col justify-center overflow-hidden bg-[radial-gradient(circle_at_1px_1px,rgb(15_23_42/0.07)_1px,transparent_0)] [background-size:22px_22px] px-4 py-10 sm:px-10">
        <motion.div {...fade(0.15)} className="relative mx-auto w-full max-w-md">
          <Link to="/" className="inline-block lg:hidden">
            <Logo />
          </Link>
          <p className="mb-6 mt-3 text-sm font-semibold text-primary lg:hidden">Learn the market without risking money.</p>

          {/* Card with a slowly rotating indigo→emerald edge */}
          <div className="relative overflow-hidden rounded-[28px] p-[1.5px] shadow-[0_24px_60px_-24px_rgb(67_56_202/0.35)]">
            <motion.div
              className="absolute -inset-[60%] bg-[conic-gradient(from_0deg,#4338ca,#10b981,#e0e7ff,#4338ca)]"
              animate={reduce ? undefined : { rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
              aria-hidden
            />
            <div className="relative rounded-[27px] bg-white/95 p-6 backdrop-blur sm:p-8">
              <motion.span
                {...fade(0.3)}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary-soft to-accent-soft px-3 py-1 text-xs font-bold text-primary-ink"
              >
                <Sparkles className="size-3.5 text-primary" aria-hidden />
                {greeting()}
              </motion.span>
              <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-[2.1rem]">{title}</h1>
              {/* A rising underline that draws itself under the title */}
              <svg viewBox="0 0 160 14" className="mt-1.5 h-3.5 w-40" aria-hidden>
                <motion.path
                  d="M2 11 C 30 11, 40 4, 62 7 S 100 12, 120 5 L 158 2"
                  fill="none"
                  stroke="url(#rr-underline)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 0.5, duration: 0.9, ease: 'easeOut' }}
                />
                <defs>
                  <linearGradient id="rr-underline" x1="0" x2="1">
                    <stop offset="0" stopColor="#4338ca" />
                    <stop offset="1" stopColor="#10b981" />
                  </linearGradient>
                </defs>
              </svg>
              {subtitle && <p className="mt-2 text-ink-soft">{subtitle}</p>}
              <div className="mt-7">{children}</div>
              {footer && <div className="mt-6 border-t border-line pt-5 text-sm text-ink-soft">{footer}</div>}
            </div>
          </div>

          <motion.div {...fade(0.6)} className="mt-5">
            <TipCarousel />
          </motion.div>
        </motion.div>
      </main>
    </div>
  )
}
