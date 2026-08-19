import "server-only";
import { createServerSupabaseClient } from "@collegeos/api/web";
import type { TypedSupabaseClient } from "@collegeos/api";
import { cookies } from "next/headers";
import { getWebAppEnvironment } from "./env";

/** A fresh client per request/Server Component render — never reuse across requests. */
export async function getServerSupabaseClient(): Promise<TypedSupabaseClient> {
  const cookieStore = await cookies();

  return createServerSupabaseClient(getWebAppEnvironment(), {
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      for (const { name, value, options } of cookiesToSet) {
        if (options) {
          cookieStore.set(name, value, options);
        } else {
          cookieStore.set(name, value);
        }
      }
    },
  });
}
