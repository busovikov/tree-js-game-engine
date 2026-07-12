# Reference-Driven Development Cycle

> Build a target game project **only through the editor**, using a reference repo as the spec.  
> When the editor or engine lacks a capability — extend the platform iteratively in a feature branch.

**Entry skill (orchestrator):** `.agents/skills/reference-driven-cycle/SKILL.md`  
**Subagent skill:** `.agents/skills/reference-driven-subagent/SKILL.md`  
**Starter prompt:** [`reference-cycle-starter-prompt.md`](./reference-cycle-starter-prompt.md)

---

## When to use

Trigger phrases (user):

- «возьми референс и создай проект»
- «reference-driven cycle», «по референсу»
- «build target project from reference repo»
- «доработай движок пока не соберём референс»

**One orchestrator chat** manages the full cycle. **One subagent per task** — fresh context.

---

## Three artifacts (never mix)

| Artifact | Location | Role |
| -------- | -------- | ---- |
| **Reference** | External git repo (read-only) | What to build — levels, mechanics, assets |
| **Target project** | Separate folder on disk (`~/work/<name>/`) | Output — scenes/assets edited via **editor only** |
| **Platform** | `tree-js-projects` monorepo | Engine + editor improvements on `feat/reference-<name>` |

```
Reference (spec)  →  Target project (artifact)  +  Platform (capabilities)
```

### Setup (once per cycle)

```bash
# Target project (outside monorepo)
pnpm --filter @haku/create exec haku-create my-game-target ~/work/my-game-target

# Reference (read-only analysis)
git clone <REFERENCE_URL> ~/work/reference-game

# Platform branch
cd /path/to/tree-js-projects
git checkout -b feat/reference-<short-name>
```

### Cycle artifacts (on disk)

Store under the **target project** (not in monorepo):

```
<TARGET_PATH>/docs/
├── REFERENCE_INVENTORY.md
├── REFERENCE_INTERPRETATION.md   # confirmed understanding
├── OPEN_QUESTIONS.md
├── DECISIONS_LOG.md                # AD-xx + AD-ESCALATION-xx
└── MASTER_PLAN.md
```

---

## Roles

### Orchestrator (parent chat)

- Runs phases 0 → 1 → execution loop
- **Does not write production code** — delegates to subagents
- Builds **Context Packets** (minimal handoff, no chat history)
- Tracks `TASK_STREAK` per task for escalation
- Waits for user approval after each task

Every orchestrator reply starts with:

```markdown
**Cycle:** <PHASE_0 | PHASE_1 | GATE | BUILD | ESCALATION | WAIT> · **Active:** <task or —>
```

### Subagent (one task = one context)

- Receives Context Packet only
- Executes one **Mode** (see below)
- **Commit** before handoff (code tasks)
- Returns structured handoff to orchestrator

---

## Phases

### Phase 0 — Reference analysis + clarification

**Mode:** `REFERENCE_ANALYSIS` · **No code.**

1. Read reference repo (inventory)
2. Write **Interpretation Summary** — how the agent understands the project
3. Ask clarifying questions in batches (max 8 per message):
   - project essence, scope parity, mechanics interpretation, assets, ambiguities
4. **Stop** until user answers blocking questions
5. Output: `REFERENCE_INTERPRETATION.md`, `REFERENCE_INVENTORY.md`, `OPEN_QUESTIONS.md`
6. Add epic stubs to `MASTER_PLAN.md` draft

**Exit criteria:** user confirmed interpretation; no blocking open questions on scope.

### Phase 1 — Master plan + architectural decisions

**Mode:** `MASTER_PLAN` · **No code.**

1. Gap analysis: reference vs `@haku` capabilities
2. For each gap with multiple paths — questions + alternatives table (A/B/C/D):
   - **Physics** (Rapier + custom raycast vehicle, custom AABB, defer)
   - **In-game UI** (DOM overlay, scene entities, defer)
   - **Scripts**, network, audio, saves, etc.
3. Draft `MASTER_PLAN.md` + **AD-xx** decisions
4. Second question round: epic order, first milestone
5. Create all subtasks in `MASTER_PLAN.md`
6. Orchestrator picks first epic tasks for execution

**Exit criteria:** all **AD-xx** confirmed by user; MASTER_PLAN finalized.

### Phase 2 — Execution loop

For each task in the plan:

1. **GATE_CHECK** (content/platform tasks) → `BUILD_NOW` | `PLATFORM_FIRST`
2. If `PLATFORM_FIRST` → **PLATFORM_SLICE** in monorepo
3. **TARGET_BUILD** in target project (editor only)
4. User reviews → approve or request rework

Slice order for platform work: `schema → core → serializer → engine → editor`  
See `docs/agent-workflow.md`.

---

## Subagent modes

