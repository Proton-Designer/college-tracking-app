export { resolveAppEnvironment } from "./env";
export type { AppEnvironment, AppEnvironmentInput, AppEnvironmentMode } from "./env";

export type { Database } from "./database.types";

// Platform-specific client factories are NOT re-exported here -- import
// '@collegeos/api/web' or '@collegeos/api/native' instead. Each pulls in
// platform-only code (@supabase/ssr; react-native + AsyncStorage) that must never reach
// the other platform's bundle. This barrel only carries the universal types.
export type { CookieAdapter, TypedSupabaseClient } from "./client/types";
export type { AuthChangeEvent, Session } from "@supabase/supabase-js";

export type { AuthError, AuthErrorCode, AuthResult } from "./auth/types";
export {
  getSession,
  onAuthStateChange,
  resetPassword,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from "./auth/auth";
export type { SignInInput, SignUpInput } from "./auth/auth";

export type { DataError, DataErrorCode, DataResult } from "./data/types";
export { getOwnProfile, updateOwnProfile } from "./data/profiles";
export type { Profile, ProfileUpdate } from "./data/profiles";
export { createCourse, getCourse, listCourses } from "./data/courses";
export type { Course, CourseInsert } from "./data/courses";
export { createTask, listOverdueTasks, listTasksForDate, updateTaskStatus } from "./data/tasks";
export type { Task, TaskInsert, TaskStatus } from "./data/tasks";
export { getCheckinForDate, upsertCheckin } from "./data/dailyCheckins";
export type { DailyCheckin, DailyCheckinInsert } from "./data/dailyCheckins";
export { getReviewForDate, upsertReview } from "./data/dailyReviews";
export type { DailyReview, DailyReviewInsert } from "./data/dailyReviews";
export { listGradeCategories, listGradeItems, listGradeBoundaries } from "./data/gradeStructure";
export type { GradeCategoryRow, GradeItemRow, GradeBoundaryRow } from "./data/gradeStructure";
export { listDeliverables } from "./data/deliverables";
export type { Deliverable } from "./data/deliverables";
export { uploadSyllabus } from "./data/syllabusUploads";
export type { SyllabusUpload } from "./data/syllabusUploads";

export { getUserLocalToday } from "./day/today";
export { getDayView } from "./day/dayView";
export type { DayView, CalendarEvent, TaskSession, TodayHealth } from "./day/dayView";
export { submitMorningCheckin } from "./day/submitCheckin";
export type { SubmitMorningCheckinInput } from "./day/submitCheckin";
export { submitNightReview, getNightReviewDraft, completionPctFromDraft } from "./day/submitReview";
export type { SubmitNightReviewInput, NightReviewDraft } from "./day/submitReview";
export { scorePredictionForDate, getPredictionForDate } from "./day/predictions";
export type { DailyPredictionRow } from "./day/predictions";
export { rankSuggestedMits, marginalRiskReduction } from "./day/workload";
export type { SuggestedMit, TodayWorkload } from "./day/workload";
export { computeRiskAssessment } from "./day/risk";
export type { DeliverableRisk, CourseRiskSummary, RiskAssessment } from "./day/risk";
export { loadCourseGradeProjections } from "./day/grades";
export type { CourseGradeProjection } from "./day/grades";
export { listCalibrationTable } from "./day/calibration";
export type { CalibrationTableRow } from "./day/calibration";
export { computeYesterdayPlanningExecution } from "./day/planningExecution";
export {
  startFocusSession,
  completeFocusSession,
  abandonFocusSession,
  getActiveFocusSession,
  getFocusSessionContext,
} from "./day/focusSessions";
export type {
  TaskSessionRow,
  FocusSessionStatus,
  StartFocusSessionInput,
  StartFocusSessionResult,
  EndFocusSessionInput,
  FocusSessionContext,
} from "./day/focusSessions";
export { computeHabitBounceBack } from "./day/killLoopBounceBack";
export { createKillHabit, listKillHabits, deactivateKillHabit, setMaxEscalationLevel } from "./data/killHabits";
export type { KillHabitRow, CommitmentLevel, CreateKillHabitInput } from "./data/killHabits";
export { logKillEvent, listKillEvents } from "./data/killEvents";
export type { KillEventRow, KillEventOutcome, LogKillEventInput } from "./data/killEvents";
export { logFriction, listFrictionLogs } from "./data/frictionLogs";
export type { FrictionLogRow, FrictionCause, LogFrictionInput } from "./data/frictionLogs";
export { computeUserFrictionDistribution, computeUserFrictionTrend } from "./day/frictionAnalytics";
export { submitProofOfWork } from "./data/proofOfWork";
export type { ProofOfWorkType, SubmitProofOfWorkInput } from "./data/proofOfWork";

export { generateAndPersistBackplan, computeCapacityHorizon } from "./academic/backplan";
export type { GenerateBackplanResult, CapacityDay } from "./academic/backplan";
export { generateAndPersistWeeklyPlan } from "./planning/weeklyPlan";
export type { WeeklyPlanGenerationResult, SkippedDeliverable } from "./planning/weeklyPlan";
export { computeCourseGradeScenario, computeCourseRequiredScore } from "./academic/gradeScenario";
export { getBackplan, listMilestones } from "./data/backplans";

export { getAgentReport, listAgentReports } from "./data/agentReports";
export type { AgentReport, AgentReportType } from "./data/agentReports";
export { getDailySummary, listRecentDailySummaries, getWeeklySummary, getMonthlySummary } from "./data/summaries";
export type { DailySummaryRow, WeeklySummaryRow, MonthlySummaryRow } from "./data/summaries";
export { listActiveInsights } from "./data/insights";
export type { Insight } from "./data/insights";

export {
  createExperiment,
  getExperiment,
  getExperimentOutcome,
  listExperiments,
  logExperimentMeasurement,
  listExperimentMeasurements,
  scoreExperiment,
} from "./data/experiments";
export type {
  Experiment,
  ExperimentMeasurementRow,
  CreateExperimentInput,
  LogExperimentMeasurementInput,
  ScoreExperimentInput,
  ScoreExperimentResult,
} from "./data/experiments";
export { logDecision, scoreDecision, getDecision, listDecisions } from "./data/decisionJournal";
export type { DecisionJournalRow, LogDecisionInput, ScoreDecisionInput } from "./data/decisionJournal";
export { createSemesterLesson, listSemesterLessons, listSemesterLessonsForTerm } from "./data/semesterLessons";
export type { SemesterLessonRow, CreateSemesterLessonInput } from "./data/semesterLessons";
export type { DeliverableBackplanRow, BackplanMilestoneRow } from "./data/backplans";

export {
  createIntervention,
  markInterventionDelivered,
  recordInterventionResponse,
  getIntervention,
  listPendingInterventions,
  listInterventionsForDate,
} from "./data/interventions";
export type {
  InterventionRow,
  InterventionKind,
  InterventionStatus,
  CreateInterventionInput,
  RecordInterventionResponseInput,
} from "./data/interventions";
export {
  evaluateUpcomingBlockNotifications,
  evaluateDeviationPrompts,
  respondToDeviationPrompt,
  evaluateEscalations,
  evaluateStaleTaskPrompts,
  respondToStaleTaskPrompt,
} from "./day/interventionEvaluation";

export { getBrightspaceFeedStatus, listPendingIcsEvents } from "./data/brightspaceFeeds";
export type { BrightspaceFeedRow, IcsEventExtractionRow } from "./data/brightspaceFeeds";
