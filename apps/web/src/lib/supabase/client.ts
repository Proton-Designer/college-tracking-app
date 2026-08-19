"use client";

import { createBrowserSupabaseClient } from "@collegeos/api/web";
import type { TypedSupabaseClient } from "@collegeos/api";
import { getWebAppEnvironment } from "./env";

let browserClient: TypedSupabaseClient | undefined;

/** One client per tab — created lazily on first use, reused after that. */
export function getBrowserSupabaseClient(): TypedSupabaseClient {
  browserClient ??= createBrowserSupabaseClient(getWebAppEnvironment());
  return browserClient;
}
