import { createNativeSupabaseClient } from "@collegeos/api/native";
import type { TypedSupabaseClient } from "@collegeos/api";
import { getMobileAppEnvironment } from "./env";

let client: TypedSupabaseClient | undefined;

/** One client for the app's lifetime — created lazily, AsyncStorage-persisted, AppState-driven refresh. */
export function getMobileSupabaseClient(): TypedSupabaseClient {
  client ??= createNativeSupabaseClient(getMobileAppEnvironment());
  return client;
}
