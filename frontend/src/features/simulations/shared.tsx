import { ArrowLeft, MessageCircleQuestion, RotateCcw, TrendingDown, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ResultReward } from '@/lib/api/types'
import { NewAchievements } from '@/components/common/badges'
import { RewardEarned } from '@/components/common/rewards'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ProgressRing } from '@/components/ui/progress'
import { openTutor } from '@/features/tutor/TutorPanel'
import { inr } from '@/lib/format'
import { useFlick } from '@/lib/anime'
import { cn } from '@/lib/utils'

export function MoneyControl({ id, label, value, max, onChange, hint, color, min = 0, step = 10, marker, prefix = '₹', suffix }: {
  id: string
  label: ReactNode
  value: number
  max: number
  onChange: (value: number) => void
  hint?: ReactNode
  color?: string
  min?: number
  step?: number
  marker?: number
  prefix?: string
  suffix?: string
}) {
  const safeMax = Math.max(max, min, 1)
  const fill = Math.min(100, (value / safeMax) * 100)
  return (
    <div className="rounded-xl border border-line bg-surface p-3.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="min-w-0 flex-1 text-sm font-semibold leading-snug">
          {label}
        </label>
        <div className="flex shrink-0 items-center rounded-lg border border-line-strong bg-canvas focus-within:border-primary">
          {prefix && (
            <span className="pl-2 text-sm text-muted" aria-hidden>
              {prefix}
            </span>
          )}
          <input
            type="number"
            inputMode="numeric"
            aria-label={`${typeof label === 'string' ? label : id}${prefix === '₹' ? ' amount in rupees' : ''}`}
            className="tabular w-20 bg-transparent px-1.5 py-1 text-right text-sm font-semibold focus:outline-none"
            value={value}
            min={min}
            max={safeMax}
            step={step}
            onChange={(e) => {
              const n = Number(e.target.value)
              onChange(Number.isFinite(n) ? Math.max(min, Math.min(safeMax, Math.round(n))) : 0)
            }}
          />
          {suffix && (
            <span className="pr-2 text-sm text-muted" aria-hidden>
              {suffix}
            </span>
          )}
        </div>
      </div>
      <div className="relative mt-3">
        <input
          id={id}
          type="range"
          className="rr-range w-full"
          min={min}
          max={safeMax}
          step={step}
          value={Math.min(value, safeMax)}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ ['--range-color' as string]: color, ['--range-fill' as string]: `${fill}%` }}
        />
        {marker != null && marker > 0 && (
          <span
            className="pointer-events-none absolute top-[-3px] h-[14px] w-0.5 rounded bg-ink/60"
            style={{ left: `${Math.min(100, (marker / safeMax) * 100)}%` }}
            aria-hidden
          />
        )}
      </div>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function ResultHeader({ score, previousBest, attempt, newAchievements, rewards, retry, moduleLink, sessionId, title }: {
  score: number
  previousBest: number | null
  attempt: number
  newAchievements: string[]
  rewards?: ResultReward[]
  retry: () => void
  moduleLink: string
  sessionId: string
  title: string
}) {
  const delta = previousBest != null ? score - previousBest : null
  const verdict = score >= 80 ? 'Excellent decisions' : score >= 60 ? 'Solid, with room to improve' : 'A useful learning round'
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-7">
        <ProgressRing value={score} size={96} stroke={9} label="Score" color={score >= 80 ? 'var(--color-accent)' : score >= 60 ? 'var(--color-primary)' : 'var(--color-warning)'} />
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Attempt {attempt} complete</p>
          <h2 className="mt-1 text-xl font-extrabold sm:text-2xl">{verdict}</h2>
          <p className="mt-1 text-sm text-ink-soft">{title}</p>
          {delta != null && (
            <p className={cn('mt-2 inline-flex items-center gap-1.5 text-sm font-semibold', delta >= 0 ? 'text-accent-ink' : 'text-warning-ink')}>
              {delta >= 0 ? <TrendingUp className="size-4" aria-hidden /> : <TrendingDown className="size-4" aria-hidden />}
              {delta >= 0 ? `+${delta}` : delta} vs your previous best ({previousBest})
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:w-48">
          <Button onClick={retry}>
            <RotateCcw /> Try a different strategy
          </Button>
          <Button variant="outline" onClick={() => openTutor({ sessionId, question: 'Can you explain what happened in my simulation?' })}>
            <MessageCircleQuestion /> Explain my result
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to={moduleLink}>
              <ArrowLeft /> Back to module
            </Link>
          </Button>
        </div>
      </div>
      {rewards && rewards.length > 0 && (
        <div className="border-t border-line p-4">
          <RewardEarned rewards={rewards} />
        </div>
      )}
      {newAchievements.length > 0 && (
        <div className="border-t border-line p-4">
          <NewAchievements slugs={newAchievements} />
        </div>
      )}
    </Card>
  )
}

export function ScoreBreakdown({ items }: { items: { label: string; value: number; max: number }[] }) {
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex justify-between text-sm">
            <span className="text-ink-soft">{i.label}</span>
            <span className="tabular font-semibold">
              {i.value}/{i.max}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="h-full rounded-full bg-primary" style={{ width: `${(i.value / i.max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function StatTile({ label, value, tone = 'neutral', sub }: { label: string; value: ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'warn'; sub?: ReactNode }) {
  // Flick the number when it changes, so the effect of moving a slider is easy to see.
  const valueRef = useFlick<HTMLParagraphElement>(typeof value === 'string' || typeof value === 'number' ? String(value) : null)
  return (
    <div
      className={cn(
        'rounded-xl p-3.5 transition-colors',
        tone === 'good' && 'bg-accent-soft',
        tone === 'bad' && 'bg-danger-soft',
        tone === 'warn' && 'bg-warning-soft',
        tone === 'neutral' && 'bg-canvas ring-1 ring-line',
      )}
    >
      <p className="text-xs text-muted">{label}</p>
      <p ref={valueRef} className={cn('tabular mt-0.5 text-lg font-bold', tone === 'good' && 'text-accent-ink', tone === 'bad' && 'text-danger-ink', tone === 'warn' && 'text-warning-ink')}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  )
}

export function EventCard({ title, description, amount, label = 'Surprise!' }: { title: string; description: string; amount: number; label?: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-warning bg-warning-soft p-5">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-warning-ink">{label}</p>
      <h3 className="mt-1 text-lg font-extrabold">{title}</h3>
      <p className="mt-1 text-sm text-ink-soft">{description}</p>
      <p className="tabular mt-3 text-2xl font-extrabold text-warning-ink">{inr(amount)}</p>
    </div>
  )
}

export function OptionCard({ selected, disabled, onSelect, title, description }: {
  selected: boolean
  disabled?: boolean
  onSelect: () => void
  title: string
  description?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'w-full rounded-xl border-2 p-3.5 text-left transition-colors',
        selected ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-line-strong',
        disabled && 'cursor-not-allowed opacity-55 hover:border-line',
      )}
    >
      <span className="flex items-center gap-2.5">
        <span className={cn('inline-block size-4 shrink-0 rounded-full border-2', selected ? 'border-primary bg-primary shadow-[inset_0_0_0_2px_white]' : 'border-line-strong')} aria-hidden />
        <span className="text-sm font-semibold">{title}</span>
      </span>
      {description && <span className="mt-1 block pl-6.5 text-xs text-muted">{description}</span>}
    </button>
  )
}
