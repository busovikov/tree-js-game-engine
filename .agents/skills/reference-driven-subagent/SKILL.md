---
name: reference-driven-subagent
description: >-
  Executes a single task within the @haku reference-driven development cycle.
  Used by the orchestrator via Task tool handoff — not invoked directly by the
  user. Handles REFERENCE_ANALYSIS, MASTER_PLAN, GATE_CHECK, PLATFORM_SLICE,
  TARGET_BUILD, REWORK, ARCHITECTURE_REVIEW modes with Notion sync and
  commit-before-Review for code tasks.
---

# Reference-Driven Cycle — Subagent

**You are a subagent.** You receive a **Context Packet** from the orchestrator — not the parent chat history.

**Playbook:** [`docs/reference-driven-cycle.md`](../../../docs/reference-driven-cycle.md)  
**Orchestrator:** [`reference-driven-cycle`](../reference-driven-cycle/SKILL.md)  
**Single Notion task detail:** [`notion-execute-task`](../notion-execute-task/SKILL.md)  
**Platform slices:** [`incremental-implementation`](../incremental-implementation/SKILL.md)

---

## First message (mandatory)

```markdown
**Notion:** [NOTION_TASK_TITLE](NOTION_TASK_URL) · **Status:** In progress · **Mode:** <MODE>
```

If `NOTION_TASK_URL` missing → stop and return `RESULT: blocked`.

---

## Every pass checklist

### All modes

```
- [ ] notion-fetch NOTION_TASK_URL
- [ ] notion-update-page → Select: "In progress"
- [ ] notion-create-comment — "Started iteration <ITERATION>"
- [ ] Read only files listed in Context Packet
- [ ] Work per mode rules below
- [ ] notion-create-comment — **Review handoff** (mandatory — user reviews from this; see template below)
- [ ] notion-update-page → task **card content**: append/update "Last iteration" section with same summary
- [ ] notion-update-page → Select: "Review" (unless blocked mid-pass)
- [ ] Last message: **Notion:** … · **Status:** Review + structured return
```

### Code modes only (`PLATFORM_SLICE`, `TARGET_BUILD`, `REWORK`)

**Before Review — mandatory commit:**

```bash
pnpm test    # affected package(s)
pnpm build   # if types/exports changed
git add <scoped files only>
git commit -m "$(cat <<'EOF'
short description

Summary for changes.
EOF
)"
```

- `PLATFORM_SLICE` / platform `REWORK` → commit in **tree-js-projects** (`PLATFORM_BRANCH`)
- `TARGET_BUILD` / target `REWORK` → commit in **TARGET_PATH**

**Notion comment must include:** full **Review handoff** template (see below) — not just commit hash.

If commit or tests fail → stay **In progress**, comment reason, return `RESULT: blocked`.

**Do not** set **Done** — user approves on board.

### Review handoff (mandatory before Review)

Post `notion-create-comment` **and** update task card body with:

```markdown
**Iteration N — ready for review**

## What was done
- …

## Files changed
- …

## Tests run
```bash
…
```

## Commit
`<hash>` — message first line

## How to review
- …

## Editor screenshots (mandatory when UI/editor-visible)

If the change is demonstrable in editor/play mode, attach **2–4 PNG screenshots** to the Notion task before Review:

| When | Capture |
| ---- | ------- |
| Inspector / new component | Entity selected, new UI visible |
| Play mode | Simulation running (if applicable) |
| Saved scene | Optional — scene path or JSON proof |

**How to capture:** Playwright `page.screenshot()` in `.agents/tools/editor-playwright/tests/` or manual capture → attach via Notion comment (drag-drop) or `notion-create-attachment` when URL available.

Store copies in `.agents/tools/editor-playwright/review-artifacts/<TASK_ID>/` for git traceability; link paths in Notion comment.

```

---

## Mode: REFERENCE_ANALYSIS

**No code. No commit.**

1. Read reference repo (structure, scenes, scripts, assets, stack)
2. Write inventory: scenes, entities, mechanics, assets, engine stack used
3. **Interpretation Summary** — your understanding of the project
4. Compare to `@haku` (docs/architecture.md) — what exists / missing
5. **QUESTIONS_FOR_USER** — batches of ≤8:
   - essence, scope parity, mechanics, assets, ambiguities
6. Create epic stubs in Notion → **No Select** (optional if orchestrator prefers)
7. Save artifacts path in return: `REFERENCE_INVENTORY.md`, `REFERENCE_INTERPRETATION.md`

Return `RESULT: needs_clarification` until orchestrator confirms user answered.

---

## Mode: MASTER_PLAN

**No code. No commit.**

1. Use confirmed interpretation + user answers from Phase 0
2. Gap analysis table: reference system vs @haku
3. For physics, in-game UI, scripts, network — **alternatives A/B/C/D** + questions
4. Draft `MASTER_PLAN.md` with epics E01… and tasks Txx.y
5. **AD-xx** architectural decisions (draft)
6. Second question round: epic order, first milestone
7. **Create Notion tasks with full specs** — follow `@notion-create-task` / `docs/notion-create-task.md` **for every task**:

**Per task (mandatory — never empty card only):**

