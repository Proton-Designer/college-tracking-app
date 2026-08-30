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
export { createCourse, getCourse, listCourses, updateCourse } from "./data/courses";
export type { Course, CourseInsert, UpdateCourseInput } from "./data/courses";
export { createTask, deleteTask, listOverdueTasks, listTasksForDate, listTasksForDeliverable, updateTask, updateTaskStatus } from "./data/tasks";
export type { Task, TaskInsert, TaskStatus, TaskProofOfWorkType, UpdateTaskInput } from "./data/tasks";
export { getCheckinForDate, upsertCheckin } from "./data/dailyCheckins";
export type { DailyCheckin, DailyCheckinInsert } from "./data/dailyCheckins";
export { getReviewForDate, upsertReview } from "./data/dailyReviews";
export type { DailyReview, DailyReviewInsert } from "./data/dailyReviews";
export {
  listGradeCategories,
  listGradeItems,
  listGradeBoundaries,
  createGradeCategory,
  updateGradeCategory,
  deleteGradeCategory,
  upsertGradeBoundary,
  deleteGradeBoundary,
} from "./data/gradeStructure";
export type {
  GradeCategoryRow,
  GradeItemRow,
  GradeBoundaryRow,
  CreateGradeCategoryInput,
  UpdateGradeCategoryInput,
  UpsertGradeBoundaryInput,
} from "./data/gradeStructure";
export { getDeliverable, listDeliverables, createDeliverable, updateDeliverable, deleteDeliverable } from "./data/deliverables";
export type { Deliverable, DeliverableType, DeliverableStatus, CreateDeliverableInput, UpdateDeliverableInput } from "./data/deliverables";
export {
  listSyllabusExtractions,
  triggerSyllabusExtraction,
  confirmSyllabusExtraction,
} from "./data/syllabusExtractions";
export type {
  SyllabusExtractionRow,
  TriggerSyllabusExtractionResult,
  ConfirmSyllabusExtractionInput,
  ConfirmSyllabusExtractionResult,
} from "./data/syllabusExtractions";
export { uploadSyllabus } from "./data/syllabusUploads";
export type { SyllabusUpload } from "./data/syllabusUploads";

