import { Info } from 'lucide-react'
import { motion } from 'motion/react'
import { ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { api } from '@/lib/api/endpoints'
import { useAuth } from '@/lib/auth'
import { fadeUp, staggerChildren } from '@/lib/motion'
import { useAsync } from '@/lib/useAsync'
import { EarningHistory } from './vault/EarningHistory'
import { EarningRules } from './vault/EarningRules'
import { PracticeStreak } from './vault/PracticeStreak'
import { ScenarioBadges } from './vault/ScenarioBadges'
import { VaultHero } from './vault/VaultHero'

/** The reward centre: RR coins, the practice streak, scenario badges, the rules and the ledger. */
export default function WalletPage() {
  const wallet = useAsync(() => api.wallet.get(100), [])
  const streak = useAsync(() => api.market.streak(), [])
  const lab = useAsync(() => api.market.overview(), [])
  const { user } = useAuth()
  const w = wallet.data
  const holder = user?.display_name ?? 'Your'

  return (
    <div>
      <PageHeader
        eyebrow="Educational rewards"
        title="Learning Wallet"
        description="Coins, streaks and badges you earn for showing you understand something. They are not a grade, and nothing that happens in a practice portfolio changes them."
      />
      {wallet.loading && <LoadingState rows={2} />}
      {wallet.error && <ErrorState message={wallet.error.message} onRetry={wallet.reload} />}
      {w && (
        <motion.div variants={staggerChildren(0.06)} initial="hidden" animate="show" className="space-y-6">
          <motion.div variants={fadeUp} className="grid items-start gap-6 lg:grid-cols-12">
            <div className="min-w-0 space-y-6 lg:col-span-7">
              <VaultHero balance={w.balance} totalEarned={w.total_earned} history={w.history} holder={holder} level={w.level} />
              {streak.data && <PracticeStreak streak={streak.data} />}
              {streak.error && <ErrorState message="The practice streak couldn’t load." onRetry={streak.reload} />}
            </div>
            <div className="min-w-0 space-y-6 lg:col-span-5">
              <EarningRules rules={w.rules} />
              {lab.data && <ScenarioBadges scenarios={lab.data.scenarios} />}
            </div>
          </motion.div>

          <motion.div variants={fadeUp}>
            <EarningHistory history={w.history} balance={w.balance} />
          </motion.div>

          <p className="flex items-start gap-2 text-sm text-muted">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {w.notice}
          </p>
        </motion.div>
      )}
    </div>
  )
}
