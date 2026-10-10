import { ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { homeFor } from '@/components/layout/guards'
import { ApiError } from '@/lib/api/client'
import { api } from '@/lib/api/endpoints'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { errorMessage } from '@/lib/useAsync'
import { AuthLayout } from './AuthLayout'

type Role = 'student' | 'educator'

export function validateRegistration(v: { username: string; password: string; display_name: string }) {
  const errors: Record<string, string> = {}
  if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(v.username)) errors.username = 'Use 3–40 letters, numbers, dots, dashes or underscores.'
  if (v.password.length < 8) errors.password = 'Use at least 8 characters.'
  if (!v.display_name.trim()) errors.display_name = 'Tell us what to call you.'
  return errors
}

export default function RegisterPage() {
  const { t } = useI18n()
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const role: Role = params.get('role') === 'educator' ? 'educator' : 'student'
  const [form, setForm] = useState({
    username: '',
    password: '',
    display_name: '',
    join_code: params.get('code') ?? '',
    invite_token: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={homeFor(user.role)} replace />

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const v = validateRegistration(form)
    if (role === 'educator') {
      if (!form.invite_token.trim()) v.invite_token = 'Paste the invitation token your organisation gave you.'
    }
    setErrors(v)
    if (Object.keys(v).length) return
    setBusy(true)
    setFormError(null)
    try {
      const base = { username: form.username.trim(), password: form.password, display_name: form.display_name.trim() }
      const res =
        role === 'student'
          ? await api.auth.registerStudent({ ...base, join_code: form.join_code.trim() || undefined })
          : await api.auth.registerEducator({ ...base, invite_token: form.invite_token.trim() })
      signIn(res)
      navigate(role === 'student' ? '/onboarding' : '/educator', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.field) setErrors({ [err.field]: err.message })
      else setFormError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title={t('auth.registerTitle')}
      subtitle={role === 'student' ? 'It takes a minute. No email or phone number needed.' : 'For teachers and NGO coordinators running a programme.'}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            {t('auth.signIn')}
          </Link>
        </>
      }
    >
      <Tabs value={role} onValueChange={(v) => setParams(v === 'educator' ? { role: 'educator' } : {})}>
        <TabsList className="mb-6 w-full">
          <TabsTrigger value="student">{t('auth.student')}</TabsTrigger>
          <TabsTrigger value="educator">{t('auth.educator')}</TabsTrigger>
        </TabsList>
      </Tabs>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label={t('auth.displayName')} error={errors.display_name} hint="Shown to your teacher. A nickname is fine.">
          {(p) => <Input {...p} value={form.display_name} onChange={set('display_name')} maxLength={40} autoComplete="nickname" />}
        </Field>
        <Field label={t('auth.username')} error={errors.username}>
          {(p) => <Input {...p} value={form.username} onChange={set('username')} autoComplete="username" autoCapitalize="none" />}
        </Field>
        <Field label={t('auth.password')} error={errors.password} hint="At least 8 characters.">
          {(p) => <Input {...p} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />}
        </Field>
        {role === 'student' ? (
          <Field label={t('auth.joinCode')} error={errors.join_code} hint="From your teacher or NGO. You can add it later.">
            {(p) => <Input {...p} value={form.join_code} onChange={set('join_code')} maxLength={12} className="uppercase" />}
          </Field>
        ) : (
          <Field label={t('auth.inviteToken')} error={errors.invite_token} hint="Your organisation sets you up. The token works once and expires.">
            {(p) => <Input {...p} value={form.invite_token} onChange={set('invite_token')} autoComplete="off" autoCapitalize="none" spellCheck={false} />}
          </Field>
        )}
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          {t('auth.createAccount')}
        </Button>
        <p className="flex items-start gap-2 text-xs text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          RupeeRise stores only your nickname, username and learning progress. You can delete everything from Settings.
        </p>
      </form>
    </AuthLayout>
  )
}
