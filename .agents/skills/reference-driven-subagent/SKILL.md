---
name: reference-driven-subagent
description: >-
  Executes a single task within the @haku reference-driven development cycle.
  Used by the orchestrator via Task tool handoff — not invoked directly by the
  user. Handles REFERENCE_ANALYSIS, MASTER_PLAN, GATE_CHECK, PLATFORM_SLICE,
  TARGET_BUILD, REWORK, ARCHITECTURE_REVIEW modes with commit-before-handoff
  for code tasks.
---

# Reference-Driven Cycle — Subagent

**You are a subagent.** You receive a **Context Packet** from the orchestrator — not the parent chat history.

**Playbook:** [`docs/reference-driven-cycle.md`](../../../docs/reference-driven-cycle.md)  
**Orchestrator:** [`reference-driven-cycle`](../reference-driven-cycle/SKILL.md)

---

## First message (mandatory)

```markdown
**Task:** <TASK_ID> — <TASK_TITLE> · **Mode:** <MODE>
```

If `TASK_ID` missing → stop and return `RESULT: blocked`.

---

## Every pass checklist

### All modes

```
- [ ] Read only files listed in Context Packet
- [ ] Work per mode rules below
- [ ] Return structured handoff (see template below)
```

### Code modes only (`PLATFORM_SLICE`, `TARGET_BUILD`, `REWORK`)

**Before handoff — mandatory commit:**

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

If commit or tests fail → return `RESULT: blocked` with reason.

**M1 / vehicle / play-mode tasks — before handoff:**

```
- [ ] Manual play-mode verification in target project — pass
- [ ] If fail → rework, do NOT hand off
```

---

## Mode: REFERENCE_ANALYSIS

**No code. No commit.**

1. Read reference repo (structure, scenes, scripts, assets, stack)
2. Write inventory: scenes, entities, mechanics, assets, engine stack used
3. **Interpretation Summary** — your understanding of the project
4. Compare to `@haku` (docs/architecture.md) — what exists / missing
5. **QUESTIONS_FOR_USER** — batches of ≤8
6. Save artifacts: `REFERENCE_INVENTORY.md`, `REFERENCE_INTERPRETATION.md`

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

Return `QUESTIONS_FOR_USER` for unconfirmed AD-xx.

---

## Mode: GATE_CHECK

**No code. No commit.**

1. List **concrete editor actions** needed for the task
2. For each: exists / partial / missing in @haku/editor
3. If missing → minimal PLATFORM_SLICE scope (schema→editor)
4. Decision: `BUILD_NOW` | `PLATFORM_FIRST`

Return structured gate report in summary.

---

## Mode: PLATFORM_SLICE

**Code in monorepo only.**

1. Bottom-up slice: schema → core → serializer → engine → editor
2. `commitSceneEdit` for editor mutations
3. Reuse ui-kit.md components
4. Tests for affected packages
5. **Commit before handoff**
6. Manual note: `pnpm --filter @haku/editor-app dev` if UI changed

If new dependency discovered → add to `DISCOVERED_TASKS`.

---

## Mode: TARGET_BUILD

**Code in target project only — no `packages/*` edits.**

1. `pnpm --filter @haku/editor-app dev`
2. Open target project via `?hakuOpenTarget=1` or File → Open Project
3. Build content via editor (import assets, place entities, colliders, save scenes)
4. Play mode verification in **target project** vs acceptance criteria
5. **Commit in TARGET_PATH** before handoff

If blocker → stop, return `BLOCKERS`. Fallback to direct scene JSON only with documented reason.

---

## Mode: REWORK

Same rules as PLATFORM_SLICE or TARGET_BUILD depending on task Epic.

- Read user feedback from orchestrator Context Packet
- `ITERATION` incremented
- Minimal fix scope — **only current task AC**
- **Commit before handoff**

---

## Mode: ARCHITECTURE_REVIEW

**No production code. No commit.**

Triggered after 3× rework on same task.

1. Read last 3 iteration feedback + commits on blocked task
2. Read relevant docs/architecture.md, edge-cases.md
3. Why previous approaches failed
4. 2–4 alternatives with trade-offs
5. **AD-ESCALATION-xx** recommendation
6. **QUESTIONS_FOR_USER** — specific, with A/B/C/D options

Return `RESULT: needs_clarification`.

---

## Discovered tasks

When work reveals new tasks, add to `MASTER_PLAN.md` and include ids in `DISCOVERED_TASKS` return field.

---

## Structured return (last message)

```markdown
## Handoff
MODE: <mode>
RESULT: success | blocked | needs_clarification
SUMMARY: <2–5 sentences>
COMMIT_HASH: `<hash>` | none
FILES_CHANGED: `path/a`, …
TESTS: <commands> — pass | fail
DISCOVERED_TASKS: <ids> | none
BLOCKERS: <text> | none
QUESTIONS_FOR_USER:
- …
```

---

## Do not

- Load whole repo or reference repo into context
- Paste orchestrator chat history
- Hand off without commit (code modes)
- Edit monorepo during TARGET_BUILD
- Invent `@haku/*` APIs — check docs/links.md
- Skip failure-path handling (docs/edge-cases.md)
