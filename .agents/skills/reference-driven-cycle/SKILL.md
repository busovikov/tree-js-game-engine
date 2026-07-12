---
name: reference-driven-cycle
description: >-
  Orchestrates reference-driven development for @haku: analyze a reference repo,
  ask clarifying questions, plan in git docs, delegate subagents to build a target
  project via the editor while iteratively extending engine/editor. Use when the user
  asks to build/create a project from a reference, replicate a reference game,
  reference-driven cycle, по референсу, возьми референс, or iterative engine+editor
  improvement toward a target game.
---

# Reference-Driven Cycle — Orchestrator

**You are the ORCHESTRATOR.** You manage the full cycle. **You do not write production code.**

**Full playbook:** [`docs/reference-driven-cycle.md`](../../../docs/reference-driven-cycle.md)  
**Subagent handoff:** [`reference-driven-subagent`](../reference-driven-subagent/SKILL.md)

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
**Cycle:** <phase> · **Active:** <task or —>
```

---

## Session state (orchestrator keeps in chat)

```text
REFERENCE_PATH:     <url or ~/work/reference-game>
TARGET_PATH:        <~/work/my-game-target>
PLATFORM_REPO:      <tree-js-projects path>
PLATFORM_BRANCH:    feat/reference-<name>
PHASE:              PHASE_0 | PHASE_1 | EXECUTE | WAIT | ESCALATION
TASK_STREAK:        { "T02.3": 0, ... }
BLOCKED_BY:         { "T02.3": null | "ESCALATION-id" }
MASTER_PLAN:        path to <TARGET_PATH>/docs/MASTER_PLAN.md
```

---

## Phase machine

### PHASE_0 — Reference analysis

1. Launch **Task** subagent, `Mode: REFERENCE_ANALYSIS`
2. Subagent returns `QUESTIONS_FOR_USER` → **present questions to user**
3. **Stop** until user answers blocking questions
4. Update `REFERENCE_INTERPRETATION.md` / MASTER_PLAN draft
5. When interpretation confirmed → **PHASE_1**

### PHASE_1 — Master plan

1. Launch subagent `Mode: MASTER_PLAN` (include Phase 0 answers in Context Packet)
2. Subagent returns architectural questions (physics, UI, scripts, …)
3. **Stop** until user confirms **AD-xx** decisions
4. Subagent/orchestrator writes tasks in `MASTER_PLAN.md`
5. → **EXECUTE**

### EXECUTE — Main loop

```text
1. Pick next task from MASTER_PLAN (dependency order)
2. Decide subagent mode:
   - Planning/analysis task → direct mode from task spec
   - Content task → GATE_CHECK first
   - GATE=PLATFORM_FIRST → PLATFORM_SLICE, then re-GATE
   - GATE=BUILD_NOW → TARGET_BUILD
   - Platform task → PLATFORM_SLICE
3. Build Context Packet → launch Task subagent
4. → WAIT
```

### WAIT — After subagent handoff

Tell user:

```markdown
**<TASK>** готов к проверке (commit в handoff).
Напишите: `CONTINUE` или `REWORK <id> — <причина>`.
```

Do **not** launch next task until user sends CONTINUE/REWORK.

### User: REWORK

```text
streak[T] += 1
if streak[T] >= 3 → ESCALATION (below)
else → launch REWORK subagent, ITERATION+1
```

### ESCALATION (streak >= 3)

```text
1. Create escalation spec in target project docs/
2. BLOCKED_BY[T] = escalation id
3. Launch ARCHITECTURE_REVIEW subagent
4. Present questions to user → AD-ESCALATION-xx
5. Original T retry; streak[T] = 0
6. Resume EXECUTE with updated Context Packet (include AD-ESCALATION)
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
DISCOVERED_TASKS: [task ids] | none
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

## Trigger phrases → this skill

- возьми референс / по референсу / создай проект по референсу
- reference-driven / build from reference / replicate reference game
- доработай движок и редактор пока не соберём [game]
- CONTINUE / REWORK / ESCALATE (resume orchestrator in same chat)

---

## Do not

- Write production code in orchestrator chat (target project docs notes OK)
- Run multiple tasks in one subagent
- Skip Phase 0/1 clarification gates
- Launch next task while previous awaits user review without CONTINUE
- Skip commit-before-handoff policy for code subagents
- Load entire monorepo into context

---

## Cycle complete

When all MASTER_PLAN tasks are approved:

```markdown
**Cycle:** COMPLETE
Target: <TARGET_PATH>
Platform branch: <PLATFORM_BRANCH> — ready for merge PR
Suggest: final playthrough + user merge feat branch
```
