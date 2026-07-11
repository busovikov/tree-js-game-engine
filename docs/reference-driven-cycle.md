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

### Agent editor workflow (Playwright)

Subagents **must use Playwright** to operate the editor during `TARGET_BUILD` — import assets, place entities, save scenes, enter play mode. Playwright is **agent tooling** (`.agents/tools/editor-playwright/`), **not** a platform feature or Notion epic.

See [`reference-cycle/AGENT_EDITOR_WORKFLOW.md`](./reference-cycle/AGENT_EDITOR_WORKFLOW.md).

### Cycle artifacts (on disk)

Store under target project or a dedicated folder:

```
docs/reference-cycle/
├── REFERENCE_INVENTORY.md
├── REFERENCE_INTERPRETATION.md   # confirmed understanding
├── OPEN_QUESTIONS.md
├── DECISIONS_LOG.md                # AD-xx + AD-ESCALATION-xx
└── MASTER_PLAN.md
```

---

## Notion tracker (iterative board)

| Resource | Value |
| -------- | ----- |
| **Board** | https://app.notion.com/p/39a1402af56080458673d2afa6c1cdc5?v=7011402af5608398a5fe88954b3e9a8e |
| **Data source ID** | `86f1402a-f560-826a-8ea0-07594e7d6759` |
| **Task template (New Task)** | `7291402a-f560-82f8-bb89-81649141037a` |
| **Docs data source** | `73ffe0c3-80da-4bc2-939e-a92e4fb08cb4` |

MCP server: `plugin-notion-workspace-notion` · Auth fail → `mcp_auth`, retry.

### Status workflow (`Select` property)

| Board column | Who sets | When |
| ------------ | -------- | ---- |
| **No Select** (empty `Select`) | Subagent / orchestrator | Task **discovered** during work — not yet scheduled |
| **To do** | Orchestrator | Ready for **next** cycle step |
| **In progress** | Subagent | Start of execution (before code edits) |
| **Review** | Subagent | After iteration complete + **commit** (code tasks) |
| **Done** | **User** | User approved result on board |
| **To do** (return) | **User** | User rejected — needs rework |

```
No Select ──(orchestrator groom)──► To do ──(subagent)──► In progress
                                                              │
                                         git commit ◄──────────┤
                                                              ▼
                    To do ◄──(user reject)── Review ◄─────────┘
                      │                          │
                      └── rework ────────────────┘
                                                 │
                                        (user approve)──► Done
```

### Create discovered task

**Every task needs a filled 📎 Docs spec** — same workflow as [`notion-create-task.md`](./notion-create-task.md):

1. `notion-duplicate-page` → Feature Task Template `39a1402af56080349186fce071ae7c72`
2. Fill all spec sections (Objective … Out of Scope)
3. Create/update board card with **📎 Docs** relation — never publish empty `# To Do / - [ ] ...` only

```text
notion-create-pages
  parent: { data_source_id: "86f1402a-f560-826a-8ea0-07594e7d6759" }
  template_id: "7291402a-f560-82f8-bb89-81649141037a"
  properties:
    Name: "<title>"
    Type: "Feature" | "Task" | "Bug"
    Epic: "Engine" | "Editor" | "Physics" | "UI system" | …
    "📎 Docs": "[\"<spec page URL>\"]"
    # Do NOT set Select → lands in No Select
```

Comment on parent task: `**Discovered:** [title](URL) — reason: …`

---

## Roles

### Orchestrator (parent chat)

- Runs phases 0 → 1 → execution loop
- **Does not write production code** — delegates to subagents
- Builds **Context Packets** (minimal handoff, no chat history)
- Queries Notion, grooms No Select → To do
- Tracks `TASK_STREAK` per task for escalation
- Waits for user **Done / To do** on board after each Review

Every orchestrator reply starts with:

```markdown
**Cycle:** <PHASE_0 | PHASE_1 | GATE | BUILD | ESCALATION | GROOM | WAIT> · **Active:** <task or —> · **Board:** [Iterative dev](https://app.notion.com/p/39a1402af56080458673d2afa6c1cdc5)
```

### Subagent (one task = one context)

- Receives Context Packet only
- Executes one **Mode** (see below)
- Syncs Notion: In progress → work → **commit** (code) → Review
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
6. Create epic tasks in Notion → **No Select**

**Exit criteria:** user confirmed interpretation; no blocking open questions on scope.

### Phase 1 — Master plan + architectural decisions

**Mode:** `MASTER_PLAN` · **No code.**

1. Gap analysis: reference vs `@haku` capabilities
2. For each gap with multiple paths — questions + alternatives table (A/B/C/D):
   - **Physics** (Rapier, cannon-es, custom AABB, defer)
   - **In-game UI** (DOM overlay, scene entities, defer)
   - **Scripts**, network, audio, saves, etc.
