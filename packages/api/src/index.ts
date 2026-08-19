export { resolveAppEnvironment } from "./env";
export type { AppEnvironment, AppEnvironmentInput, AppEnvironmentMode } from "./env";

export type { Database } from "./database.types";

// Platform-specific client factories are NOT re-exported here -- import
// '@collegeos/api/web' or '@collegeos/api/native' instead. Each pulls in
// platform-only code (@supabase/ssr; react-native + AsyncStorage) that must never reach
// the other platform's bundle. This barrel only carries the universal types.
export type { CookieAdapter, TypedSupabaseClient } from "./client/types";

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
