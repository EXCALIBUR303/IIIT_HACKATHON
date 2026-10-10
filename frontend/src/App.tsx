import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { FullPageLoader, RequireRole } from '@/components/layout/guards'
import { StudentGate } from '@/features/onboarding/StudentGate'

const LandingPage = lazy(() => import('@/features/landing/LandingPage'))
const LoginPage = lazy(() => import('@/features/auth/LoginPage'))
const RegisterPage = lazy(() => import('@/features/auth/RegisterPage'))
const OnboardingPage = lazy(() => import('@/features/onboarding/OnboardingPage'))
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))
const LearnPage = lazy(() => import('@/features/learn/LearnPage'))
const ModulePage = lazy(() => import('@/features/learn/ModulePage'))
const SimulationPage = lazy(() => import('@/features/simulations/SimulationPage'))
const ExplorePage = lazy(() => import('@/features/explore/ExplorePage'))
const AssessmentsPage = lazy(() => import('@/features/assessments/AssessmentsPage'))
const TakeAssessmentPage = lazy(() => import('@/features/assessments/TakeAssessmentPage'))
const AttemptResultPage = lazy(() => import('@/features/assessments/AttemptResultPage'))
const ProgressPage = lazy(() => import('@/features/progress/ProgressPage'))
const PortfolioPage = lazy(() => import('@/features/portfolio/PortfolioPage'))
const WalletPage = lazy(() => import('@/features/wallet/WalletPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))
const EducatorDashboard = lazy(() => import('@/features/educator/EducatorDashboard'))
const NotFoundPage = lazy(() => import('@/features/landing/NotFoundPage'))

export function AppRoutes() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/onboarding"
          element={
            <RequireRole role="student">
              <OnboardingPage />
            </RequireRole>
          }
        />
        <Route
          path="/app"
          element={
            <RequireRole role="student">
              <StudentGate>
                <AppShell role="student" />
              </StudentGate>
            </RequireRole>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="learn" element={<LearnPage />} />
          <Route path="learn/:moduleSlug" element={<ModulePage />} />
          <Route path="play/:scenarioSlug" element={<SimulationPage />} />
          <Route path="explore" element={<ExplorePage />} />
          <Route path="assessments" element={<AssessmentsPage />} />
          <Route path="assessments/:slug" element={<TakeAssessmentPage />} />
          <Route path="results/:attemptId" element={<AttemptResultPage />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="portfolio" element={<PortfolioPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route
          path="/educator"
          element={
            <RequireRole role="educator">
              <AppShell role="educator" />
            </RequireRole>
          }
        >
          <Route index element={<EducatorDashboard />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
