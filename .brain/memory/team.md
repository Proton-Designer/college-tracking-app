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
