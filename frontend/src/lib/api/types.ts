/**
 * TypeScript mirror of the RupeeRise API contract (backend/app/schemas and
 * docs/api-contracts.md). Change these only together with the backend, via PR.
 */

export type Role = 'student' | 'educator' | 'admin'
export type Language = 'en' | 'hi' | 'te'
export type LearningLevel = 'beginner' | 'intermediate' | 'advanced'
export type Pillar = 'budgeting' | 'saving' | 'investing' | 'safety'
export type ScenarioKind = 'budget' | 'savings' | 'investing' | 'safety' | 'money_lab'
export type Tone = 'positive' | 'caution' | 'negative'

export interface User {
  id: string
  username: string
  display_name: string
  role: Role
  organization_id: number | null
}

/** Browsers never see a token: the session is in HttpOnly cookies. */
export interface AuthResponse {
  expires_in: number
  user: User
  csrf_token?: string
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
export interface MoneyLabState {
  total: number
  essential_min: number
  months: number
  goal: { label: string; amount: number }
  inflation_pct: number
  buckets: { key: 'spend' | 'ready' | 'deposit' | 'growth'; label: string; note: string }[]
  assumptions: MoneyLabAssumptions
  plan?: Record<'spend' | 'ready' | 'deposit' | 'growth', number>
  at_event?: Record<'ready' | 'deposit' | 'growth', number>
  event?: { month: number; title: string; description: string; amount: number }
  options?: { key: 'ready' | 'deposit' | 'growth' | 'borrow'; label: string; note: string; available: number | null; feasible: boolean }[]
}

export interface MoneyLabAssumptions {
  starting_amount: number
  months: number
  contributions: string
  deposit_rate_pct: number
  inflation_pct: number
  borrow_extra_pct: number
  growth: string
  limitations: string[]
  disclaimer: string
}

export interface MoneyLabResult {
  plan: Record<'spend' | 'ready' | 'deposit' | 'growth', number>
  event: NonNullable<MoneyLabState['event']>
  assumptions: MoneyLabAssumptions
  source: string
  final: Record<'ready' | 'deposit' | 'growth', number>
  saved_total: number
  goal_price: number
  goal_reached: boolean
  real_value: number
  inflation_drag: number
  borrowed: number
  repay_extra: number
  score: number
  components: Record<string, number>
  feedback: Feedback[]
  path_label: string
  timeline: { month: number; ready: number; deposit: number; growth: number; total: number }[]
  rewards?: ResultReward[]
}

export type MoneyLabSession = SessionBase<'money_lab', MoneyLabState, MoneyLabResult>
export type Session = BudgetSession | SavingsSession | InvestingSession | SafetySession | MoneyLabSession

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
  cooldown_seconds?: number
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
  rewards: RewardEntry[]
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
  stages: { key: string; label: string; grades: string; students: number }[]
  reflection_gaps: { concept: string; label: string; count: number }[]
  follow_ups: { topic: string; suggestion: string }[]
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

// --- Educational reward wallet (fictional learning money) -----------------------

export interface RewardEntry {
  id: number
  entry_type: 'reward' | 'transfer_out'
  amount: number
  reason: string
  rule_key: string
  source_type: string
  source_ref: string | null
  concept: string | null
  created_at: string
}

export interface RewardRule {
  key: string
  label: string
  amount: number
}

export interface LevelProgress {
  xp: number
  level: number
  title: string
  xp_into_level: number
  xp_for_level: number
  next_title: string | null
  max_level: boolean
  sources: string
}

export interface Wallet {
  balance: number
  total_earned: number
  level: LevelProgress
  history: RewardEntry[]
  rules: RewardRule[]
  notice: string
}

/** Reward summary stored with a finished simulation result. */
export interface ResultReward {
  amount: number
  reason: string
  rule_key: string
  concept: string | null
}

// --- Portfolio Quest (fictional practice portfolio; money in integer paise) -------

export interface PortfolioAccess {
  open: boolean
  reason: string | null
  single_company_unlocked: boolean
  single_company_reason: string | null
  stage: StageKey
}

export interface PortfolioInstrument {
  key: string
  label: string
  description: string
  risk_level: 'low' | 'medium' | 'high' | 'very_high'
  single_company: boolean
  locked: boolean
  lock_reason: string | null
  price_paise: number
  price_history_paise?: number[]
}

export interface PortfolioHoldingRow {
  instrument_key: string
  quantity: number
  cost_paise: number
  avg_cost_paise: number
  price_paise: number
  value_paise: number
  gain_paise: number
  weight_pct: number
}

export interface PortfolioState {
  run_number: number
  round: number
  max_round: number
  complete: boolean
  starting_cash_paise: number
  transferred_paise: number
  transfer_remaining_rupees: number
  cash_paise: number
  invested_paise: number
  total_paise: number
  contributed_paise: number
  gain_paise: number
  holdings: PortfolioHoldingRow[]
  history: { round: number; total_paise: number }[]
  /** One entry per completed year (never a future year). */
  years: YearSummary[]
}

export type YearMood = 'crash' | 'recovery' | 'rally' | 'sideways' | 'calm'

export interface YearSummary {
  round: number
  mood: YearMood
  title: string
  summary: string
  market_change_pct: number
  total_before_paise: number
  total_after_paise: number
  change_paise: number
  change_pct: number
  best: { key: string; label: string; return_pct: number }
  worst: { key: string; label: string; return_pct: number }
  consequence: string
  prompt: string
}

export interface PortfolioTx {
  id: number
  run_number: number
  round: number
  kind: 'open' | 'buy' | 'sell' | 'transfer_in' | 'advance' | 'reset'
  instrument_key: string | null
  quantity: number | null
  price_paise: number | null
  amount_paise: number
  cash_after_paise: number
  note: string | null
  created_at: string
}

export interface PortfolioEvent {
  round: number
  market_change_pct: number
  headline: string
  reflection: string[]
}

export interface PortfolioView {
  access: PortfolioAccess
  disclaimer: string
  wallet_balance: number
  transfer_cap_rupees: number
  portfolio: PortfolioState | null
  instruments: PortfolioInstrument[]
  transactions: PortfolioTx[]
  event?: PortfolioEvent
  replayed?: boolean
}

export interface TradeQuote {
  instrument_key: string
  label: string
  side: 'buy' | 'sell'
  quantity: number
  price_paise: number
  total_paise: number
  cash_after_paise: number
  warnings: string[]
  disclaimer: string
}

// --- Learning status and reflections ------------------------------------------------

export interface ScoreComponent {
  key: 'assessments' | 'decisions' | 'reflection' | 'safe_behavior'
  score: number
  weight: number
  points: number
  explanation: string
  recovery: string
}

export interface LevelRequirement {
  key: string
  label: string
  met: boolean
}

export interface LevelInfo {
  level: number
  title: string
  summary: string
  unlocked: boolean
  requirements: LevelRequirement[]
}

export interface LearningStatus {
  score: { total: number; components: ScoreComponent[]; note: string }
  level: { current: number; current_title: string; levels: LevelInfo[]; next: LevelInfo | null }
}

export interface ReflectionPrompt {
  available: boolean
  question_key: string | null
  prompt: string | null
  options: { key: string; text: string }[]
}

export interface ReflectionResult {
  correct: boolean
  explanation: string
  correct_option: { key: string; text: string }
  misconception: string | null
  rewards: RewardEntry[]
}

// --- Banking Explorer (education only) -------------------------------------------------

export interface ExplorerSource {
  id: string
  title: string
  publisher: string
  url: string
  checked: string
}

export interface ExplorerStop {
  key: string
  title: string
  story: string
  facts: string[]
  question: string
  options: { key: string; text: string }[]
  sources: ExplorerSource[]
  attempts: number
  completed: boolean
}

export interface ExplorerJourney {
  title: string
  intro: string
  last_verified: string
  disclaimer: string
  stops: ExplorerStop[]
  completed: number
  total: number
}

export interface ExplorerAnswer {
  correct: boolean
  explanation: string
  correct_option: { key: string; text: string }
  journey_complete: boolean
  rewards: RewardEntry[]
}

// --- Market Lab (Portfolio Quest) ------------------------------------------------------

export type DataStatus = 'live' | 'delayed' | 'mixed' | 'demo'
export type NewsCategory = 'Earnings' | 'Policy' | 'Sector' | 'Global' | 'Company' | 'Macro'
export type Impact = 'Up' | 'Down' | 'Mixed' | 'Watch'

export interface ReferenceQuote {
  key: string
  name: string
  ticker: string
  symbol: string
  sector: string
  about: string
  risk_level: string
  price_paise: number
  prev_close_paise: number
  change_paise: number
  change_pct: number
  history: { date: string; close_paise: number }[]
  as_of: string
  source: 'alpha_vantage' | 'demo'
}

export interface MarketData {
  status: Exclude<DataStatus, 'live'>
  provider: string
  note: string
  as_of: string | null
  quotes: ReferenceQuote[]
  disclaimer: string
}

export interface NewsItem {
  id: string
  title: string
  snippet: string
  source: string
  url: string | null
  image_url: string | null
  published_at: string | null
  category: NewsCategory
  impact: Impact
  why: string
  affected: string[]
  is_demo: boolean
}

export interface NewsFeed {
  status: 'live' | 'demo'
  provider: string
  note: string
  items: NewsItem[]
}

export interface ScenarioCard {
  key: string
  title: string
  kicker: string
  summary: string
  skills: string[]
  steps: number
  unit: 'day' | 'year'
  focus: string[]
  attempts: number
  completed: number
  best_result_pct: number | null
  understood: boolean
  reward: number
}

export interface LabCompany {
  key: string
  name: string
  ticker: string
  sector: string
  about: string
  risk_level: string
  price_paise: number
  change_paise: number
  change_pct: number
  since_start_pct: number
  history_paise: number[]
  held: number
  in_focus: boolean
}

export interface LabHolding {
  key: string
  name: string
  sector: string
  quantity: number
  avg_cost_paise: number
  price_paise: number
  value_paise: number
  day_change_paise: number
  day_change_pct: number
  pnl_paise: number
  pnl_pct: number
  weight_pct: number
}

export interface LabEvent {
  step: number
  label: string
  category: NewsCategory
  headline: string
  body: string
  why: string
  impact: Impact
  affected: string[]
  after: string | null
  is_new: boolean
}

export interface JournalEntry {
  id: number
  step: number
  label: string
  action: 'buy' | 'sell' | 'hold'
  key: string | null
  name: string | null
  qty: number
  price_paise: number
  reason: string
  reason_label: string
  at: string
  outcome: { move_pct: number; effect_paise: number; text: string; causes: string[] } | null
}

export interface LabSession {
  id: string
  status: 'active' | 'completed' | 'abandoned'
  scenario: {
    key: string
    title: string
    kicker: string
    summary: string
    lesson: string | null
    steps: number
    unit: 'day' | 'year'
    labels: string[]
    event_steps: number[]
  }
  step: number
  step_label: string
  is_last_step: boolean
  reference: { source: DataStatus; as_of: string | null }
  cash_paise: number
  starting_cash_paise: number
  invested_paise: number
  total_paise: number
  pnl_paise: number
  pnl_pct: number
  day_change_paise: number
  day_change_pct: number
  drawdown_pct: number
  max_drawdown_pct: number
  risk: { score: number; level: 'Low' | 'Moderate' | 'High'; top_weight_pct: number; note: string }
  allocation: { label: string; pct: number }[]
  holdings: LabHolding[]
  companies: LabCompany[]
  series: { step: number; label: string; total_paise: number; benchmark_paise: number }[]
  events: LabEvent[]
  recap: {
    label: string
    market_pct: number
    portfolio_change_paise: number
    best: { key: string; name: string; pct: number }
    worst: { key: string; name: string; pct: number }
    headlines: string[]
  } | null
  journal: JournalEntry[]
  actions_left: number
  max_weight_pct: number
  debrief: {
    prompt: string
    options: { key: string; text: string }[]
    answer: string | null
    correct: boolean | null
    correct_key: string | null
    explanation: string | null
    reward: number | null
  } | null
}

export interface LabOverview {
  access: PortfolioAccess
  disclaimer: string
  starting_cash_paise: number
  max_weight_pct: number
  reasons: { key: string; label: string }[]
  wallet_balance: number
  scenarios: ScenarioCard[]
  session: LabSession | null
}

export interface Streak {
  today: string
  weeks: number
  days: { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 }[]
  current: number
  longest: number
  active_days: number
  today_done: boolean
  milestones: { days: number; label: string; reached: boolean }[]
  next_milestone: number | null
  habits: { key: string; label: string; done: boolean }[]
}