| Mode | Writes code? | Commit before Review? |
| ---- | ------------ | --------------------- |
| `REFERENCE_ANALYSIS` | No | No |
| `MASTER_PLAN` | No | No |
| `GATE_CHECK` | No | No |
| `PLATFORM_SLICE` | Yes (monorepo) | **Yes** |
| `TARGET_BUILD` | Yes (target project) | **Yes** |
| `REWORK` | Yes | **Yes** |
| `ARCHITECTURE_REVIEW` | No (spec in git docs) | No |

### GATE_CHECK decision

| Result | Next step |
| ------ | --------- |
| `BUILD_NOW` | `TARGET_BUILD` |
| `PLATFORM_FIRST` | `PLATFORM_SLICE` → re-GATE → BUILD |

---

## Context Packet (orchestrator → subagent)

Orchestrator passes **only** this — no chat dump:

```markdown
## Context Packet — <TASK_ID>

### Task anchor
TASK_ID: <Txx.y>
TASK_TITLE: <title>
ITERATION: <n>

### Mode
<MODE>

### Task
<1–3 sentences>

### Done when
- [ ] …

### Constraints
- Platform: <monorepo path>, branch feat/reference-<name>
- Target: ~/work/<name> (TARGET_BUILD only) — **AD-09:** scene/assets only in target; never patch `apps/playground` for verification
- Reference: <path> (read-only)
- Editor verification: open target project (`?hakuOpenTarget=1` or File → Open Project)
- Editor mutations: commitSceneEdit
- …

### Architectural decisions (relevant only)
AD-01: …

### Read (max 3 docs + 3–8 files)
- docs/…
- packages/…

### Out of scope
- …

### Parent facts (no chat history)
- T01.2 Done — camera added
- Blocker cleared: Sprite merged
```

Context budget: see mode table in subagent skill.

---

## Commit before handoff (mandatory for code tasks)

Before returning to orchestrator:

```bash
pnpm test   # affected package
pnpm build  # if types/exports changed
git add <scoped files only>
git commit -m "$(cat <<'EOF'
short description

Summary for changes.
EOF
)"
```

| Mode | Commit repo |
| ---- | ----------- |
| `PLATFORM_SLICE`, `REWORK` (platform) | `tree-js-projects` |
| `TARGET_BUILD`, `REWORK` (target) | target project folder |

Commit format: short line + summary paragraph. No `Co-authored-by: Cursor`.

User approval is separate from commit.

---

## Escalation (3 failed reviews in a row)

Orchestrator tracks `TASK_STREAK` per task:

| Event | Streak |
| ----- | ------ |
| User rejects task | `+1` |
| User approves task | `0` |

When `streak >= 3`:

1. Stop rework on blocked task
2. Create `[ESCALATION] <task>` spec in git docs
3. Launch `ARCHITECTURE_REVIEW` subagent
4. Block original task (note: waiting for AD-ESCALATION-xx)
5. Subagent: analyze last 3 commits + feedback + architecture → alternatives + **questions for user**
6. After user answers → record **AD-ESCALATION-xx** → original task retry, streak `0`

---

## Hard rules

1. **Editor first** — try building in editor; extend platform only on proven blocker (GATE_CHECK).
2. **One task = one subagent = new context.**
3. **No platform edits** during TARGET_BUILD (except explicit bugs).
4. **Components in IWorld** — no Three.js in schema/core; `commitSceneEdit` in editor.
5. **Reference is read-only** — implement equivalent in haku format.
6. **Orchestrator does not write production code.**
7. **Commit before handoff** for all code modes.
8. **User owns approval** and reject → rework.

---

## Orchestrator loop (pseudocode)

```text
ON START:
  resolve REFERENCE_PATH, TARGET_PATH, PLATFORM_BRANCH from user
  if missing → ask
  PHASE_0 → subagent REFERENCE_ANALYSIS → collect user answers
  PHASE_1 → subagent MASTER_PLAN → confirm AD-xx → groom To do

LOOP:
  pick next task from MASTER_PLAN
  if content task → GATE_CHECK subagent
  if PLATFORM_FIRST → PLATFORM_SLICE → re-GATE
  else TARGET_BUILD or PLATFORM_SLICE per task type
  WAIT user approval | rework
  if rework → streak++; if streak>=3 → ESCALATION else REWORK
  if approved → streak=0; next task
  if all MASTER_PLAN tasks done → cycle complete
```

---

## User messages to orchestrator

```markdown
# Start
Возьми референс <URL> и создай проект. Целевой: ~/work/my-game-target

# After task review
CONTINUE — T02.3 approved. Next task.

# Reject
REWORK T02.3 — sprite wrong scale.

# Manual escalate
ESCALATE T02.3

# Resume after pause
CONTINUE cycle
```

---

## Related docs & skills

| Resource | Path |
| -------- | ---- |
| Orchestrator skill | `.agents/skills/reference-driven-cycle/SKILL.md` |
| Subagent skill | `.agents/skills/reference-driven-subagent/SKILL.md` |
| Starter prompt | `docs/reference-cycle-starter-prompt.md` |
| Agent workflow | `docs/agent-workflow.md` |
| Architecture | `docs/architecture.md` |