```text
Step A — Spec in 📎 Docs:
  notion-duplicate-page → page_id: "39a1402af56080349186fce071ae7c72"
  wait → notion-fetch new URL
  notion-update-page → fill ALL Feature Task Template sections (Objective … Out of Scope)
  Name: "<Txx.y title> — Spec"

Step B — Task card on Iterative board:
  notion-create-pages
    parent: { data_source_id: "86f1402a-f560-826a-8ea0-07594e7d6759" }
    template_id: "7291402a-f560-82f8-bb89-81649141037a"
    properties: {
      Name: "<Txx.y — title>",
      Type, Epic,
      "📎 Docs": "[\"<spec page URL>\"]"
      # no Select → No Select
    }
```

**Card body:** replace placeholder `# To Do / - [ ] ...` with short summary + link to spec (or leave minimal — **spec is in 📎 Docs**).

**Quality gate:** every task has 📎 Docs relation + filled spec; AC lists git `docs/` updates; **Testing + Validation sections** explicit; Out of Scope explicit.

**Notion ↔ git sync:** update local `docs/reference-cycle/` and Notion spec in the same pass — see `docs/reference-cycle/NOTION_SYNC.md`.

Return `QUESTIONS_FOR_USER` for unconfirmed AD-xx.

---

## Mode: GATE_CHECK

**No code. No commit.**

1. List **concrete editor actions** needed for the task
2. For each: exists / partial / missing in @haku/editor
3. If missing → minimal PLATFORM_SLICE scope (schema→editor)
4. Decision: `BUILD_NOW` | `PLATFORM_FIRST`
5. If PLATFORM_FIRST → create platform task(s) in Notion **No Select** + parent comment

Return structured gate report in summary.

---

## Mode: PLATFORM_SLICE

**Code in monorepo only.**

1. Bottom-up slice: schema → core → serializer → engine → editor
2. `commitSceneEdit` for editor mutations
3. Reuse ui-kit.md components
4. Tests for affected packages
5. **Commit before Review**
6. Manual note: `pnpm --filter @haku/editor-app dev` if UI changed

If new dependency discovered → Notion task **No Select** + `DISCOVERED_TASKS`.

---

## Mode: TARGET_BUILD

**Code in target project only — no `packages/*` edits.**

1. Read `docs/reference-cycle/AGENT_EDITOR_WORKFLOW.md` — **use Playwright** to drive the editor (AD-08)
2. Bootstrap `.agents/tools/editor-playwright/` in monorepo if missing (scoped commit on platform branch OK)
3. `pnpm --filter @haku/editor-app dev` (or Playwright fixture starts it)
4. Open target project via Playwright `openTargetProject()` (AD-09 — not Demo Scene)
5. Build content via editor automation (import assets, place entities, colliders, save scenes)
6. Play mode verification in **target project** vs acceptance criteria (keyboard smoke via Playwright when applicable)
7. **Commit in TARGET_PATH** before Review

**Playwright is agent workflow tooling — not a platform deliverable.** Do not create Notion tasks for Playwright harness work.

If blocker → stop, return `BLOCKERS`, create Notion task No Select — do not hack platform in target `main.ts`. Fallback to direct scene JSON only with documented reason.

---

## Mode: REWORK

Same rules as PLATFORM_SLICE or TARGET_BUILD depending on task Epic.

- Read user feedback from orchestrator Context Packet
- `ITERATION` incremented
- Minimal fix scope — **only current task AC**
- If feedback matches another task on the board (MASTER_PLAN / 📎 Docs): **do not implement**; `notion-create-comment` with link to that task («will be done in Txx.x»)
- **Commit before Review**

---

## Mode: ARCHITECTURE_REVIEW

**No production code. No commit.**

Triggered after 3× Review→To do on same task.

1. Read last 3 iteration comments + commits on blocked task
2. Read relevant docs/architecture.md, edge-cases.md
3. Why previous approaches failed
4. 2–4 alternatives with trade-offs
5. **AD-ESCALATION-xx** recommendation
6. Create/update Notion Docs spec (📎 Docs relation)
7. **QUESTIONS_FOR_USER** — specific, with A/B/C/D options

Return `RESULT: needs_clarification`.

---

## Discovered tasks

When work reveals new tasks:

```text
notion-create-pages → No Select (omit Select property)
notion-create-comment on parent — **Discovered:** [name](url) — reason
```

Include URLs in `DISCOVERED_TASKS` return field.

---

## Structured return (last message)

```markdown
**Notion:** [title](URL) · **Status:** Review

## Handoff
MODE: <mode>
RESULT: success | blocked | needs_clarification
SUMMARY: <2–5 sentences>
COMMIT_HASH: `<hash>` | none
FILES_CHANGED: `path/a`, …
TESTS: <commands> — pass | fail
DISCOVERED_TASKS: <urls> | none
BLOCKERS: <text> | none
QUESTIONS_FOR_USER:
- …
```

---

## Notion MCP quick ref

| Tool | Use |
| ---- | --- |
| `notion-fetch` | `id`: task URL |
| `notion-update-page` | `properties: { "Select": "In progress" \| "Review" }` |
| `notion-create-comment` | iteration / discovered / escalation |
| `notion-create-pages` | new tasks, No Select |

Board: https://app.notion.com/p/39a1402af56080458673d2afa6c1cdc5  
Data source: `86f1402a-f560-826a-8ea0-07594e7d6759`

---

## Do not

- Load whole repo or reference repo into context
- Paste orchestrator chat history
- Set Notion **Done**
- Review without commit (code modes)
- Edit monorepo during TARGET_BUILD
- Invent `@haku/*` APIs — check docs/links.md
- Skip failure-path handling (docs/edge-cases.md)
