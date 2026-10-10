import { KeyRound, Languages, Sparkles, Trash2, UserRound, Users, Accessibility, MapPin } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { RadioCards } from '@/components/ui/radio-cards'
import { SwitchRow } from '@/components/ui/switch'
import { useOptionalProfile } from '@/features/onboarding/StudentGate'
import { api } from '@/lib/api/endpoints'
import type { Language, LearningLevel, Persona, Preferences, Profile } from '@/lib/api/types'
import { useAuth } from '@/lib/auth'
import { inr } from '@/lib/format'
import { LANGUAGES, useI18n } from '@/lib/i18n'
import { SPRING } from '@/lib/motion'
import { applyPreferences, storedPreferences } from '@/lib/preferences'
import { errorMessage, useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

type Status = { tone: 'success' | 'danger'; text: string } | null

/** One settings group: title and explanation on the left, controls on the right. */
function SettingsSection({ id, icon: Icon, title, description, children, tone }: {
  id: string
  icon: typeof UserRound
  title: string
  description: string
  children: ReactNode
  tone?: 'danger'
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      className={cn(
        'scroll-mt-24 rounded-[var(--radius-panel)] border bg-surface shadow-[var(--shadow-card)]',
        tone === 'danger' ? 'border-danger/25' : 'border-line',
      )}
    >
      <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,15rem)_1fr] md:gap-8">
        <div>
          <span className={cn('grid size-9 place-items-center rounded-xl', tone === 'danger' ? 'bg-danger-soft text-danger-ink' : 'bg-primary-soft text-primary')} aria-hidden>
            <Icon className="size-[18px]" />
          </span>
          <h2 id={`${id}-h`} className="mt-3 text-base font-extrabold">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  )
}

const PERSONA_ACCENT: Record<string, string> = {
  indigo: 'var(--color-budgeting)',
  emerald: 'var(--color-saving)',
  amber: 'var(--color-safety)',
  sky: 'var(--color-investing)',
}

function PersonaOption({ persona }: { persona: Persona }) {
  const accent = PERSONA_ACCENT[persona.color] ?? 'var(--color-primary)'
  return (
    <span className="flex flex-col gap-2.5">
      <span className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl text-base font-extrabold text-white" style={{ background: accent }} aria-hidden>
          {persona.name[0]}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold">
            {persona.name}, {persona.age}
          </span>
          <span className="block text-xs text-muted">{persona.grade}</span>
        </span>
      </span>
      <span className="line-clamp-2 text-sm leading-relaxed text-ink-soft">{persona.situation}</span>
      <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <span>
          <strong className="text-ink">{inr(persona.monthly_money)}</strong>/month
        </span>
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3" aria-hidden /> {persona.area}
        </span>
      </span>
    </span>
  )
}

function LanguagePicker({ value, onChange }: { value: Language; onChange: (l: Language) => void }) {
  const { t } = useI18n()
  return (
    <>
      <RadioCards
        label={t('settings.language')}
        value={value}
        onChange={onChange}
        size="sm"
        columns="grid-cols-1 sm:grid-cols-3"
        options={LANGUAGES.map((l) => ({
          value: l.code,
          label: `${l.native} (${l.label})`,
          content: (
            <span className="block">
              <span className="block text-sm font-bold">{l.native}</span>
              <span className="block text-xs text-muted">{l.label}</span>
            </span>
          ),
        }))}
      />
      <p className="mt-3 text-xs text-muted">{t('settings.translationNote')}</p>
    </>
  )
}

function AccessibilitySwitches({ prefs, onChange, showHints }: { prefs: Preferences; onChange: (p: Preferences) => void; showHints: boolean }) {
  const { t } = useI18n()
  const set = (key: keyof Preferences) => (value: boolean) => onChange({ ...prefs, [key]: value })
  return (
    <div className="divide-y divide-line rounded-xl border border-line px-4">
      <SwitchRow label={t('settings.largeText')} description="Makes all text about 12% bigger." checked={prefs.large_text} onCheckedChange={set('large_text')} />
      <SwitchRow label={t('settings.highContrast')} description="Darker text and stronger borders." checked={prefs.high_contrast} onCheckedChange={set('high_contrast')} />
      <SwitchRow label={t('settings.reducedMotion')} description="Turns off animations, even if your device allows them." checked={prefs.reduced_motion} onCheckedChange={set('reduced_motion')} />
      {showHints && <SwitchRow label={t('settings.hints')} description="Short tips while you play a mission." checked={prefs.show_hints} onCheckedChange={set('show_hints')} />}
    </div>
  )
}

function PasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  async function change(e: React.FormEvent) {
    e.preventDefault()
    if (next.length < 8) {
      setStatus({ tone: 'danger', text: 'Use at least 8 characters for the new password.' })
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      await api.auth.changePassword(current, next)
      setCurrent('')
      setNext('')
      setStatus({ tone: 'success', text: 'Password changed. You were signed out of every other device.' })
    } catch (err) {
      setStatus({ tone: 'danger', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={change} className="grid max-w-md gap-4">
      {status && <Alert tone={status.tone}>{status.text}</Alert>}
      <Field label="Current password">{(p) => <Input {...p} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}</Field>
      <Field label="New password" hint="At least 8 characters.">
        {(p) => <Input {...p} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
      </Field>
      <Button type="submit" variant="outline" loading={busy} disabled={!current || !next} className="justify-self-start">
        Change password
      </Button>
    </form>
  )
}

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'persona', label: 'Persona' },
  { id: 'language', label: 'Language' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'class', label: 'Class' },
  { id: 'security', label: 'Password' },
  { id: 'danger', label: 'Delete account' },
]

function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav aria-label="Settings sections" className="hidden lg:block">
      <ul className="sticky top-8 space-y-0.5 border-l border-line">
        {items.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-ink">
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

const same = (a: Profile, b: Profile) =>
  a.user.display_name === b.user.display_name &&
  a.language === b.language &&
  a.learning_level === b.learning_level &&
  a.persona_key === b.persona_key &&
  JSON.stringify(a.preferences) === JSON.stringify(b.preferences)

function StudentSettings() {
  const { t, setLang } = useI18n()
  const ctx = useOptionalProfile()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const loaded = useAsync(() => (ctx ? Promise.resolve(ctx.profile) : api.profile.get()), [])
  const personas = useAsync(() => api.content.personas(), [])
  const [saved, setSaved] = useState<Profile | null>(null)
  const [draft, setDraft] = useState<Profile | null>(null)
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [joinStatus, setJoinStatus] = useState<Status>(null)
  const [confirmDelete, setConfirmDelete] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const base = saved ?? loaded.data
  const profile = draft ?? base
  if (loaded.error) return <ErrorState message={loaded.error.message} onRetry={loaded.reload} />
  if (!profile || !base) return <LoadingState rows={3} />
  const dirty = !same(profile, base)
  const update = (patch: Partial<Profile>) => {
    setStatus(null)
    setDraft({ ...profile, ...patch })
  }

  async function save() {
    setBusy(true)
    setStatus(null)
    try {
      const next = await api.profile.update({
        display_name: profile!.user.display_name,
        language: profile!.language,
        learning_level: profile!.learning_level,
        persona_key: profile!.persona_key,
        preferences: profile!.preferences,
      })
      setSaved(next)
      setDraft(null)
      ctx?.setProfile(next)
      setStatus({ tone: 'success', text: t('common.saved') })
    } catch (err) {
      setStatus({ tone: 'danger', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  function discard() {
    setDraft(null)
    setLang(base!.language)
    applyPreferences(base!.preferences)
  }

  async function join() {
    setJoinStatus(null)
    try {
      const next = await api.profile.joinCohort(code.trim())
      setSaved(next)
      setDraft(draft ? { ...draft, cohorts: next.cohorts } : null)
      ctx?.setProfile(next)
      setCode('')
      setJoinStatus({ tone: 'success', text: 'You joined the class.' })
    } catch (err) {
      setJoinStatus({ tone: 'danger', text: errorMessage(err) })
    }
  }

  async function deleteAccount() {
    setDeleteError(null)
    try {
      await api.profile.deleteAccount(deletePassword)
      signOut()
      navigate('/', { replace: true })
    } catch (err) {
      setDeleteError(errorMessage(err))
    }
  }

  const levels: { value: LearningLevel; label: string }[] = [
    { value: 'beginner', label: t('onboarding.level.beginner') },
    { value: 'intermediate', label: t('onboarding.level.intermediate') },
    { value: 'advanced', label: t('onboarding.level.advanced') },
  ]

  return (
    <div className="grid gap-8 lg:grid-cols-[11rem_1fr]">
      <SectionNav items={SECTIONS} />
      <div className="min-w-0 space-y-5 pb-24">
        {status && <Alert tone={status.tone}>{status.text}</Alert>}

        <SettingsSection id="profile" icon={UserRound} title="Profile" description="How you appear to your teacher, and where activities start.">
          <div className="space-y-5">
            <Field label="Display name" hint="A nickname is fine.">
              {(p) => <Input {...p} value={profile.user.display_name} maxLength={40} onChange={(e) => update({ user: { ...profile.user, display_name: e.target.value } })} />}
            </Field>
            <div>
              <p className="mb-2 text-sm font-semibold">Learning level</p>
              <RadioCards label="Learning level" value={profile.learning_level} onChange={(v) => update({ learning_level: v })} options={levels} size="sm" columns="grid-cols-1 sm:grid-cols-3" />
              <p className="mt-2 text-xs text-muted">Sets the starting difficulty when there isn’t enough evidence yet.</p>
            </div>
            <div className="rounded-xl bg-canvas p-3.5 text-sm">
              <p className="font-semibold">
                {profile.stage.label} · {profile.stage.grades}
              </p>
              <p className="mt-0.5 text-muted">Your learning stage comes from the class you chose. Ask your teacher if it is wrong.</p>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection id="persona" icon={Sparkles} title="Persona" description="The fictional student whose stories you follow in missions. Change it any time.">
          {personas.data ? (
            <RadioCards
              label="Persona"
              value={profile.persona_key}
              onChange={(v) => update({ persona_key: v })}
              options={personas.data.map((p) => ({ value: p.key, label: `${p.name}, ${p.grade}`, content: <PersonaOption persona={p} /> }))}
            />
          ) : (
            <LoadingState rows={2} />
          )}
        </SettingsSection>

        <SettingsSection id="language" icon={Languages} title={t('settings.language')} description="Used for menus and buttons across RupeeRise.">
          <LanguagePicker
            value={profile.language}
            onChange={(l) => {
              setLang(l)
              update({ language: l })
            }}
          />
        </SettingsSection>

        <SettingsSection id="accessibility" icon={Accessibility} title={t('settings.accessibility')} description="Changes show straight away. Save to keep them on every device.">
          <AccessibilitySwitches
            prefs={profile.preferences}
            showHints
            onChange={(prefs) => {
              applyPreferences(prefs)
              update({ preferences: prefs })
            }}
          />
        </SettingsSection>

        <SettingsSection id="class" icon={Users} title={t('settings.joinClass')} description="Your teacher or NGO gives you a class code.">
          {profile.cohorts.length > 0 && (
            <ul className="mb-4 flex flex-wrap gap-2">
              {profile.cohorts.map((c) => (
                <li key={c.id} className="rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-primary-ink">
                  {c.name}
                </li>
              ))}
            </ul>
          )}
          {joinStatus && (
            <Alert tone={joinStatus.tone} className="mb-3">
              {joinStatus.text}
            </Alert>
          )}
          <form
            className="flex max-w-sm gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void join()
            }}
          >
            <Input aria-label="Class code" placeholder="e.g. AB12CD" value={code} onChange={(e) => setCode(e.target.value)} className="uppercase" maxLength={12} />
            <Button type="submit" variant="outline" disabled={code.trim().length < 4}>
              Join
            </Button>
          </form>
        </SettingsSection>

        <SettingsSection id="security" icon={KeyRound} title="Password" description="Changing it signs you out on every other device.">
          <PasswordForm />
        </SettingsSection>

        <SettingsSection id="danger" icon={Trash2} title={t('settings.delete')} description="Permanently removes your account, missions, answers, rewards and badges. This cannot be undone." tone="danger">
          <div className="grid max-w-md gap-3">
            {deleteError && <Alert tone="danger">{deleteError}</Alert>}
            <Field label="Type DELETE to confirm">{(p) => <Input {...p} value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} autoComplete="off" />}</Field>
            <Field label="Your current password">
              {(p) => <Input {...p} type="password" autoComplete="current-password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />}
            </Field>
            <Button variant="danger" disabled={confirmDelete !== 'DELETE' || !deletePassword} onClick={deleteAccount} className="justify-self-start">
              <Trash2 /> Delete my account
            </Button>
          </div>
        </SettingsSection>
      </div>

      {/* Save bar: appears only when something changed, so "Save" is never a dead button. */}
      <AnimatePresence>
        {dirty && (
          <motion.div
            role="region"
            aria-label="Unsaved changes"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={SPRING}
            className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl bg-navy px-4 py-3 text-white shadow-[var(--shadow-hero)] lg:bottom-5 lg:left-[calc(15rem+2.5rem)] lg:right-56"
          >
            <p className="text-sm font-semibold">You have unsaved changes</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={discard} className="text-white/80 hover:bg-white/10 hover:text-white">
                Discard
              </Button>
              <Button size="sm" onClick={save} loading={busy} className="bg-emerald-400 text-[#06281d] hover:bg-emerald-300">
                {t('common.save')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function EducatorSettings() {
  const { lang, setLang } = useI18n()
  const { user } = useAuth()
  const { t } = useI18n()
  const [prefs, setPrefs] = useState<Preferences>(storedPreferences)
  return (
    <div className="space-y-5">
      <SettingsSection id="account" icon={UserRound} title={t('settings.account')} description="Your educator account.">
        <p className="text-sm text-ink-soft">
          Signed in as <strong>{user?.display_name}</strong> ({user?.username})
        </p>
      </SettingsSection>
      <SettingsSection id="language" icon={Languages} title={t('settings.language')} description="Used for menus and buttons across RupeeRise.">
        <LanguagePicker value={lang} onChange={setLang} />
      </SettingsSection>
      <SettingsSection id="accessibility" icon={Accessibility} title={t('settings.accessibility')} description="Saved on this device.">
        <AccessibilitySwitches
          prefs={prefs}
          showHints={false}
          onChange={(p) => {
            setPrefs(p)
            applyPreferences(p)
          }}
        />
      </SettingsSection>
      <SettingsSection id="security" icon={KeyRound} title="Password" description="Changing it signs you out on every other device.">
        <PasswordForm />
      </SettingsSection>
    </div>
  )
}

export default function SettingsPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  return (
    <div>
      <PageHeader title={t('settings.title')} description="Your profile, language, accessibility and account." />
      {user?.role === 'student' ? <StudentSettings /> : <EducatorSettings />}
    </div>
  )
}
