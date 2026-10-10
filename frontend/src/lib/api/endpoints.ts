import { http } from './client'
import type {
  Achievement,
  AssessmentSummary,
  AttemptResult,
  AttemptStart,
  Asset,
  Cohort,
  CohortOverview,
  Concept,
  InvestmentProjection,
  Module,
  Persona,
  Profile,
  ProfileUpdate,
  Progress,
  Recommendation,
  ResponseInput,
  SavingsComparison,
  ScenarioSummary,
  Session,
  SessionSummary,
  TokenResponse,
  TutorAnswer,
  User,
  Wallet,
} from './types'

const q = (v: string) => encodeURIComponent(v)

export const api = {
  wallet: {
    get: (limit = 50) => http.get<Wallet>(`/wallet?limit=${limit}`),
  },
  auth: {
    login: (username: string, password: string) => http.post<TokenResponse>('/auth/login', { username, password }),
    registerStudent: (body: { username: string; password: string; display_name: string; join_code?: string }) =>
      http.post<TokenResponse>('/auth/register/student', body),
    registerEducator: (body: {
      username: string
      password: string
      display_name: string
      invite_code: string
      organization_name: string
    }) => http.post<TokenResponse>('/auth/register/educator', body),
    me: () => http.get<User>('/auth/me'),
  },
  profile: {
    get: () => http.get<Profile>('/students/me/profile'),
    update: (body: ProfileUpdate) => http.put<Profile>('/students/me/profile', body),
    joinCohort: (join_code: string) => http.post<Profile>('/students/me/cohorts', { join_code }),
    deleteAccount: () => http.del<void>('/students/me'),
  },
  content: {
    personas: () => http.get<Persona[]>('/personas'),
    concepts: () => http.get<Concept[]>('/concepts'),
    modules: () => http.get<Module[]>('/modules'),
    scenario: (slug: string) => http.get<ScenarioSummary & { config: unknown }>(`/scenarios/${q(slug)}`),
    investingCatalog: () =>
      http.get<{ assets: Asset[]; horizons: number[]; paths: { key: string; label: string }[]; disclaimer: string }>(
        '/catalog/investing',
      ),
  },
  simulations: {
    start: (scenario_slug: string) => http.post<Session>('/simulations/sessions', { scenario_slug }),
    get: (id: string) => http.get<Session>(`/simulations/sessions/${q(id)}`),
    list: (scenario_slug?: string) =>
      http.get<SessionSummary[]>(`/simulations/sessions${scenario_slug ? `?scenario_slug=${q(scenario_slug)}` : ''}`),
    decide: (id: string, type: string, payload: Record<string, unknown>) =>
      http.post<Session>(`/simulations/sessions/${q(id)}/decisions`, { type, payload }),
  },
  calculators: {
    savings: (body: { monthly_deposit: number; months: number; annual_rate: number; opening_balance?: number }) =>
      http.post<SavingsComparison>('/calculators/savings', body),
    headStart: (body: { monthly_deposit: number; annual_rate: number; total_years: number; delay_years: number }) =>
      http.post<{ early: { deposited: number; final_balance: number }; late: { deposited: number; final_balance: number }; difference: number }>(
        '/calculators/head-start',
        body,
      ),
    investment: (body: { amount: number; allocation: Record<string, number>; horizon_years: number }) =>
      http.post<InvestmentProjection>('/calculators/investment', body),
  },
  assessments: {
    list: () => http.get<AssessmentSummary[]>('/assessments'),
    get: (slug: string) => http.get<AssessmentSummary>(`/assessments/${q(slug)}`),
    start: (slug: string) => http.post<AttemptStart>(`/assessments/${q(slug)}/attempts`),
    submit: (attemptId: string, responses: ResponseInput[]) =>
      http.post<AttemptResult>(`/assessments/attempts/${q(attemptId)}/submit`, { responses }),
    result: (attemptId: string) => http.get<AttemptResult>(`/assessments/attempts/${q(attemptId)}`),
  },
  progress: {
    me: () => http.get<Progress>('/progress/me'),
    recommendation: () => http.get<Recommendation>('/progress/me/recommendation'),
    achievements: () => http.get<Achievement[]>('/achievements/me'),
  },
  educator: {
    cohorts: () => http.get<Cohort[]>('/educator/cohorts'),
    createCohort: (name: string) => http.post<Cohort>('/educator/cohorts', { name }),
    overview: (id: number) => http.get<CohortOverview>(`/educator/cohorts/${id}/overview`),
  },
  tutor: {
    ask: (body: { question: string; concept?: string; session_id?: string }) => http.post<TutorAnswer>('/tutor/ask', body),
  },
}
