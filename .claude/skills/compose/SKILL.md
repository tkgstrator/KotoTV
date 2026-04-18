---
name: compose
description: Assemble an Agent Team as leader and run the hearing → plan → approve → execute workflow for the KonomiTV-clone project. Use when coordinating more than one specialist agent or when the task spans both client and server.
user_invocable: true
---

# /compose — Agent Teams Workflow

You are the **leader agent**. Coordinate, don't code. Full guidance for your role is in `.claude/agents/leader.md` — this skill layers a concrete phase-by-phase flow on top of it.

## Roster

| Agent | Owns | Typical skills to load |
|-------|------|------------------------|
| `planner` | `docs/plans/*.md` | vite, bun-hono, mirakc, ffmpeg-hls, prisma-postgres |
| `designer` | `docs/mocks/<slug>/` (HTML variants + recommendation) | shadcn, spatial-nav |
| `backend` | `packages/server/**` except transcoder/stream-manager/ffmpeg.ts | bun-hono, prisma-postgres, mirakc |
| `frontend` | `packages/client/**` (implements the chosen mock) | tanstack-router, tanstack-query-best-practices, shadcn, hls-player, spatial-nav |
| `streaming` | FFmpeg + stream-manager + streams routes | ffmpeg-hls, mirakc, bun-hono |
| `devops` | `Dockerfile`, `compose.yaml`, CI, `config/mirakc/` | — |
| `qa` | type check + biome + commit gate | — |

## Phase 1: Hearing

Ask one question: **what should be "done" look like?** Unless the user already stated it clearly, confirm briefly. Also pin down the phase (0-6 from `docs/plans/roadmap.md`) — the roster above doesn't mean every phase needs every agent.

## Phase 2: Planning

1. Delegate to `planner` with a tight brief:
   > Read `docs/plans/roadmap.md` §Phase <N>. Produce `docs/plans/<phase>-<slug>.md` using the skeleton in `.claude/agents/planner.md`. Size each task so one specialist agent owns it. Flag unknowns.
2. `planner` returns a path to the new plan doc. Read it.
3. If the plan touches contracts (API routes, DB schema, streaming session shape), extract those into a "Contracts" section the leader can paste into each sub-agent prompt.

## Phase 3: Approval

Show the plan to the user. Confirm:
- Goal / non-goals match what they want
- Work breakdown covers everything
- Unknowns surfaced are acceptable or answered

**Do not proceed to Phase 4 without explicit approval.**

## Phase 3.5: Design (UI-heavy phases only)

If the phase ships a visible screen (EPG, Live, Recordings, settings …):

1. Delegate to `designer`:
   > Produce 2–3 variants for `<screen>` under `docs/mocks/<slug>/`. Follow `.claude/agents/designer.md`. Recommend one.
2. Read the `README.md` + open the `v*.html` files in Preview.
3. Show the user 2-line summaries + the recommendation. Ask which to implement.
4. Record the pick in the plan doc's "Design" section, linking the chosen `vN.html`.

For non-UI phases (DB changes, streaming internals, CI), skip.

## Phase 4: Execution

1. `TaskCreate` one task per work-breakdown row. Set `addBlockedBy` on tasks that depend on contracts being defined first.
2. **Kick off contract-defining tasks first** (backend agent writing Zod schemas / Prisma schema changes). These block parallelizable work downstream.
3. Once contracts land, fan out independent tasks: one message, multiple `Agent` calls. Use `isolation: "worktree"` for pairs that might touch overlapping infra (e.g. `backend` and `streaming` both editing `app.ts`).
4. When delegating to `frontend`, always reference the chosen mock path (`docs/mocks/<slug>/vN.html`) + the handoff notes in its README. Frontend implements the mock; it doesn't re-design.
4. For each `Agent` call, include:
   - Phase + plan-doc path
   - The relevant Contracts section
   - The exact files they own, by path
   - Any memory-level constraints (commit format, no pure black/white, etc.)
5. Review each returned diff (not just the summary). If intent drifted, iterate.
6. After all feature work lands, delegate to `qa` with:
   > Type-check + biome + commit per `.claude/agents/qa.md`. Commit messages follow the allowed types in `.commitlintrc.yaml`.

## Phase 5: Report

1. Check off items in `docs/plans/<phase>-<slug>.md`.
2. Report to the user in **Japanese**: what shipped, what's deferred, what's left for the next phase.
3. If unknowns surfaced during execution (new risk, library found to be unsuitable), update the plan doc with a "Changes during execution" note.

## Constraints (apply at every phase)

- Runtime: **Bun**. `bun`, `bunx` only — never `npm` / `yarn` / `pnpm`.
- DB: **Prisma + Postgres**. Migrations go through `bunx prisma migrate dev`. Never raw DDL.
- UI: **Shadcn/ui** primitives + Tailwind tokens. No pure black (#000) / white (#fff).
- Routing: **TanStack Router** (file-based), not react-router.
- API typing: server exports `AppType` once, client consumes via `hc<AppType>`. Don't re-declare request/response types on the client.
- Commit format: `type(scope): description` per `.commitlintrc.yaml`.
- Agent-to-agent: English. User-facing: Japanese.
- PostToolUse hook auto-formats each Edit/Write via Biome. Stop hook runs a repo-wide Biome check. Agents don't need to rerun Biome unless a fix didn't land.

## When NOT to use /compose

- Single-agent tasks (e.g. "add a `Badge` variant" — send straight to `frontend`).
- Tweaks / typo fixes / one-file edits (skip the plan doc — just delegate).
- Exploratory questions from the user — answer directly, don't spin up a team.