export { getUserLocalToday } from "./day/today";
export { getDayView } from "./day/dayView";
export type { DayView, CalendarEvent, TaskSession, TodayHealth } from "./day/dayView";
export { submitMorningCheckin } from "./day/submitCheckin";
export type { SubmitMorningCheckinInput, MitTimebox } from "./day/submitCheckin";
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
export {
  findConfrontation,
  recordShown,
  recordResponse,
  setDriftStatement,
  setDriftAlertsEnabled,
} from "./data/drift";
export type { DriftEventRow, DriftContext } from "./data/drift";
export {
  loadSelf,
  createDimension,
  updateDimension,
  setRoute,
  removeRoute,
  listRoutes,
} from "./data/self";
export type { DimensionRow, DimensionRouteRow, SelfView, CreateDimensionInput } from "./data/self";
export {
  saveVision,
  saveBeachhead,
  saveMission,
  saveMom,
  getActiveMom,
  setTaskAnchor,
  setGoalAnchor,
  loadUnanchoredDrift,
  saveMomReview,
  loadVisionChain,
  VISION_MANDATES,
  VISION_MANDATE_LABELS,
} from "./data/vision";
export type {
  VisionRow,
  BeachheadRow,
  MissionRow,
  MomRow,
  MomReviewRow,
  MomOutcome,
  VisionMandate,
  SaveVisionInput,
  SaveChainNodeInput,
  SaveMomReviewInput,
  SaveMomReviewResult,
  ChainGoal,
  MomHistoryEntry,
  VisionChainView,
} from "./data/vision";
export {
  loadDailySession,
  recordReview,
  startLearnSession,
  completeLearnSession,
  countDue,
  loadLibrary,
  listLessonsForSource,
  createSource,
  scheduleFrom,
} from "./data/learn";
export type {
  SourceRow,
  LessonRow,
  LessonCardRow,
  LessonReviewRow,
  LearnSessionRow,
  IngestJobRow,
  CardStateRow,
  LearnCard,
  DailySessionView,
  SessionCompletion,
  SourceLibraryEntry,
} from "./data/learn";
export {
  buildWindowsForDay,
  loadDaySignal,
  saveAllocation,
} from "./data/signal";
export type {
  AllocationCheckinRow,
  CheckinAllocationRow,
  DaySignalView,
  SaveAllocationInput,
} from "./data/signal";
export {
  startHour,
  startSession,
  startDay,
  setSleepIntent,
  getDay,
  logDistraction,
  logGlobalDistraction,
  listDistractionsForSession,
  listHoursForDate,
  listCompletedHoursInRange,
  listDayFactsInRange,
} from "./day/hours";
export { listWall, loadWeekReviewData } from "./day/hours";
export type { WeekReviewData } from "./day/hours";
export type { StartHourInput, StartSessionInput, DistractionRow, DistractionCause, DayRow, WallTile, WallPage, WallCursor } from "./day/hours";
export { getRoutineItems, setRoutineItem } from "./data/routines";
export type { RoutineRow, RoutineType, RoutineItemState } from "./data/routines";
export { listCards, createCard, updateCard, listRotationCards } from "./data/cards";
export type { CardRow, CardType, CreateCardInput, UpdateCardInput } from "./data/cards";
export { listWorries, createWorry, setWorryStatus } from "./data/worries";
export type { WorryRow, WorryStatus } from "./data/worries";
export {
  listHabits,
  createHabit,
  updateHabit,
  setHabitVote,
  listHabitLogsInRange,
  countHabitVotes,
  listVotesForDate,
  MAX_ACTIVE_HABITS,
} from "./data/habits";
export type { HabitRow, HabitLogRow, CreateHabitInput, UpdateHabitInput } from "./data/habits";
export {
  listPrayersInRange,
  listSunnahLogsInRange,
  listAdhkarLogsInRange,
  listQuranSessionsInRange,
  listReflectionEntriesInRange,
  setPrayerStatus,
  clearPrayerStatus,
  toggleSunnahSlot,
  toggleAdhkarPeriod,
  logQuranSession,
  setReflectionIntensity,
  updatePrayerSettings,
  loadDeenOverview,
  QADA_WINDOW_DAYS,
  CONSISTENCY_WINDOW_DAYS,
} from "./data/deen";
export type {
  PrayerLogRow,
  SunnahLogRow,
  AdhkarLogRow,
  QuranSessionRow,
  ReflectionEntryRow,
  SunnahSlot,
  AdhkarPeriod,
  ReflectionIntensity,
  LogQuranSessionInput,
  PrayerSettingsInput,
  DeenLocation,
  DeenQadaState,
  DeenQuranWeek,
  DeenOverview,
} from "./data/deen";
export {
  listGoalsWithMilestones,
  createGoal,
  retireGoal,
  setMilestone,
  setMilestoneDone,
  monthOf,
  MAX_ACTIVE_GOALS,
} from "./data/goals";
export type { GoalRow, MilestoneRow, GoalWithMilestone, CreateGoalInput } from "./data/goals";
export {
  parseAnnouncementText,
  reparseAnnouncement,
  confirmAnnouncement,
  getAnnouncement,
  listAnnouncementsForCourse,
} from "./data/announcements";
export {
  connectCanvas,
  saveCanvasCourseLinks,
  syncCanvasNow,
  getCanvasStatus,
  listReviewableAnnouncements,
  listPendingGradeExtractionsForCourse,
  decideCanvasGrade,
  disconnectCanvas,
} from "./data/canvas";
export type {
  CanvasConnectionRow,
  CanvasCourseLinkRow,
  CanvasCourseOption,
  CanvasCourseLinkInput,
  CanvasGradeExtractionRow,
  CanvasGradeDecisionResult,
  CanvasStatus,
  CanvasSyncOutcome,
  ConnectCanvasResult,
  ReviewableAnnouncement,
} from "./data/canvas";
export type {
  AnnouncementRow,
  AnnouncementChange,
  AnnouncementDiff,
  ParseAnnouncementOutcome,
  ConfirmAnnouncementApplied,
} from "./data/announcements";
export {
  createQuestion,
  retireQuestion,
  listQuestionsForCourse,
  recordAttempt,
  loadQuestionBank,
} from "./data/questionBank";
export type {
  QuestionRow,
  AttemptRow,
  CreateQuestionInput,
  DueQueueEntry,
  QuestionBankState,
} from "./data/questionBank";
export {
  logPracticeTest,
  listPracticeTestsForDeliverable,
  getDeliverableRealScorePct,
} from "./data/practiceTests";
export type { PracticeTestRow, LogPracticeTestInput } from "./data/practiceTests";
export { loadThreeWeekForecast } from "./planning/threeWeekForecast";
export type { ThreeWeekForecastResult } from "./planning/threeWeekForecast";
export {
  buildLectureStoragePath,
  requestLectureTranscription,
  listLectureTranscripts,
  getLectureTranscript,
  deleteLectureAudio,
} from "./data/lectures";
export type { LectureTranscriptRow } from "./data/lectures";
export { draftQuestionsFromNotes } from "./data/questionDraft";
export type { DraftedQuestion, DraftOutcome } from "./data/questionDraft";
export { getMorningBrief } from "./data/morningBrief";
export type { MorningBrief } from "./data/morningBrief";
export { listSchoolTodayItems } from "./day/schoolToday";
export type { SchoolTodayItem } from "./day/schoolToday";
export { saveNightPlan, NIGHT_PLAN_DEFAULT_CATEGORY } from "./day/nightPlan";
export type { NightPlanItem, SaveNightPlanResult } from "./day/nightPlan";
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
export { generateAndPersistWeeklyPlan, getWeeklyPlan, updateWeeklyPlanBlockStatus } from "./planning/weeklyPlan";
export { loadCalendarHorizon, loadThisWeekView, loadBackplanChains } from "./planning/calendarView";
export type {
  CalendarHorizon,
  CalendarObligation,
  ThisWeekView,
  BackplanChain,
} from "./planning/calendarView";
export type {
  WeeklyPlanGenerationResult,
  SkippedDeliverable,
  WeeklyPlanView,
  WeeklyPlanBlockView,
  WeeklyPlanBlockStatus,
  WeeklyPlanUnplacedView,
  WeeklyPlanHighestRiskItem,
  WeeklyPlanCourseAllocation,
} from "./planning/weeklyPlan";
export { computeCourseGradeScenario, computeCourseRequiredScore } from "./academic/gradeScenario";
export { getBackplan, listMilestones } from "./data/backplans";

