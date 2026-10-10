import { ArrowLeft, ArrowRight, Check, ClipboardCheck, MapPin } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { ErrorState, LoadingState } from '@/components/common/states'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { api } from '@/lib/api/endpoints'
import type { Language, LearningLevel, Persona } from '@/lib/api/types'
import { inr } from '@/lib/format'
import { LANGUAGES, useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { errorMessage, useAsync } from '@/lib/useAsync'

const PERSONA_ACCENT: Record<string, string> = {
  indigo: 'var(--color-budgeting)',
  emerald: 'var(--color-saving)',
  amber: 'var(--color-safety)',
  sky: 'var(--color-investing)',
}

function ChoiceCard({ selected, onSelect, children, label }: {
  selected: boolean
  onSelect: () => void
  children: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onSelect}
      className={cn(
        'relative w-full rounded-2xl border-2 bg-surface p-4 text-left transition-all',
        selected ? 'border-primary shadow-[var(--shadow-raised)]' : 'border-line hover:border-line-strong',
      )}
    >
      {selected && (
        <span className="absolute right-3 top-3 inline-flex size-6 items-center justify-center rounded-full bg-primary text-white">
          <Check className="size-4" aria-hidden />
        </span>
      )}
      {children}
    </button>
  )
}

export function PersonaCard({ persona, selected, onSelect }: { persona: Persona; selected: boolean; onSelect: () => void }) {
  const accent = PERSONA_ACCENT[persona.color] ?? 'var(--color-primary)'
  return (
    <ChoiceCard selected={selected} onSelect={onSelect} label={`${persona.name}, ${persona.grade}`}>
      <div className="flex items-center gap-3">
        <span
          className="inline-flex size-12 items-center justify-center rounded-2xl text-lg font-extrabold text-white"
          style={{ background: accent }}
          aria-hidden
        >
          {persona.name[0]}
        </span>
        <div>
          <p className="font-bold">
            {persona.name}, {persona.age}
          </p>
          <p className="text-xs text-muted">{persona.grade}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">{persona.situation}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-canvas p-2">
          <dt className="text-muted">{persona.money_source}</dt>
          <dd className="font-bold">{inr(persona.monthly_money)}/month</dd>
        </div>
        <div className="rounded-lg bg-canvas p-2">
          <dt className="flex items-center gap-1 text-muted">
            <MapPin className="size-3" aria-hidden /> Area
          </dt>
          <dd className="truncate font-bold">{persona.area}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs font-medium" style={{ color: accent }}>
        Goal: {persona.goal}
      </p>
    </ChoiceCard>
  )
}

const STEPS = ['onboarding.step1', 'onboarding.step2', 'onboarding.step3', 'onboarding.step4'] as const

