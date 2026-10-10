import { Check, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/form'
import { SwitchRow } from '@/components/ui/switch'
import { PersonaCard } from '@/features/onboarding/OnboardingPage'
import { useOptionalProfile } from '@/features/onboarding/StudentGate'
import { api } from '@/lib/api/endpoints'
import type { Language, Preferences, Profile } from '@/lib/api/types'
import { useAuth } from '@/lib/auth'
import { LANGUAGES, useI18n } from '@/lib/i18n'
import { applyPreferences, storedPreferences } from '@/lib/preferences'
import { errorMessage, useAsync } from '@/lib/useAsync'

function AccessibilityCard({ prefs, onChange, showHints }: { prefs: Preferences; onChange: (p: Preferences) => void; showHints: boolean }) {
  const { t } = useI18n()
  const set = (key: keyof Preferences) => (value: boolean) => onChange({ ...prefs, [key]: value })
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.accessibility')}</CardTitle>
        <CardDescription>Changes apply immediately on this device.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-line">
        <SwitchRow label={t('settings.largeText')} checked={prefs.large_text} onCheckedChange={set('large_text')} />
        <SwitchRow label={t('settings.highContrast')} checked={prefs.high_contrast} onCheckedChange={set('high_contrast')} />
        <SwitchRow label={t('settings.reducedMotion')} checked={prefs.reduced_motion} onCheckedChange={set('reduced_motion')} />
        {showHints && <SwitchRow label={t('settings.hints')} checked={prefs.show_hints} onCheckedChange={set('show_hints')} />}
      </CardContent>
    </Card>
  )
}

function LanguageCard({ value, onChange }: { value: Language; onChange: (l: Language) => void }) {
  const { t } = useI18n()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.language')}</CardTitle>
        <CardDescription>{t('settings.translationNote')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Field label={t('settings.language')}>
          {(p) => (
            <Select {...p} value={value} onChange={(e) => onChange(e.target.value as Language)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.native} ({l.label})
                </option>
              ))}
            </Select>
          )}
        </Field>
      </CardContent>
    </Card>
  )
}

