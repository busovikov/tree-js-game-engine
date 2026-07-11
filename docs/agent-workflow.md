# Agent Workflow Rules

> How AI agents must work in the @haku monorepo.  
> **Read this at the start of every new task.**

---

## Core principles

| Rule | Meaning |
| ---- | ------- |
| **One task = one context** | Each new user task starts in a **new chat / new agent session**. Do not continue unrelated work in an old long dialogue. |
| **No whole-project load** | Never read the entire repo into context. **Search and read only what the task needs.** |
| **Minimal context** | Load only: task-relevant docs + source files + explicit **done criteria**. |
| **Docs before code** | Route through `docs/` and `links.md` first — then open source files. |
| **Verify before done** | Run only the checks required by the task (tests, build, manual step). |

---

## Starting a new task (checklist)

Copy this into the task prompt or follow as agent:

```
1. [ ] New session — not a continuation of an unrelated old task
2. [ ] Task scope stated in 1–2 sentences
3. [ ] Pick doc route from table below (1–3 docs max first)
4. [ ] Identify packages touched (schema / core / engine / editor / app)
5. [ ] Grep or glob for entry files — do NOT read whole packages
6. [ ] List acceptance criteria (see templates below)
7. [ ] Implement minimal diff
8. [ ] Run targeted verification
9. [ ] Report: what changed, what was tested, known gaps
```

---

## Context budget

### Always load (small)

| File | Why |
| ---- | --- |
| [`docs/agent-workflow.md`](./agent-workflow.md) | This file |
| [`AGENTS.md`](../AGENTS.md) | Package map + hard rules |
| **One** task-specific doc from table below | Architecture / UI / edge cases |

### Load on demand (targeted)

| Need | Action |
| ---- | ------ |
| API signature | [`docs/links.md`](./links.md) § Internal API → open **one** `index.ts` |
| UI component | [`docs/ui-kit.md`](./ui-kit.md) → open **one** component file |
| Failure behavior | [`docs/edge-cases.md`](./edge-cases.md) § relevant section |
| Render feature | `RENDER_PLAN.md` § relevant phase only |
| Locked decision | `IMPLEMENTATION_PLAN.md` §2 — only if task touches architecture |

### Do NOT load into context

| Avoid | Why |
| ----- | --- |
| Entire `packages/engine/src/` | Use grep + 3–8 files max |
| All of `IMPLEMENTATION_PLAN.md` / `RENDER_PLAN.md` | Section only |
| `apps/playground/public/assets/**` | Binary/assets — irrelevant unless asset task |
| `node_modules/`, `dist/` | Build output |
| Unrelated packages | e.g. editor files for engine-only task |
| Full git history / all PRs | Unless explicitly asked |
| Invented API docs | Use `links.md` + source |

**Target:** typical task = **3–10 source files** + **2–4 doc sections**, not hundreds of files.

---

## Doc routing by task type

| Task type | Read first | Then open (examples) |
| --------- | ---------- | --------------------- |
| New component (schema) | `architecture.md`, `links.md` | `packages/schema/src/index.ts`, `packages/core/src/components.ts` |
| Serializer / scene I/O | `links.md` § Read/Write | `packages/serializer/src/index.ts`, `examples/minimal.scene.json` |
| Engine / render | `architecture.md`, `edge-cases.md`, `RENDER_PLAN.md` § | `engine.ts`, `render-sync-system.ts`, relevant `render/` file |
| Editor inspector field | `ui-kit.md`, `edge-cases.md` | `InspectorPanel.tsx`, matching `*Fields.tsx` |
| Editor panel / dialog | `ui-kit.md` | `EditorLayout.tsx`, similar existing panel |
| Viewport / gizmo | `ui-kit.md`, `architecture.md` | `ViewportPanel.tsx`, one `viewport/*.ts` |
| Undo / commands | `ui-kit.md`, `edge-cases.md` | `scene-history.ts`, `world-commands.ts` |
| Project I/O | `edge-cases.md`, `links.md` | `project-service.ts` |
| Bug fix | `edge-cases.md` + failing test file | Minimal repro path from grep |
| **Notion TODO task** | `notion.md`, `agent-workflow.md` | MCP `notion-fetch` → subagent with task spec |
| **Create Notion ticket** | `notion-create-task.md` | `@notion-create-task` — duplicate template → To do |
| Dependency / version | `techstack.md` | Relevant `package.json` only |
| External game / create | `architecture.md`, `links.md` | `packages/create/templates/` |

---

## Search strategy (instead of full scan)

```
1. Grep symbol / error string / component name
2. Glob narrow path (e.g. packages/editor/src/components/*.tsx)
3. Read 1 entry file (index.ts or orchestrator panel)
4. Read 2–5 direct dependencies (imports only)
5. Stop when you can implement — do not “explore for curiosity”
```

