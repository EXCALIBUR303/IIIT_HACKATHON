/**
 * TypeScript mirror of the RupeeRise API contract (backend/app/schemas and
 * docs/api-contracts.md). Change these only together with the backend, via PR.
 */

export type Role = 'student' | 'educator' | 'admin'
export type Language = 'en' | 'hi' | 'te'
export type LearningLevel = 'beginner' | 'intermediate' | 'advanced'
export type Pillar = 'budgeting' | 'saving' | 'investing' | 'safety'
export type ScenarioKind = 'budget' | 'savings' | 'investing' | 'safety'
export type Tone = 'positive' | 'caution' | 'negative'

export interface User {
  id: string
  username: string
  display_name: string
  role: Role
  organization_id: number | null
}

export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  user: User
}

export interface Preferences {
  large_text: boolean
  reduced_motion: boolean
  high_contrast: boolean
  show_hints: boolean
}

export type StageKey = 'explorer' | 'builder' | 'future_planner' | 'investor_sandbox'

export interface Stage {
  key: StageKey
  label: string
  grades: string
  tagline: string
  portfolio_quest: boolean
}

export interface Profile {
  user: User
  grade: 7 | 8 | 9 | 10 | 11 | 12 | 13 | null
  stage: Stage
  language: Language
  learning_level: LearningLevel
  persona_key: string | null
  onboarding_completed: boolean
  preferences: Preferences
  cohorts: { id: number; name: string }[]
}

export type ProfileUpdate = Partial<Omit<Profile, 'user' | 'cohorts' | 'stage'>> & { display_name?: string }

export interface Persona {
  key: string
  name: string
  age: number
  grade: string
  area: string
  situation: string
  money_source: string
  monthly_money: number
  goal: string
  maturity: LearningLevel
  color: string
}

export interface Concept {
  key: string
  pillar: Pillar
  title: string
  explanation: string
  example: string
}

export interface ScenarioSummary {
  slug: string
  kind: ScenarioKind
  title: string
  intro: string
  objective: string
  difficulty: 1 | 2 | 3
  persona_key: string | null
  module_slug: string
  pillar: Pillar
  stages?: StageKey[]
}

export interface Module {
  slug: string
  pillar: Pillar
  title: string
  summary: string
  order: number
  objectives: string[]
  concepts: string[]
  quiz_slug: string | null
  scenarios: ScenarioSummary[]
}

export interface Feedback {
  tone: Tone
  concept: string
  message: string
}

// --- Simulation sessions ----------------------------------------------------

export interface SessionBase<K extends ScenarioKind, S, R> {
  id: string
  scenario_slug: string
  kind: K
  attempt_number: number
  status: 'in_progress' | 'completed' | 'abandoned'
  phase: string
  state: S
  result: R | null
  score: number | null
  previous_best: number | null
  new_achievements: string[]
  started_at: string
  completed_at: string | null
}

export interface BudgetCategory {
  key: string
  label: string
  kind: 'need' | 'want' | 'savings'
  essential_min: number
  hint: string
}

export interface BudgetAllocationResult {
  allocations: Record<string, number>
  total_allocated: number
  buffer: number
  needs_total: number
  wants_total: number
  savings_total: number
  shortfalls: Record<string, number>
  components: Record<'needs_covered' | 'savings_habit' | 'wants_in_check' | 'goal_on_track', number>
  score: number
  goal_progress_pct: number
  feedback: Feedback[]
}

export interface ResponseOption {
  key: string
  label: string
  feasible: boolean
  explanation: string
}

export interface BudgetState {
  income: number
  goal: { label: string; amount: number; months: number; monthly_target: number }
  categories: BudgetCategory[]
  allocation?: BudgetAllocationResult
  event?: { key: string; title: string; description: string; amount: number; kind: 'expense' | 'income_drop'; essential: boolean }
  options?: ResponseOption[]
}

export interface BudgetOutcome {
  event_key: string
  response: string
  cost: number
  paid_from: { wants: number; savings: number; buffer: number }
  borrowed: number
  remaining_savings: number
  remaining_wants: number
  remaining_buffer: number
  goal_progress_pct: number
  handling_score: number
  best_response: string
  feedback: Feedback[]
}

export interface BudgetResult {
  allocation: BudgetAllocationResult
  event: NonNullable<BudgetState['event']>
  outcome: BudgetOutcome
  score: number
}

