---
name: reference-driven-cycle
description: >-
  Orchestrates reference-driven development for @haku: analyze a reference repo,
  ask clarifying questions, plan in Notion, delegate subagents to build a target
  project via the editor while iteratively extending engine/editor. Use when the user
  asks to build/create a project from a reference, replicate a reference game,
  reference-driven cycle, по референсу, возьми референс, or iterative engine+editor
  improvement toward a target game.
---

# Reference-Driven Cycle — Orchestrator

**You are the ORCHESTRATOR.** You manage the full cycle. **You do not write production code.**

**Full playbook:** [`docs/reference-driven-cycle.md`](../../../docs/reference-driven-cycle.md)  
**Subagent handoff:** [`reference-driven-subagent`](../reference-driven-subagent/SKILL.md)  
**MCP:** `plugin-notion-workspace-notion`

---

## On invoke — immediate actions

```
Progress:
- [ ] 1. Read docs/reference-driven-cycle.md (this skill is not enough alone)
- [ ] 2. Parse user message: REFERENCE_PATH, TARGET_PATH, PLATFORM_BRANCH
- [ ] 3. If reference missing → ask user (URL or local path)
- [ ] 4. If target missing → propose ~/work/<name> + @haku/create command
- [ ] 5. If platform branch missing → propose feat/reference-<short-name>
- [ ] 6. Set cycle phase → start PHASE_0 (unless user said CONTINUE)
- [ ] 7. Launch subagent REFERENCE_ANALYSIS with Context Packet
```

**Every reply starts with:**

```markdown
**Cycle:** <phase> · **Active:** <task or —> · **Board:** [Iterative dev](https://app.notion.com/p/39a1402af56080458673d2afa6c1cdc5)
```

---

## Fixed Notion IDs (iterative board)

| Resource | ID / URL |
| -------- | -------- |
| Board | https://app.notion.com/p/39a1402af56080458673d2afa6c1cdc5 |
| Data source | `86f1402a-f560-826a-8ea0-07594e7d6759` |
| New Task template | `7291402a-f560-82f8-bb89-81649141037a` |
| Docs data source | `73ffe0c3-80da-4bc2-939e-a92e4fb08cb4` |

---

## Session state (orchestrator keeps in chat)

```text
REFERENCE_PATH:     <url or ~/work/reference-game>
TARGET_PATH:        <~/work/my-game-target>
PLATFORM_REPO:      <tree-js-projects path>
PLATFORM_BRANCH:    feat/reference-<name>
PHASE:              PHASE_0 | PHASE_1 | EXECUTE | WAIT | ESCALATION | GROOM
TASK_STREAK:        { "T02.3": 0, ... }
BLOCKED_BY:         { "T02.3": null | "ESCALATION-url" }
MASTER_PLAN:        path to docs/reference-cycle/MASTER_PLAN.md
```

---

## Phase machine

### PHASE_0 — Reference analysis

1. Launch **Task** subagent, `Mode: REFERENCE_ANALYSIS`
2. Subagent returns `QUESTIONS_FOR_USER` → **present questions to user**
3. **Stop** until user answers blocking questions
4. Update `REFERENCE_INTERPRETATION.md` / Notion epics (No Select)
5. When interpretation confirmed → **PHASE_1**

### PHASE_1 — Master plan

1. Launch subagent `Mode: MASTER_PLAN` (include Phase 0 answers in Context Packet)
2. Subagent returns architectural questions (physics, UI, scripts, …)
3. **Stop** until user confirms **AD-xx** decisions
4. Subagent/orchestrator creates tasks in Notion → **No Select**
5. **GROOM:** move first epic tasks → **To do**
6. → **EXECUTE**

### EXECUTE — Main loop

```text
1. notion-query-data-sources: Select = 'To do'
2. If empty → GROOM from No Select (MASTER_PLAN order)
3. Pick one task T
4. Decide subagent mode:
   - Planning/analysis task → direct mode from task spec
   - Content task → GATE_CHECK first
   - GATE=PLATFORM_FIRST → PLATFORM_SLICE, then re-GATE
   - GATE=BUILD_NOW → TARGET_BUILD
   - Platform task in To do → PLATFORM_SLICE
5. Build Context Packet → launch Task subagent
6. → WAIT
```

### WAIT — After subagent Review

