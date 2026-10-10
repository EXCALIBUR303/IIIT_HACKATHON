import { PiggyBank, ShieldCheck, TrendingUp, Wallet, type LucideIcon } from 'lucide-react'
import type { MessageKey } from '@/lib/i18n/en'
import type { Pillar, ScenarioKind } from '@/lib/api/types'

export interface PillarMeta {
  key: Pillar
  icon: LucideIcon
  color: string
  soft: string
  titleKey: MessageKey
  descKey: MessageKey
  kind: ScenarioKind
}

export const PILLARS: Record<Pillar, PillarMeta> = {
  budgeting: {
    key: 'budgeting',
    icon: Wallet,
    color: 'var(--color-budgeting)',
    soft: 'var(--color-budgeting-soft)',
    titleKey: 'pillar.budgeting',
    descKey: 'pillar.budgeting.desc',
    kind: 'budget',
  },
  saving: {
    key: 'saving',
    icon: PiggyBank,
    color: 'var(--color-saving)',
    soft: 'var(--color-saving-soft)',
    titleKey: 'pillar.saving',
    descKey: 'pillar.saving.desc',
    kind: 'savings',
  },
  investing: {
    key: 'investing',
    icon: TrendingUp,
    color: 'var(--color-investing)',
    soft: 'var(--color-investing-soft)',
    titleKey: 'pillar.investing',
    descKey: 'pillar.investing.desc',
    kind: 'investing',
  },
  safety: {
    key: 'safety',
    icon: ShieldCheck,
    color: 'var(--color-safety)',
    soft: 'var(--color-safety-soft)',
    titleKey: 'pillar.safety',
    descKey: 'pillar.safety.desc',
    kind: 'safety',
  },
}

export const PILLAR_ORDER: Pillar[] = ['budgeting', 'saving', 'investing', 'safety']

export const KIND_TO_PILLAR: Record<ScenarioKind, Pillar> = {
  budget: 'budgeting',
  savings: 'saving',
  investing: 'investing',
  safety: 'safety',
}

export function PillarIcon({ pillar, size = 40 }: { pillar: Pillar; size?: number }) {
  const meta = PILLARS[pillar]
  const Icon = meta.icon
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, background: meta.soft, color: meta.color }}
      aria-hidden
    >
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2.2} />
    </span>
  )
}
