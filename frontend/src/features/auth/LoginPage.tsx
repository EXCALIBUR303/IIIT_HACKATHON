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
          {(p) => <Input {...p} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />}
        </Field>
        <Field label={t('auth.password')}>
          {(p) => (
            <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          )}
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!username || !password}>
          {t('auth.signIn')}
        </Button>
      </form>
    </AuthLayout>
  )
}
