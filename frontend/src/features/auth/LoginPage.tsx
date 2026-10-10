import { ArrowRight, Eye, EyeOff, KeyRound, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { homeFor } from '@/components/layout/guards'
import { api } from '@/lib/api/endpoints'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { errorMessage } from '@/lib/useAsync'
import { AuthLayout } from './AuthLayout'

export default function LoginPage() {
  const { t } = useI18n()
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [capsLock, setCapsLock] = useState(false)

  if (user) return <Navigate to={homeFor(user.role)} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api.auth.login(username.trim(), password)
      signIn(res)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : homeFor(res.user.role), { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title={t('auth.loginTitle')}
      subtitle="Sign in to continue your learning journey."
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-semibold text-primary hover:underline">
            {t('auth.createAccount')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label={t('auth.username')}>
          {(p) => (
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-muted" aria-hidden />
              <Input
                {...p}
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-12 bg-canvas pl-10 focus:bg-surface"
                required
              />
            </div>
          )}
        </Field>
        <Field label={t('auth.password')}>
          {(p) => (
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-muted" aria-hidden />
              <Input
                {...p}
                type={reveal ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
                onBlur={() => setCapsLock(false)}
                className="h-12 bg-canvas pl-10 pr-11 focus:bg-surface"
                required
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                aria-pressed={reveal}
                aria-label={reveal ? 'Hide characters' : 'Show characters'}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted hover:text-ink focus-visible:outline-primary"
              >
                {reveal ? <EyeOff className="size-4.5" aria-hidden /> : <Eye className="size-4.5" aria-hidden />}
              </button>
            </div>
          )}
        </Field>
        {capsLock && (
          <p className="-mt-3 text-xs font-semibold text-warning-ink" role="status">
            Caps Lock is on
          </p>
        )}
        <Button type="submit" variant="accent" className="group h-12 w-full shadow-[0_10px_24px_-8px_rgb(4_120_87/0.55)] transition-all hover:-translate-y-px hover:shadow-[0_14px_28px_-8px_rgb(4_120_87/0.6)] active:translate-y-0 disabled:opacity-60 disabled:shadow-none" size="lg" loading={busy} disabled={!username || !password}>
          {t('auth.signIn')}
          {!busy && <ArrowRight className="transition-transform group-hover:translate-x-1" aria-hidden />}
        </Button>
      </form>
    </AuthLayout>
  )
}
