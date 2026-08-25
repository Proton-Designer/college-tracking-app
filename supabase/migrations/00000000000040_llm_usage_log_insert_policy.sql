-- Fix for the first-ever user-JWT gateway call, 2026-08-25: llm_usage_log had only a
-- SELECT policy, so the user-scoped client every verify_jwt=true function runs could not
-- insert its own usage row. logUsage throws on insert error (deliberately -- see the
-- gateway hardening commit), so the throw escaped callLlm and both syllabus-extract and
-- parse-announcement returned 500 AFTER the provider call had already succeeded and been
-- billed. The nightly never hit this because cron runs the service-role client, the live
-- smoke called the provider directly, and the offline tests fake logUsage -- three ways
-- the gap stayed invisible until a real user JWT reached the gateway.
--
-- Reproduced before fixing: as role authenticated with a real sub claim, the insert
-- fails with "new row violates row-level security policy".
--
-- Insert-own only. No UPDATE or DELETE policy, on purpose: this table is the budget
-- LEDGER -- getMonthlySpendUsd sums it to enforce the monthly ceiling -- and a user who
-- could edit or delete rows could reset their own spend. Append-only for users, readable
-- own-rows only, exactly like semester_lessons' append-only design.

create policy llm_usage_log_insert_own on public.llm_usage_log
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