export { getAgentReport, listAgentReports } from "./data/agentReports";
export type { AgentReport, AgentReportType } from "./data/agentReports";
export { LENS_NAMES, parseNightlyReportPayload } from "./data/nightlyReportPayload";
export type {
  NightlyAgentReportPayload,
  DeterministicNightlyReport,
  DeterministicNightlyReportCheckin,
  DeterministicNightlyReportReview,
  DailyAnalysis,
  EvidenceClaim,
  AcademicRiskNote,
  Intervention,
  KillHabitBounceBack,
  LensName,
} from "./data/nightlyReportPayload";
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
export { listCourseOfficeHours, createOfficeHour, deleteOfficeHour } from "./data/officeHours";
export type { CourseOfficeHourRow, CreateOfficeHourInput } from "./data/officeHours";
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
  runInterventionSweep,
} from "./day/interventionEvaluation";
export type { InterventionSweepResult } from "./day/interventionEvaluation";

export { connectBrightspaceFeed, disconnectBrightspaceFeed, getBrightspaceFeedStatus, listPendingIcsEvents, confirmIcsEvent } from "./data/brightspaceFeeds";
export type { BrightspaceFeedRow, IcsEventExtractionRow, ConfirmIcsEventInput, ConfirmIcsEventResult } from "./data/brightspaceFeeds";

export { listIntegrationStatuses, disconnectIntegration } from "./data/integrations";
export type { IntegrationStatus, OAuthProvider } from "./data/integrations";
export { getMonthlySpend } from "./data/llmUsage";
export type { LlmMonthlySpend } from "./data/llmUsage";
export { exportOwnAccount, deleteOwnAccount } from "./data/accountManagement";
export type { AccountExport, AccountExportFile, DeleteOwnAccountResult } from "./data/accountManagement";
export { updateKillHabit } from "./data/killHabits";
export type { UpdateKillHabitInput } from "./data/killHabits";