export interface SavingsAccount {
  key: string
  label: string
  annual_rate: number
  compounding: 'none' | 'simple' | 'monthly'
  note: string
}

export interface MonthRow {
  month: number
  deposit: number
  withdrawal: number
  interest: number
  balance: number
}

export interface Projection {
  rows: MonthRow[]
  total_deposited: number
  total_withdrawn: number
  total_interest: number
  final_balance: number
}

export interface SavingsState {
  income: number
  fixed_spending: number
  capacity: number
  months: number
  goal: { label: string; amount: number }
  accounts: SavingsAccount[]
  plan?: { goal_saving: number; emergency_saving: number; account: string }
  before_event?: { goal_balance: number; emergency_balance: number; month: number }
  event?: { month: number; title: string; description: string; amount: number }
  options?: ResponseOption[]
}

export interface SavingsResult {
  plan: NonNullable<SavingsState['plan']>
  event: NonNullable<SavingsState['event']>
  goal_projection: Projection
  emergency_projection: Projection
  goal_reached_month: number | null
  goal_reached: boolean
  paid_from_emergency: number
  paid_from_goal: number
  borrowed: number
  score: number
  components: Record<string, number>
  feedback: Feedback[]
  account_comparison: { account: string; label: string; final_balance: number; interest: number }[]
}

export interface Asset {
  key: string
  label: string
  description: string
  risk_level: 'low' | 'medium' | 'high' | 'very_high'
  single_company: boolean
}

export interface MonteCarlo {
  runs: number
  seed: number
  bands: { year: number; p10: number; p50: number; p90: number }[]
  probability_of_loss: number
  worst_case_p10: number
  median: number
  best_case_p90: number
}

export interface PathRow {
  year: number
  value: number
  return_pct: number
}

export interface CrashEvent {
  path: string
  year: number
  value: number
  change_pct: number
  year_change_pct: number
  market_change_pct: number
  options: { key: 'hold' | 'sell_all' | 'rebalance'; label: string }[]
}

export interface InvestingState {
  amount: number
  horizons: number[]
  assets: Asset[]
  disclaimer: string
  allocation?: Record<string, number>
  horizon_years?: number
  event?: CrashEvent
}

export interface InvestingResult {
  allocation: Record<string, number>
  horizon_years: number
  action?: 'hold' | 'sell_all' | 'rebalance'
  event?: CrashEvent
  score: number
  components: Record<string, number>
  diversification: number
  volatility: number
  risk_level: Asset['risk_level']
  path_result: { path: string; label: string; rows: PathRow[]; final: number; outcome_by_action: Record<string, number> } | null
  monte_carlo: MonteCarlo
  loss_probability_by_horizon: { horizon_years: number; probability_of_loss: number }[]
  feedback: Feedback[]
  disclaimer: string
}

export interface SafetyMessage {
  id: string
  channel: string
  sender: string
  body: string
}

export interface SafetyEvaluation {
  message_id: string
  verdict: 'scam' | 'genuine'
  correct_verdict: 'scam' | 'genuine'
  verdict_correct: boolean
  flags_found: string[]
  flags_missed: string[]
  flags_incorrect: string[]
  action: string
  action_safe: boolean
  best_action: string
  explanation: string
  score: number
  feedback: Feedback[]
}

export interface SafetyState {
  messages: SafetyMessage[]
  answered: SafetyEvaluation[]
  red_flags: { key: string; label: string }[]
  actions: { key: string; label: string }[]
}

export interface SafetyResult {
  score: number
  correct_verdicts: number
  total: number
  messages: SafetyEvaluation[]
}

export type BudgetSession = SessionBase<'budget', BudgetState, BudgetResult>
export type SavingsSession = SessionBase<'savings', SavingsState, SavingsResult>
export type InvestingSession = SessionBase<'investing', InvestingState, InvestingResult>
export type SafetySession = SessionBase<'safety', SafetyState, SafetyResult>
export type Session = BudgetSession | SavingsSession | InvestingSession | SafetySession

export interface SessionSummary {
  id: string
  scenario_slug: string
  scenario_title: string
  kind: ScenarioKind
  attempt_number: number
  status: string
  score: number | null
  started_at: string
  completed_at: string | null
}

