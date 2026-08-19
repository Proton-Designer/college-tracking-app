# Team Roster & Protocol

## The team (claude-peers MCP — persistent Sonnet Claude Code sessions)

| Role | Peer ID | Owns |
|---|---|---|
| **Lead** (me, Opus) | — | architecture, decisions, review, red-teaming, integration, QA gate |
| **ATLAS** — Engineer A | `mapw9to2` (ttys031) | backend, data model, domain engine, edge functions, integrations, test infra |
| **NOVA** — Engineer B | `a9bsul1i` (ttys035) | design system, web app, mobile app, UI/UX, motion, a11y |

Message them with `mcp__claude-peers__send_message`. They reply into my session automatically.

> **Note:** two Task subagents also named `atlas`/`nova` were spawned during Phase 0 for the
> initial data-model and design research. They were retired after delivering. All ongoing work runs
> through the **peers** above. Do not confuse the two.

## Anti-deadlock protocol (the reason the team can't die)
1. Every engineer reports to the Lead on: finish, block, or major decision.
2. **No engineer ever waits silently on another engineer.** All cross-engineer dependencies route
   through the Lead. If waiting, message the Lead and pick up other work.
3. Any engineer silent >25 min must send a progress ping.
4. The Lead runs a background heartbeat watchdog (`sleep 1500`) that wakes the session even if
   every agent is quiet. Re-arm it each time it fires.
5. Nobody asks the user anything. The user is asleep. Decide, implement, flag the decision.

## Shutdown sequence (only when the whole build is done and verified)
1. Stop the heartbeat watchdog loop.
2. Tell both peers to stand down.
3. Kill the `caffeinate -i` background process (ID recorded in the session) so the laptop can sleep.

## FINAL ownership split (revised again mid-L5)
- **NOVA (`a9bsul1i`)** — owns **all UI, both platforms**. Web and mobile.
- **ATLAS (`mapw9to2`)** — **backend only**: schema, packages/api, packages/core, edge functions,
  integrations, test infra.

**Why this replaced the earlier port-based split:** the earlier plan had Atlas porting Nova's web
patterns to mobile. In practice the backend kept surfacing real gaps (four DayView additions, five
reads, edge functions) and Atlas was pulled back every time — correctly, since the backend needed
him. Mobile stalled at auth while web reached Courses and Calendar. Having the person who *designed*
a screen also port it eliminates divergence risk instead of managing it, and is faster than someone
relearning the reasoning behind every decision.

Trade-off accepted: Nova is the UI bottleneck. Mitigated by Atlas having a deep backend queue
(edge functions, L6-L10) so neither engineer idles.

---

## Superseded: port-based split (used during L3/L4)
- **NOVA (`a9bsul1i`)** — owns **web** and **sets every screen's pattern**. Design authority.
- **ATLAS (`mapw9to2`)** — ports Nova's established pattern to **mobile**. Follows, does not redesign.
- Exception to routing-through-the-lead: Atlas may ask Nova directly about *design intent*,
  because pattern fidelity is the entire point of the split. Anything else still routes via Lead.
- If Atlas thinks a web pattern is wrong, he reports it to the Lead — he never "improves" it
  unilaterally on mobile. **Divergence is the failure mode this split exists to prevent.**

> Near-miss worth remembering: both engineers were assigned mobile L3 within minutes of each other
> (crossed messages) and Nova was seconds from duplicating Atlas's work. When switching an
> engineer's lane, immediately tell the *other* engineer too.
