// Native-only entry point (import from '@collegeos/api/native'). Pulls in
// react-native and @react-native-async-storage/async-storage, whose Flow syntax breaks
// Turbopack/webpack if it ever reaches a web bundle -- see package.json's `exports` map.
// The main '@collegeos/api' barrel deliberately does NOT re-export this. This is exactly
// what broke `apps/web`'s build (see the L3 report): the main barrel used to re-export
// createNativeSupabaseClient unconditionally.
export { createNativeSupabaseClient } from "../client/nativeClient";
