import { Coins, ShieldCheck, Sparkles, Star } from 'lucide-react'
import { motion } from 'motion/react'
import { AnimatedNumber } from '@/components/motion/AnimatedNumber'
import type { LevelProgress, RewardEntry } from '@/lib/api/types'
import { SPRING_SOFT } from '@/lib/motion'

const WEEK = 7 * 24 * 3600 * 1000
const fmt = (n: number) => Math.round(n).toLocaleString('en-IN')

/** RR coin balance, what has been earned and when, and the one-line promise about profit. */
export function VaultHero({ balance, totalEarned, history, holder, level }: { balance: number; totalEarned: number; history: RewardEntry[]; holder: string; level: LevelProgress }) {
  const pct = level.max_level ? 100 : Math.min(100, Math.round((level.xp_into_level / level.xp_for_level) * 100))
  const thisWeek = history.filter((e) => e.amount > 0 && Date.now() - new Date(e.created_at).getTime() < WEEK).reduce((s, e) => s + e.amount, 0)
  return (
    <section aria-labelledby="vault-balance" className="relative overflow-hidden rounded-[var(--radius-panel)] bg-navy p-6 text-white shadow-[var(--shadow-hero)] sm:p-7">
      <div className="bg-grid-dark absolute inset-0 opacity-60" aria-hidden />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
            <Sparkles className="size-3.5" aria-hidden /> Reward Vault
          </p>
          <p className="mt-1 text-sm text-slate-300">{holder}’s learning rewards</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
          <ShieldCheck className="size-3.5 text-emerald-300" aria-hidden /> Fictional money
        </span>
      </div>

      <div className="relative mt-6 flex items-center gap-4">
        <motion.span
          className="grid size-14 shrink-0 place-items-center rounded-2xl bg-reward text-navy"
          initial={{ rotate: -12, scale: 0.8 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={SPRING_SOFT}
        >
          <Coins className="size-7" aria-hidden />
        </motion.span>
        <div className="min-w-0">
          <h2 id="vault-balance" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            RR Coin Balance
          </h2>
          <p className="text-5xl font-extrabold leading-none tracking-tight text-amber-300" data-testid="wallet-balance">
            <AnimatedNumber value={balance} format={fmt} duration={1.1} />
          </p>
        </div>
      </div>

      <div className="relative mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="flex items-center gap-1.5 whitespace-nowrap text-sm font-bold">
            <Star className="size-4 text-amber-300" aria-hidden /> Level {level.level} · {level.title}
          </p>
          <p className="text-xs text-slate-300 tabular">{level.max_level ? 'Top level reached' : `${level.xp_into_level} / ${level.xp_for_level} XP to ${level.next_title}`}</p>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Level ${level.level} progress`}>
          <motion.div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-300" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }} />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">{level.sources}. Profit never counts.</p>
      </div>

      <dl className="relative mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4 text-sm">
        <div>
          <dt className="text-xs text-slate-400">Total earned</dt>
          <dd className="mt-0.5 text-lg font-bold tabular">
            <AnimatedNumber value={totalEarned} format={fmt} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">This week</dt>
          <dd className="mt-0.5 text-lg font-bold tabular text-emerald-300">
            +<AnimatedNumber value={thisWeek} format={fmt} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Rewards</dt>
          <dd className="mt-0.5 text-lg font-bold tabular">
            <AnimatedNumber value={history.length} format={fmt} />
          </dd>
        </div>
      </dl>
      <p className="relative mt-4 text-xs leading-relaxed text-slate-400">
        1 RR coin = ₹1 of fictional reward money. Coins are earned for what you understand, never for profit. They can’t be cashed out.
      </p>
    </section>
  )
}