export interface InvestmentProjection {
  amount: number
  allocation: Record<string, number>
  horizon_years: number
  paths: { key: string; label: string; rows: PathRow[]; final: number }[]
  path_range: { lowest: number; highest: number }
  monte_carlo: MonteCarlo
  loss_probability_by_horizon: { horizon_years: number; probability_of_loss: number }[]
  diversification: number
  volatility: number
  risk_level: Asset['risk_level']
  disclaimer: string
}

export interface SavingsComparison {
  simple: Projection
  compound: Projection
  compounding_advantage: number
}

// --- Assessments --------------------------------------------------------------

export interface AssessmentSummary {
  slug: string
  kind: 'initial' | 'module' | 'post'
  title: string
  description: string
  module_slug: string | null
  question_count: number
  attempts: number
  best_score: number | null
  available: boolean
  locked_reason: string | null
}

export interface Question {
  slug: string
  concept: string
  difficulty: number
  prompt: string
  options: { key: string; text: string }[]
}

export interface AttemptStart {
  attempt_id: string
  assessment: AssessmentSummary
  questions: Question[]
}

export interface ResponseInput {
  question_slug: string
  option_key: string
  confidence?: 'low' | 'medium' | 'high'
  response_ms?: number
}

export interface QuestionResult {
  question_slug: string
  prompt: string
  concept: string
  selected: string
  correct_key: string
  is_correct: boolean
  explanation: string
  correct_explanation: string
  misconception: string | null
  misconception_label: string | null
  rapid: boolean
}

export interface AttemptResult {
  attempt_id: string
  assessment_slug: string
  attempt_number: number
  score_pct: number
  correct_count: number
  total: number
  flagged_guessing: boolean
  concepts: Record<string, { correct: number; total: number }>
  misconceptions: { key: string; label: string }[]
  questions: QuestionResult[]
  new_achievements: string[]
  submitted_at: string
}

// --- Progress -----------------------------------------------------------------

export type MasteryLevel = 'not_started' | 'needs_practice' | 'developing' | 'mastered'

export interface Recommendation {
  kind: 'onboarding' | 'assessment' | 'scenario' | 'review'
  slug: string | null
  title: string
  reason: string
  pillar?: Pillar | null
  difficulty?: number | null
}

export interface Progress {
  modules: { slug: string; title: string; pillar: Pillar; percent: number; simulation_done: boolean; quiz_best: number | null; completed: boolean }[]
  concepts: { concept: string; title: string; pillar: Pillar; mastery: number | null; level: MasteryLevel; evidence_count: number }[]
  strengths: string[]
  practice_areas: string[]
  pre_post: {
    initial_score: number
    post_score: number | null
    change: number | null
    initial_flagged_guessing: boolean
    post_flagged_guessing: boolean
    concepts: { concept: string; initial: number; post: number | null }[]
    note: string
  } | null
  activity: { simulations_completed: number; assessments_completed: number; modules_completed: number }
  recent: { type: 'simulation' | 'assessment'; slug: string; title: string; score: number | null; at: string | null }[]
  recommendation: Recommendation
}

export interface Achievement {
  slug: string
  title: string
  description: string
  icon: string
  earned: boolean
  awarded_at: string | null
}

// --- Educator -----------------------------------------------------------------

export interface Cohort {
  id: number
  name: string
  join_code: string
  student_count: number
  created_at: string
}

export interface CohortOverview {
  cohort: { id: number; name: string; join_code: string }
  student_count: number
  generated_at: string
  participation: { active_7d: number; started: number; onboarded: number }
  modules: { slug: string; title: string; pillar: Pillar; completed: number; started: number }[]
  concepts: { concept: string; title: string; pillar: Pillar; students_assessed: number; avg_mastery: number | null; needs_practice: number }[]
  assessment: { initial_avg: number | null; initial_count?: number; post_avg: number | null; post_count?: number; paired: number; avg_change: number | null; note?: string }
  support_topics: CohortOverview['concepts']
  misconceptions: { key: string; label: string; concept: string; count: number }[]
  students: {
    id: string
    display_name: string
    last_active_at: string | null
    onboarded: boolean
    modules_completed: number
    avg_mastery: number | null
    initial_score: number | null
    post_score: number | null
    needs_support: boolean
  }[]
}

export interface TutorAnswer {
  answer: string
  source: 'ai' | 'fallback'
  concept: string | null
  grounded_on: string[]
  disclaimer: string
}

export interface ApiErrorBody {
  error: { code: string; message: string; field?: string; details?: { field: string; message: string }[] }
}
