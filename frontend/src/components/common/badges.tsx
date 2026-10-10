import {
  Anchor,
  Award,
  Compass,
  Flag,
  Footprints,
  Layers,
  Lock,
  RotateCcw,
  ScanEye,
  ShieldCheck,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Achievement } from '@/lib/api/types'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const ICONS: Record<string, LucideIcon> = {
  footprints: Footprints,
  flag: Flag,
  wallet: Wallet,
  'shield-check': ShieldCheck,
  target: Target,
  anchor: Anchor,
  layers: Layers,
  'scan-eye': ScanEye,
  compass: Compass,
  'rotate-ccw': RotateCcw,
  award: Award,
}

export function AchievementTile({ a }: { a: Achievement }) {
  const Icon = a.earned ? (ICONS[a.icon] ?? Award) : Lock
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border p-3',
        a.earned ? 'border-emerald-200 bg-accent-soft/60' : 'border-line bg-canvas opacity-75',
      )}
    >
      <span
        className={cn(
          'inline-flex size-10 shrink-0 items-center justify-center rounded-xl',
          a.earned ? 'bg-accent-ink text-white' : 'bg-line text-muted',
        )}
        aria-hidden
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{a.title}</p>
        <p className="text-xs text-muted">{a.description}</p>
      </div>
      <span className="sr-only">{a.earned ? 'Earned' : 'Not yet earned'}</span>
    </div>
  )
}

export function DifficultyBadge({ level }: { level: number }) {
  const { t } = useI18n()
  const key = `common.difficulty.${level}` as 'common.difficulty.1'
  return (
    <Badge tone={level === 1 ? 'success' : level === 2 ? 'primary' : 'warning'}>
      <span aria-hidden>{'●'.repeat(level)}</span>
      {t(key)}
    </Badge>
  )
}

export function NewAchievements({ slugs }: { slugs: string[] }) {
  if (!slugs.length) return null
  const names = slugs.map((s) => s.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
  return (
    <div className="flex items-center gap-3 rounded-xl bg-accent-soft p-3 text-sm text-accent-ink" role="status">
      <Award className="size-5 shrink-0" aria-hidden />
      <span>
        <strong>Achievement unlocked:</strong> {names.join(', ')}
      </span>
    </div>
  )
}
