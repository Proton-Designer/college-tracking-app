import { createClient } from "@supabase/supabase-js";

const client = createClient(
  "http://127.0.0.1:54321",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const email = "mobshot2@collegeos.test";
const password = "Throwaway1234!";

const { data, error } = await client.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (error || !data.user) {
  console.error("FAILED", error?.message);
  process.exit(1);
}

console.log(JSON.stringify({ id: data.user.id, email, password }));