export default function OnboardingPage() {
  const { t, setLang } = useI18n()
  const navigate = useNavigate()
  const profile = useAsync(() => api.profile.get(), [])
  const personas = useAsync(() => api.content.personas(), [])
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [grade, setGrade] = useState<11 | 12 | 13 | null>(null)
  const [language, setLanguage] = useState<Language>('en')
  const [level, setLevel] = useState<LearningLevel>('beginner')
  const [persona, setPersona] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile.data) return
    if (profile.data.onboarding_completed) navigate('/app', { replace: true })
    setName(profile.data.user.display_name)
    setGrade(profile.data.grade)
    setLanguage(profile.data.language)
    setLevel(profile.data.learning_level)
    setPersona(profile.data.persona_key)
  }, [profile.data, navigate])

  const canNext = [name.trim().length > 0 && grade !== null, true, persona !== null, true][step]

  async function finish(target: string) {
    setBusy(true)
    setError(null)
    try {
      await api.profile.update({
        display_name: name.trim(),
        grade,
        language,
        learning_level: level,
        persona_key: persona,
        onboarding_completed: true,
      })
      navigate(target, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (profile.error || personas.error)
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorState message={(profile.error ?? personas.error)!.message} onRetry={() => { profile.reload(); personas.reload() }} />
      </div>
    )

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
        <Logo size={30} />
        <p className="text-sm font-medium text-muted">
          Step {step + 1} of {STEPS.length}
        </p>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <ol className="mb-8 grid grid-cols-4 gap-2" aria-label="Onboarding steps">
          {STEPS.map((key, i) => (
            <li key={key}>
              <div className={cn('h-1.5 rounded-full', i <= step ? 'bg-primary' : 'bg-line')} />
              <p className={cn('mt-2 hidden text-xs font-semibold sm:block', i === step ? 'text-primary' : 'text-muted')}>{t(key)}</p>
            </li>
          ))}
        </ol>

        {profile.loading || personas.loading ? (
          <LoadingState rows={2} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.section
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              aria-live="polite"
            >
              {step === 0 && (
                <div className="space-y-6">
                  <div>
                    <h1 className="text-2xl font-extrabold sm:text-3xl">Let’s set up your learning space</h1>
                    <p className="mt-2 text-ink-soft">We only ask what helps us choose the right activities. No school ID, phone or address.</p>
                  </div>
                  <Field label="What should we call you?" hint="A first name or nickname">
                    {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />}
                  </Field>
                  <fieldset>
                    <legend className="mb-2 text-sm font-semibold">{t('onboarding.grade')}</legend>
                    <div className="grid gap-3 sm:grid-cols-3" role="radiogroup">
                      {([
                        [11, 'Class 11'],
                        [12, 'Class 12'],
                        [13, 'Finished Class 12'],
                      ] as const).map(([value, label]) => (
                        <ChoiceCard key={value} selected={grade === value} onSelect={() => setGrade(value)} label={label}>
                          <span className="font-semibold">{label}</span>
                        </ChoiceCard>
                      ))}
                    </div>
                  </fieldset>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-8">
                  <fieldset>
                    <legend className="text-2xl font-extrabold">{t('onboarding.language')}</legend>
                    <p className="mt-1 text-sm text-muted">You can change this any time in Settings.</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3" role="radiogroup">
                      {LANGUAGES.map((l) => (
                        <ChoiceCard
                          key={l.code}
                          selected={language === l.code}
                          onSelect={() => {
                            setLanguage(l.code)
                            setLang(l.code)
                          }}
                          label={l.label}
                        >
                          <span className="block text-lg font-bold">{l.native}</span>
                          <span className="text-sm text-muted">{l.label}</span>
                        </ChoiceCard>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="text-lg font-bold">{t('onboarding.level')}</legend>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3" role="radiogroup">
                      {(['beginner', 'intermediate', 'advanced'] as const).map((lv) => (
                        <ChoiceCard key={lv} selected={level === lv} onSelect={() => setLevel(lv)} label={t(`onboarding.level.${lv}`)}>
                          <span className="font-semibold">{t(`onboarding.level.${lv}`)}</span>
                        </ChoiceCard>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted">This only sets your starting difficulty. Your answers adjust it from there.</p>
                  </fieldset>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h1 className="text-2xl font-extrabold">{t('onboarding.step3')}</h1>
                  <p className="mt-1 text-ink-soft">{t('onboarding.personaHelp')}</p>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2" role="radiogroup" aria-label="Personas">
                    {personas.data?.map((p) => (
                      <PersonaCard key={p.key} persona={p} selected={persona === p.key} onSelect={() => setPersona(p.key)} />
                    ))}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
                  <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                    <ClipboardCheck className="size-6" aria-hidden />
                  </span>
                  <h1 className="mt-4 text-2xl font-extrabold">You’re all set, {name.trim()}</h1>
                  <p className="mt-2 leading-relaxed text-ink-soft">
                    Start with a quick <strong>12-question starting check</strong> (about 6 minutes). It isn’t graded. It
                    helps RupeeRise pick activities at the right level, and later you can compare it with your final check
                    to see how much you’ve grown.
                  </p>
                  {error && (
                    <Alert tone="danger" className="mt-4">
                      {error}
                    </Alert>
                  )}
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <Button size="lg" loading={busy} onClick={() => finish('/app/assessments/initial')}>
                      Take the starting check <ArrowRight />
                    </Button>
                    <Button size="lg" variant="outline" disabled={busy} onClick={() => finish('/app')}>
                      Skip for now
                    </Button>
                  </div>
                </div>
              )}
            </motion.section>
          </AnimatePresence>
        )}

        {step < 3 && (
          <div className="mt-8 flex justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
              <ArrowLeft /> {t('common.back')}
            </Button>
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              {t('common.next')} <ArrowRight />
            </Button>
          </div>
        )}
        {step === 3 && (
          <Button variant="ghost" className="mt-6" onClick={() => setStep(2)}>
            <ArrowLeft /> {t('common.back')}
          </Button>
        )}
      </main>
    </div>
  )
}