// ---------------------------------------------------------------------------
// Life domains -- Fitness, Work, the weekly-goal cadence, the Business lens and
// the Life hub. Exported here because D20 is why: working, tested code with no
// path from '@collegeos/api' is unreachable to both apps.
// ---------------------------------------------------------------------------
export {
  listExercises,
  listWorkoutSessionsInRange,
  listBodyMetricsInRange,
  createExercise,
  setExerciseActive,
  createWorkoutPlan,
  activateWorkoutPlan,
  createPlanSession,
  addPlanSessionExercise,
  logSet,
  deleteSet,
  setWorkoutConfirmed,
  logBodyMetrics,
  setCycleAnchor,
  loadFitnessOverview,
} from "./data/fitness";
export type {
  ExerciseRow,
  WorkoutPlanRow,
  PlanSessionRow,
  PlanSessionExerciseRow,
  WorkoutSessionRow,
  SessionSetRow,
  BodyMetricRow,
  MuscleGroupValue,
  CreateExerciseInput,
  CreateWorkoutPlanInput,
  CreatePlanSessionInput,
  AddPlanSessionExerciseInput,
  LogSetInput,
  LogBodyMetricsInput,
  PlanSessionWithExercises,
  LoggedSet,
  TodayWorkout,
  FitnessOverview,
} from "./data/fitness";

export {
  WORK_PIPELINE_LANES,
  listWorkTargets,
  listWorkShifts,
  createWorkTarget,
  updateWorkTargetStatus,
  createWorkTargetTask,
  updateWorkTargetTaskStatus,
  createWorkShift,
  deleteWorkShift,
  loadWorkOverview,
} from "./data/work";
export type {
  WorkTargetRow,
  WorkTargetTaskRow,
  WorkShiftRow,
  WorkTargetStatus,
  CreateWorkTargetInput,
  CreateWorkTargetTaskInput,
  UpdateWorkTargetTaskStatusInput,
  CreateWorkShiftInput,
  WorkTargetWithTasks,
  ShiftOnDay,
  ShiftDay,
  WorkOverview,
} from "./data/work";

export {
  BUSINESS_TASK_CATEGORY,
  listWeeklyGoals,
  upsertWeeklyGoal,
  setWeeklyGoalCompleted,
  loadBusinessLens,
} from "./data/weeklyGoals";
export type {
  WeeklyGoalRow,
  UpsertWeeklyGoalInput,
  BusinessHoursToday,
  BusinessLens,
} from "./data/weeklyGoals";

export { loadLifeHub } from "./data/life";
export type {
  LifeHub,
  DeenHubStatus,
  BusinessHubStatus,
  SchoolHubStatus,
  FitnessHubStatus,
  WorkHubStatus,
} from "./data/life";

// P8 — Goal Ecology (D49). An unmarked pair has no row and is never "neutral"; the Priority
// Matrix is optional and stores no total. Both rules live in the module's own header.
export {
  GOAL_RELATIONSHIPS,
  listGoalRelationships,
  listGoalPriorityScores,
  markGoalPair,
  clearGoalPairMark,
  setGoalPriorityScores,
  clearGoalPriorityScores,
  loadGoalEcology,
} from "./data/ecology";
export type {
  GoalRelationshipRow,
  GoalPriorityScoreRow,
  MarkGoalPairInput,
  SetGoalPriorityScoresInput,
  GoalEcologyView,
} from "./data/ecology";

// P10 — weekly screen time (D51). A missed week is a gap, not a broken streak; nothing reaches
// screen_time_weeks without an explicit confirmation, and an unread value is a field the user
// fills rather than an invented number.
export {
  SCREEN_TIME_BUCKET,
  SCREEN_TIME_SERIES_WEEKS,
  buildScreenTimeStoragePath,
  createScreenTimeUpload,
  getScreenTimeUpload,
  triggerScreenTimeParse,
  listScreenTimeExtractions,
  confirmScreenTimeWeek,
  listScreenTimeWeeks,
  loadScreenTimeSeries,
  loadScreenTimeStep,
} from "./data/screenTime";
export type {
  ScreenTimeUploadRow,
  ScreenTimeExtractionRow,
  ScreenTimeWeekRow,
  CreateScreenTimeUploadInput,
  ScreenTimeFieldInput,
  UnresolvedScreenTimeField,
  ConfirmScreenTimeWeekInput,
  ConfirmScreenTimeWeekResult,
  ScreenTimeSeries,
  ScreenTimeStepView,
} from "./data/screenTime";