function PasswordCard() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

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
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Changing it signs you out everywhere else.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={change} className="grid max-w-sm gap-4">
          {status && <Alert tone={status.tone}>{status.text}</Alert>}
          <Field label="Current password">
            {(p) => <Input {...p} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
          </Field>
          <Button type="submit" variant="secondary" loading={busy} disabled={!current || !next} className="justify-self-start">
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function StudentSettings() {
  const { t, setLang } = useI18n()
  const ctx = useOptionalProfile()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const loaded = useAsync(() => (ctx ? Promise.resolve(ctx.profile) : api.profile.get()), [])
  const personas = useAsync(() => api.content.personas(), [])
  const [draft, setDraft] = useState<Profile | null>(null)
  const [status, setStatus] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [confirmDelete, setConfirmDelete] = useState('')
  const [deletePassword, setDeletePassword] = useState('')

  const profile = draft ?? loaded.data
  if (loaded.error) return <ErrorState message={loaded.error.message} onRetry={loaded.reload} />
  if (!profile) return <LoadingState rows={3} />
  const update = (patch: Partial<Profile>) => setDraft({ ...profile, ...patch })

  async function save(next: Profile = profile!) {
    setBusy(true)
    setStatus(null)
    try {
      const saved = await api.profile.update({
        display_name: next.user.display_name,
        grade: next.grade,
        language: next.language,
        learning_level: next.learning_level,
        persona_key: next.persona_key,
        preferences: next.preferences,
      })
      setDraft(saved)
      ctx?.setProfile(saved)
      setStatus({ tone: 'success', text: t('common.saved') })
    } catch (err) {
      setStatus({ tone: 'danger', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  async function join() {
    try {
      const saved = await api.profile.joinCohort(code.trim())
      setDraft(saved)
      ctx?.setProfile(saved)
      setCode('')
      setStatus({ tone: 'success', text: 'You joined the class.' })
    } catch (err) {
      setStatus({ tone: 'danger', text: errorMessage(err) })
    }
  }

  async function deleteAccount() {
    try {
      await api.profile.deleteAccount(deletePassword)
      signOut()
      navigate('/', { replace: true })
    } catch (err) {
      setStatus({ tone: 'danger', text: errorMessage(err) })
    }
  }

  return (
    <div className="space-y-6">
      {status && <Alert tone={status.tone}>{status.text}</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <LanguageCard
          value={profile.language}
          onChange={(l) => {
            setLang(l)
            update({ language: l })
          }}
        />
        <AccessibilityCard
          prefs={profile.preferences}
          showHints
          onChange={(prefs) => {
            applyPreferences(prefs)
            update({ preferences: prefs })
          }}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Learning preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name">
              {(p) => <Input {...p} value={profile.user.display_name} maxLength={40} onChange={(e) => update({ user: { ...profile.user, display_name: e.target.value } })} />}
            </Field>
            <Field label="Learning level" hint="Sets the starting difficulty when there isn’t enough evidence yet.">
              {(p) => (
                <Select {...p} value={profile.learning_level} onChange={(e) => update({ learning_level: e.target.value as Profile['learning_level'] })}>
                  <option value="beginner">{t('onboarding.level.beginner')}</option>
                  <option value="intermediate">{t('onboarding.level.intermediate')}</option>
                  <option value="advanced">{t('onboarding.level.advanced')}</option>
                </Select>
              )}
            </Field>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Persona</p>
            <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Persona">
              {personas.data?.map((p) => (
                <PersonaCard key={p.key} persona={p} selected={profile.persona_key === p.key} onSelect={() => update({ persona_key: p.key })} />
              ))}
            </div>
          </div>
          <Button onClick={() => save()} loading={busy}>
            <Check /> {t('common.save')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.account')}</CardTitle>
          <CardDescription>Username: {profile.user.username}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <p className="text-sm font-semibold">{t('settings.joinClass')}</p>
            {profile.cohorts.length > 0 && <p className="mt-1 text-sm text-muted">Your classes: {profile.cohorts.map((c) => c.name).join(', ')}</p>}
            <div className="mt-2 flex max-w-sm gap-2">
              <Input aria-label="Class code" placeholder="e.g. AB12CD" value={code} onChange={(e) => setCode(e.target.value)} className="uppercase" maxLength={12} />
              <Button variant="secondary" onClick={join} disabled={code.trim().length < 4}>
                Join
              </Button>
            </div>
          </div>
          <div className="rounded-xl border border-red-200 bg-danger-soft/50 p-4">
            <p className="text-sm font-semibold text-danger-ink">{t('settings.delete')}</p>
            <p className="mt-1 text-sm text-ink-soft">
              This permanently removes your account, simulations, answers and badges. Type <strong>DELETE</strong> to confirm.
            </p>
            <div className="mt-3 grid max-w-sm gap-2">
              <Input aria-label="Type DELETE to confirm" placeholder="Type DELETE" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} />
              <Input
                aria-label="Your current password"
                type="password"
                placeholder="Your current password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
              />
              <Button variant="danger" disabled={confirmDelete !== 'DELETE' || !deletePassword} onClick={deleteAccount} className="justify-self-start">
                <Trash2 /> Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <PasswordCard />
    </div>
  )
}

function EducatorSettings() {
  const { lang, setLang } = useI18n()
  const { user } = useAuth()
  const [prefs, setPrefs] = useState<Preferences>(storedPreferences)
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <LanguageCard value={lang} onChange={setLang} />
      <AccessibilityCard
        prefs={prefs}
        showHints={false}
        onChange={(p) => {
          setPrefs(p)
          applyPreferences(p)
        }}
      />
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-ink-soft">
          <p>
            Signed in as <strong>{user?.display_name}</strong> ({user?.username})
          </p>
        </CardContent>
      </Card>
      <PasswordCard />
    </div>
  )
}

export default function SettingsPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  return (
    <div>
      <PageHeader title={t('settings.title')} />
      {user?.role === 'student' ? <StudentSettings /> : <EducatorSettings />}
    </div>
  )
}
