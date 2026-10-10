import { animate, stagger, svg } from 'animejs'
import { ArrowRight, Check, Gamepad2, ListChecks } from 'lucide-react'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { PILLARS, PillarIcon } from '@/components/common/pillars'
import { ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { tiltHandlers, useAnime } from '@/lib/anime'
import { api } from '@/lib/api/endpoints'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAsync } from '@/lib/useAsync'

function Ring({ value, color }: { value: number; color: string }) {
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <div className="relative size-14 shrink-0">
      <svg viewBox="0 0 56 56" className="size-full -rotate-90" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-line)" strokeWidth="5" />
        <circle className="mod-ring" cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-mono text-xs font-bold">{value}%</span>
    </div>
  )
}

export default function LearnPage() {
  const { t } = useI18n()
  const modules = useAsync(() => api.content.modules(), [])
  const progress = useAsync(() => api.progress.me(), [])
  const ref = useRef<HTMLDivElement>(null)

  useAnime(
    ref,
    () => {
      if (!modules.data) return
      animate(svg.createDrawable('.mod-ring'), { draw: ['0 0', '0 1'], delay: stagger(120, { start: 300 }), duration: 1200, ease: 'outExpo' })
      animate('.mod-chip', { opacity: { from: 0 }, scale: { from: 0.8 }, delay: stagger(25, { start: 400 }), duration: 400, ease: 'outBack(2)' })
      animate('.mod-num', { opacity: { from: 0 }, x: { from: 30 }, delay: stagger(120, { start: 150 }), duration: 900, ease: 'outExpo' })
    },
    [!!modules.data, !!progress.data],
  )

  const done = progress.data?.modules.filter((m) => m.completed).length ?? 0

  return (
    <div ref={ref}>
      <PageHeader
        eyebrow={t('nav.learn')}
        title="Four pillars of money skills"
        description="Each module has story-based simulations at three difficulty levels and a short quiz. Complete one simulation and pass the quiz (60%) to finish a module."
        actions={
          progress.data && (
            <div className="rounded-xl border border-line bg-surface px-4 py-2 text-center shadow-[var(--shadow-card)]">
              <p className="font-mono text-2xl font-extrabold">
                {done}
                <span className="text-base text-muted">/4</span>
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Modules done</p>
            </div>
          )
        }
      />
      {modules.error && <ErrorState message={modules.error.message} onRetry={modules.reload} />}
      {modules.loading ? (
        <LoadingState rows={4} />
      ) : (
        <ol className="grid gap-5 md:grid-cols-2">
          {modules.data?.map((m) => {
            const meta = PILLARS[m.pillar]
            const mp = progress.data?.modules.find((x) => x.slug === m.slug)
            const pct = Math.round(mp?.percent ?? 0)
            return (
              <li key={m.slug} data-reveal="">
                <Link
                  to={`/app/learn/${m.slug}`}
                  {...tiltHandlers(5)}
                  className="group relative flex h-full flex-col overflow-hidden rounded-[22px] border border-line bg-surface p-6 shadow-[var(--shadow-card)] transition-[transform,box-shadow] duration-200 ease-out hover:shadow-[var(--shadow-raised)]"
                >
                  {/* pillar colour wash that grows on hover */}
                  <span
                    className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full opacity-60 transition-transform duration-500 group-hover:scale-[1.6]"
                    style={{ background: meta.soft }}
                    aria-hidden
                  />
                  <span
                    className="mod-num pointer-events-none absolute right-5 top-3 font-mono text-6xl font-black leading-none"
                    style={{ color: meta.color, opacity: 0.14 }}
                    aria-hidden
                  >
                    0{m.order}
                  </span>
                  <div className="relative flex items-center gap-3">
                    <PillarIcon pillar={m.pillar} size={48} />
                    <div>
                      <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted">Module {m.order}</p>
                      <h2 className="text-xl font-extrabold leading-tight group-hover:text-primary">{t(meta.titleKey)}</h2>
                    </div>
                  </div>
                  <p className="relative mt-4 text-sm leading-relaxed text-ink-soft">{m.summary}</p>
                  <ul className="relative mt-4 flex flex-wrap gap-1.5" aria-label="You will learn">
                    {m.objectives.slice(0, 3).map((o) => (
                      <li key={o} className="mod-chip rounded-full bg-canvas px-2.5 py-1 text-xs text-ink-soft ring-1 ring-line">
                        {o}
                      </li>
                    ))}
                  </ul>
                  <div className="relative mt-auto flex items-center gap-4 border-t border-line pt-5 [margin-top:auto]">
                    <Ring value={pct} color={meta.color} />
                    <div className="flex-1 space-y-1 text-xs">
                      <p className="flex items-center gap-1.5 text-ink-soft">
                        <Gamepad2 className="size-3.5" aria-hidden /> {m.scenarios.length} simulations
                        {mp?.simulation_done && <Check className="size-3.5 text-accent-ink" aria-label="one done" />}
                      </p>
                      <p className="flex items-center gap-1.5 text-ink-soft">
                        <ListChecks className="size-3.5" aria-hidden /> 1 quiz
                        {mp?.quiz_best != null && <span className="font-semibold text-accent-ink">best {mp.quiz_best}%</span>}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition-all group-hover:gap-2.5',
                        mp?.completed ? 'bg-accent-soft text-accent-ink' : 'bg-primary text-white',
                      )}
                    >
                      {mp?.completed ? 'Review' : pct > 0 ? 'Continue' : 'Start'} <ArrowRight className="size-4" aria-hidden />
                    </span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
