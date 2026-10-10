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
  AuthResponse,
  TutorAnswer,
  User,
  ExplorerAnswer,
  ExplorerJourney,
  LearningStatus,
  PortfolioView,
  ReflectionPrompt,
  ReflectionResult,
  TradeQuote,
  Wallet,
} from './types'

const q = (v: string) => encodeURIComponent(v)

export const api = {
  portfolio: {
    get: () => http.get<PortfolioView>('/portfolio'),
    open: (request_id: string) => http.post<PortfolioView>('/portfolio/open', { request_id }),
    quote: (body: { instrument_key: string; side: 'buy' | 'sell'; quantity: number }) =>
      http.post<TradeQuote>('/portfolio/quote', body),
    trade: (body: { request_id: string; instrument_key: string; side: 'buy' | 'sell'; quantity: number }) =>
      http.post<PortfolioView>('/portfolio/trades', { ...body, confirm: true }),
    advance: (request_id: string) => http.post<PortfolioView>('/portfolio/advance', { request_id, confirm: true }),
    reset: (request_id: string) => http.post<PortfolioView>('/portfolio/reset', { request_id, confirm: true }),
    transfer: (request_id: string, amount: number) =>
      http.post<PortfolioView>('/portfolio/transfer', { request_id, amount, confirm: true }),
  },
  learning: {
    status: () => http.get<LearningStatus>('/learning/status'),
  },
  reflections: {
    prompt: (session_id: string) => http.get<ReflectionPrompt>(`/reflections/prompt?session_id=${q(session_id)}`),
    answer: (body: { session_id: string; question_key: string; selected: string; confidence?: 'low' | 'medium' | 'high' }) =>
      http.post<ReflectionResult>('/reflections', body),
  },
  banking: {
    get: () => http.get<ExplorerJourney>('/banking-explorer'),
    answer: (stop: string, selected: string) => http.post<ExplorerAnswer>(`/banking-explorer/stops/${q(stop)}/answer`, { selected }),
  },
  wallet: {
    get: (limit = 50) => http.get<Wallet>(`/wallet?limit=${limit}`),
  },
  auth: {
    login: (username: string, password: string) => http.post<AuthResponse>('/auth/login', { username, password }),
    registerStudent: (body: { username: string; password: string; display_name: string; join_code?: string }) =>
      http.post<AuthResponse>('/auth/register/student', body),
    registerEducator: (body: {
      username: string
      password: string
      display_name: string
      invite_token: string
    }) => http.post<AuthResponse>('/auth/register/educator', body),
    me: () => http.get<User>('/auth/me'),
    logout: () => http.post<void>('/auth/logout'),
    changePassword: (current_password: string, new_password: string) =>
      http.post<AuthResponse>('/auth/password', { current_password, new_password }),
  },
  profile: {
    get: () => http.get<Profile>('/students/me/profile'),
    update: (body: ProfileUpdate) => http.put<Profile>('/students/me/profile', body),
    joinCohort: (join_code: string) => http.post<Profile>('/students/me/cohorts', { join_code }),
    deleteAccount: (current_password: string) => http.del<void>('/students/me', { current_password }),
    leaveOrganization: (current_password: string) =>
      http.post<Profile>('/students/me/organization/leave', { current_password }),
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
