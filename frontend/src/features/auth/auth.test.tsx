import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from '@/App'
import { mockFetch, renderWithProviders } from '@/test/utils'
import LoginPage from './LoginPage'
import RegisterPage, { validateRegistration } from './RegisterPage'

describe('registration validation', () => {
  it('flags invalid usernames, short passwords and blank names', () => {
    expect(validateRegistration({ username: 'a b', password: 'short', display_name: ' ' })).toEqual({
      username: expect.any(String),
      password: expect.any(String),
      display_name: expect.any(String),
    })
    expect(validateRegistration({ username: 'meera_11', password: 'longenough', display_name: 'Meera' })).toEqual({})
  })
})

describe('LoginPage', () => {
  it('shows the API error message on failed login', async () => {
    mockFetch(() => ({ status: 401, body: { error: { code: 'invalid_credentials', message: 'Incorrect username or password' } } }))
    renderWithProviders(<LoginPage />, { route: '/login' })
    await userEvent.type(screen.getByLabelText('Username'), 'meera')
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Incorrect username or password')).toBeInTheDocument()
  })

  it('signs in and navigates to the student home', async () => {
    mockFetch((url) =>
      url === '/auth/login'
        ? { body: { access_token: 't', token_type: 'bearer', expires_in: 60, user: { id: '1', username: 'meera', display_name: 'Meera', role: 'student', organization_id: null } } }
        : { status: 500 },
    )
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app" element={<p>Student home</p>} />
      </Routes>,
      { route: '/login' },
    )
    await userEvent.type(screen.getByLabelText('Username'), 'meera')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Student home')).toBeInTheDocument()
    expect(localStorage.getItem('rupeerise.token')).toBe('t')
  })
})

describe('RegisterPage', () => {
  it('shows client-side validation errors without calling the API', async () => {
    const fetchMock = mockFetch(() => ({ status: 500 }))
    renderWithProviders(<RegisterPage />, { route: '/register' })
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText(/use at least 8 characters/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows educator-only fields on the educator tab', async () => {
    mockFetch(() => ({ status: 500 }))
    renderWithProviders(<RegisterPage />, { route: '/register?role=educator' })
    expect(screen.getByLabelText('Educator invite code')).toBeInTheDocument()
    expect(screen.queryByLabelText('Class code (optional)')).not.toBeInTheDocument()
  })
})

describe('routing', () => {
  it('redirects unauthenticated visitors from the app to login', async () => {
    mockFetch(() => ({ status: 401 }))
    renderWithProviders(<AppRoutes />, { route: '/app/progress' })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument())
  })

  it('renders the landing page with all four pillars', async () => {
    mockFetch(() => ({ status: 401 }))
    renderWithProviders(<AppRoutes />, { route: '/' })
    expect(await screen.findByRole('heading', { name: /four pillars/i })).toBeInTheDocument()
    for (const name of ['Plan & Budget', 'Save & Manage', 'Understand Investing', 'Stay Financially Safe'])
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
  })

  it('shows a not-found page for unknown routes', async () => {
    mockFetch(() => ({ status: 401 }))
    renderWithProviders(<AppRoutes />, { route: '/nope' })
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