**Prefer:** `Grep`, `Glob`, `Read` with limit — **avoid:** loading directory trees “just in case”.

---

## Acceptance criteria templates

Define **done** before coding. Pick one template and fill in blanks.

### Feature

```
- [ ] Scope: <package/module only>
- [ ] Schema/API updated if data shape changed
- [ ] Editor uses commitSceneEdit (if editor mutation)
- [ ] Edge case: empty state OR validation failure handled
- [ ] Unit test added OR existing test updated (if logic)
- [ ] pnpm test (filtered package) passes
- [ ] pnpm build passes (if types/export changed)
- [ ] Manual: <one viewport/inspector step> — only if user-visible
```

### Bug fix

```
- [ ] Repro described in one sentence
- [ ] Root cause file(s) identified (not whole package)
- [ ] Fix is minimal diff — no drive-by refactor
- [ ] Regression test OR edge-case note in edge-cases.md
- [ ] pnpm test passes for affected package
```

### Editor UI only

```
- [ ] Reused existing component from ui-kit.md catalog
- [ ] No MUI/Tailwind/new design system
- [ ] Empty state copy defined
- [ ] memo + narrow Zustand selectors
- [ ] pnpm --filter @haku/editor-app dev — visual check
```

### Engine / render only

```
- [ ] No React/editor imports
- [ ] Feature flag respected (if render capability)
- [ ] Feature off path tested (not only on)
- [ ] Playground still runs: pnpm --filter @haku/playground dev
```

---

## Package boundary guard

Before finishing, confirm task did not violate:

| Check | Command / doc |
| ----- | --------------- |
| Engine has no React | `eslint.config.js`, `docs/edge-cases.md` |
| Core has no Three.js | same |
| Editor mutations use undo path | `commitSceneEdit` |
| No invented APIs | `docs/links.md` |

---

## Session handoff (when context is full)

If the task is large, **split into sub-tasks** — each sub-task = **new session** with:

```markdown
## Sub-task N: <title>

### Context from previous session
- Done: ...
- Files touched: ...
- Blockers: ...

### Scope (this session only)
...

### Files to read
- path/a.ts
- path/b.tsx

### Done criteria
- [ ] ...
```

Do **not** paste entire previous chat — only facts and file paths.

---

## What the user should put in a task prompt

Ideal task message for a **new session**:

```markdown
**Task:** Add castShadow toggle to Light inspector

**Package:** @haku/editor (+ schema if field missing)

**Read:**
- docs/ui-kit.md
- docs/edge-cases.md
- packages/editor/src/components/LightFields.tsx

**Done when:**
- [ ] Toggle in inspector, persists save/load
- [ ] commitSceneEdit used
- [ ] Legacy scenes load without error
- [ ] pnpm test + build pass
```

---

## Anti-patterns

| ❌ Don't | ✅ Do |
| -------- | ----- |
| Continue 5 unrelated tasks in one chat | New chat per task |
| Read all packages “to understand project” | Doc route + grep |
| Load IMPLEMENTATION_PLAN end-to-end | §2 locked decisions only if needed |
| Implement before done criteria | Criteria first |
| Add MUI/Tailwind/new NumberInput | `ui-kit.md` catalog |
| Skip failure-path tests | `edge-cases.md` mandate |
| Commit without user ask | User rule: commit only when requested |

---

## Notion TODO tasks

When the user asks to **execute / build a task from todo** (Notion):

1. Read **`docs/notion.md`** — fixed Project and Docs URLs (no workspace search).
2. Fetch task via MCP `notion-fetch` (server: `plugin-notion-workspace-notion`).
3. **Launch a separate subagent** — one Notion task = one agent context.
4. Subagent: implement → test → update `docs/` if needed → Notion comment + status + artifacts in Docs board.

Full workflow: [`notion.md`](./notion.md) · Rule: `.cursor/rules/haku-notion.mdc`

---

## Agent skills

Project skills in `.agents/skills/` — each references `docs/`:

- `context-engineering` — context budget, doc map
- `incremental-implementation` — slice order schema→engine→editor
- `source-driven-development` — `links.md` + official docs
- `test-driven-development` — `edge-cases.md`, vitest commands
- `ci-cd-and-automation` — `./scripts/check.sh`
- `git-workflow-and-versioning` — commit format
- `three-best-practices`, `threejs-*` — engine paths + `RENDER_PLAN.md`

## Quick links

| Doc | Path |
| --- | ---- |
| Workflow (this file) | `docs/agent-workflow.md` |
| Notion TODO | `docs/notion.md` |
| Tech stack | `docs/techstack.md` |
| Architecture | `docs/architecture.md` |
| Edge cases | `docs/edge-cases.md` |
| UI kit | `docs/ui-kit.md` |
| Links / API | `docs/links.md` |