3. Draft `MASTER_PLAN.md` + **AD-xx** decisions
4. Second question round: epic order, first milestone
5. Create all subtasks in Notion → **No Select**
6. Orchestrator grooms first epic → **To do**

**Exit criteria:** all **AD-xx** confirmed by user; MASTER_PLAN finalized.

### Phase 2 — Execution loop

For each task in **To do**:

1. **GATE_CHECK** (content/platform tasks) → `BUILD_NOW` | `PLATFORM_FIRST`
2. If `PLATFORM_FIRST` → **PLATFORM_SLICE** in monorepo
3. **TARGET_BUILD** in target project (editor only)
4. User reviews → **Done** or **To do** (rework)

Slice order for platform work: `schema → core → serializer → engine → editor`  
See `incremental-implementation` skill and `docs/agent-workflow.md`.

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
| `ARCHITECTURE_REVIEW` | No (spec in Notion Docs) | No |

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

### Notion anchor
NOTION_TASK_URL: <url>
NOTION_TASK_PAGE_ID: <uuid>
NOTION_TASK_TITLE: <title>
ITERATION: <n>
NOTION_BOARD: https://app.notion.com/p/39a1402af56080458673d2afa6c1cdc5

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
- Playwright: `openTargetProject()` — no Demo Scene hack
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

## Commit before Review (mandatory for code tasks)

Before `notion-update-page → Review`:

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

**Notion comment must include commit hash.** No Review without successful commit (code tasks).

Commit format: short line + summary paragraph. No `Co-authored-by: Cursor`.

**Done** on board = user approval — separate from commit. User may ask ship/commit in another chat (`@notion-ship-task`).

---

## Escalation (3 failed reviews in a row)

Orchestrator tracks `TASK_STREAK` per task:

| Event | Streak |
| ----- | ------ |
| User moves Review → **To do** | `+1` |
| User moves → **Done** | `0` |

When `streak >= 3`:

1. Stop rework on blocked task
2. Create `[ESCALATION] <task>` in Notion → **No Select** → orchestrator moves to **To do**
3. Launch `ARCHITECTURE_REVIEW` subagent
4. Block original task (comment: waiting for AD-ESCALATION-xx)
5. Subagent: analyze last 3 commits + comments + architecture → alternatives + **questions for user**
6. After user answers → record **AD-ESCALATION-xx** → escalation Done → original **To do**, streak `0`

---

## Hard rules

1. **Editor first** — try building in editor; extend platform only on proven blocker (GATE_CHECK).
2. **One task = one subagent = new context.**
3. **No platform edits** during TARGET_BUILD (except explicit bugs).
4. **Components in IWorld** — no Three.js in schema/core; `commitSceneEdit` in editor.
5. **Reference is read-only** — implement equivalent in haku format.
6. **Orchestrator does not write production code.**
7. **Commit before Review** for all code modes.
8. **User owns Done** and reject → To do on board.

---

## Orchestrator loop (pseudocode)

```text
ON START:
  resolve REFERENCE_PATH, TARGET_PATH, PLATFORM_BRANCH from user
  if missing → ask
  PHASE_0 → subagent REFERENCE_ANALYSIS → collect user answers
  PHASE_1 → subagent MASTER_PLAN → confirm AD-xx → groom To do

LOOP:
  query Notion Select = 'To do'
  if empty → promote from No Select (by MASTER_PLAN order)
  if empty → ask user
  pick task T
  if content task → GATE_CHECK subagent
  if PLATFORM_FIRST → PLATFORM_SLICE → re-GATE
  else TARGET_BUILD or PLATFORM_SLICE per task type
  WAIT user Done | To do on board
  if To do → streak++; if streak>=3 → ESCALATION else REWORK
  if Done → streak=0; next task
  if all MASTER_PLAN tasks Done → cycle complete
```

---

## User messages to orchestrator

```markdown
# Start
Возьми референс <URL> и создай проект. Целевой: ~/work/my-game-target

# After Review on board
CONTINUE — T02.3 → Done. Next task.

# Reject
REWORK T02.3 — sprite wrong scale. Moved to To do.

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
| Notion (general) | `docs/notion.md` |
| Incremental slices | `.agents/skills/incremental-implementation/SKILL.md` |
| Execute single Notion task | `.agents/skills/notion-execute-task/SKILL.md` |

---

## Quick reference — Notion MCP

```text
notion-fetch           id: <task URL>
notion-query-data-sources  SQL on collection://86f1402a-f560-826a-8ea0-07594e7d6759
notion-create-pages    parent data_source_id + template_id
notion-update-page     properties: { "Select": "In progress" | "Review" | "To do" }
notion-create-comment  page_id + markdown (iteration / discovered / escalation)
```

Property name for status on this board: **`Select`** (type: status).