Tell user:

```markdown
**<TASK>** в Review. Проверьте результат (commit в комментарии).
На доске: **Done** если OK, **To do** с комментарием если доработка.
Напишите: `CONTINUE` или `REWORK <id> — <причина>`.
```

Do **not** launch next task until user acts on board (or sends CONTINUE/REWORK).

### User: REWORK

```text
streak[T] += 1
if streak[T] >= 3 → ESCALATION (below)
else → launch REWORK subagent, ITERATION+1
```

### ESCALATION (streak >= 3)

```text
1. Create Notion task: Name "[ESCALATION] <T> — architecture review"
   → No Select → move to To do
2. BLOCKED_BY[T] = escalation URL
3. Launch ARCHITECTURE_REVIEW subagent
4. Present questions to user → AD-ESCALATION-xx
5. Escalation → Done; original T → To do; streak[T] = 0
6. Resume EXECUTE with updated Context Packet (include AD-ESCALATION)
```

### GROOM

```text
Query No Select (Select IS NULL or empty)
Order by MASTER_PLAN dependencies
Move ready tasks → To do (not all at once — keep WIP small)
```

---

## Launching subagents (Task tool)

**Mandatory prompt structure:**

```markdown
## ORCHESTRATOR HANDOFF

You are a reference-driven **subagent**. Read:
- .agents/skills/reference-driven-subagent/SKILL.md
- docs/reference-driven-cycle.md (mode section only)

<full Context Packet from playbook>

## Return format (last message)
MODE: …
RESULT: success | blocked | needs_clarification
SUMMARY: …
COMMIT_HASH: <hash> | none
FILES_CHANGED: …
TESTS: …
DISCOVERED_TASKS: [notion urls] | none
BLOCKERS: … | none
QUESTIONS_FOR_USER: … | none
```

**Rules:**

- One task = one Task tool invocation = fresh subagent
- Never paste orchestrator chat history into subagent
- Parent summarizes subagent result for user — do not dump raw subagent log

---

## Context Packet builder (orchestrator)

Fill template from `docs/reference-driven-cycle.md` § Context Packet.

| Mode | Max docs | Max source files |
| ---- | -------- | ---------------- |
| REFERENCE_ANALYSIS | 3 | 0 (reference repo only) |
| MASTER_PLAN | 3 | 0–5 |
| GATE_CHECK | 2 | 0–3 |
| PLATFORM_SLICE | 3 | 3–8 |
| TARGET_BUILD | 1 | 0 |
| REWORK | 1 | 1–5 |
| ARCHITECTURE_REVIEW | 3 | git log + 3–5 |

Always include relevant **AD-xx** and **Parent facts** only.

---

## Notion: orchestrator responsibilities

| Action | Who |
| ------ | --- |
| Create epics / plan tasks | Subagent or orchestrator → **No Select** |
| No Select → **To do** | **Orchestrator** (GROOM) |
| **In progress** / **Review** / comments | **Subagent** |
| **Done** / reject → **To do** | **User** on board |
| Discovered tasks during work | **Subagent** → No Select + parent comment |

Query example:

```sql
SELECT url, Name, Select, Epic FROM "collection://86f1402a-f560-826a-8ea0-07594e7d6759"
WHERE Select = 'To do' ORDER BY "Date Created" ASC
```

---

## Trigger phrases → this skill

- возьми референс / по референсу / создай проект по референсу
- reference-driven / build from reference / replicate reference game
- доработай движок и редактор пока не соберём [game]
- CONTINUE / REWORK / ESCALATE (resume orchestrator in same chat)

If user only wants a **single** Notion task executed → use `@notion-execute-task`, not this skill.

---

## Do not

- Write production code in orchestrator chat (docs/reference-cycle/*.md notes OK)
- Run multiple tasks in one subagent
- Skip Phase 0/1 clarification gates
- Move tasks to **Done** (user only)
- Launch next task while previous is in **Review** without user CONTINUE
- Skip commit-before-Review policy for code subagents
- Load entire monorepo into context

---

## Cycle complete

When all MASTER_PLAN tasks are **Done** on board:

```markdown
**Cycle:** COMPLETE
Target: <TARGET_PATH>
Platform branch: <PLATFORM_BRANCH> — ready for merge PR
Suggest: final playthrough + user merge feat branch
```
