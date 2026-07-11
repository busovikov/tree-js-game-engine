# Creating Feature Tasks (Notion)

> **Goal:** Create a high-quality implementation task — **do not implement the feature yourself.**  
> Another agent executes from TODO. Full Notion URLs: [`notion.md`](./notion.md).

---

## Agent role

| You are | You are NOT |
| ------- | ----------- |
| Task author / planner | Implementation agent |
| Research + write ticket | Writing production code for the feature |

If the user asks to **create a task / ticket / todo** → follow this doc.  
If the user asks to **execute / build** a task → see [`notion.md`](./notion.md) § Execute task (separate subagent).

---

## Notion targets (fixed — no search)

| Resource | URL | Data source ID |
| -------- | --- | -------------- |
| **Tasks board** ✔️ Haku@editor | https://app.notion.com/p/187bea824a66467caa3d7b75656a3d9b?v=8a0aff4dfc0e492cbe801afa236ec13d | `114a0724-5da5-4611-967b-e8def615d996` |
| **Docs** 📎 | https://app.notion.com/p/4b9d6e2385114318803399f91bc1d539?v=bf7c4fca0df345d2abe99f034852517a | `73ffe0c3-80da-4bc2-939e-a92e4fb08cb4` |
| **Feature Task Template** | https://app.notion.com/p/Feature-Task-Template-39a1402af56080349186fce071ae7c72?v=bf7c4fca0df345d2abe99f034852517a | `39a1402af56080349186fce071ae7c72` |

### Task properties (required on create)

| Property | Value for new tickets |
| -------- | --------------------- |
| **Name** | Clear task title |
| **Select** (status) | **`To do`** — lands in TODO column on board |
| **Epic** | Correct epic (see table below) |
| **Type** | `Bug` \| `Feature` \| `Task` |
| **📎 Docs** | Relation to spec page in Docs DB (**required** — duplicate from Feature Task Template) |

**Tasks board template:** `cbc2116d-c27d-47b0-878d-c67dfcb45461` (New Task) — card only; spec body lives in 📎 Docs.

**Feature Task Template** (canonical spec structure): page `39a1402af56080349186fce071ae7c72` in 📎 Docs — **duplicate**, then fill sections.

---

## Epic mapping (@haku)

Pick **one** Epic from the board schema:

| Work area | Epic |
| --------- | ---- |
| `packages/schema`, `packages/core`, `packages/serializer` | **Engine** |
| `packages/engine`, render, Three.js runtime | **Engine** |
| `packages/editor`, `apps/editor`, inspector, viewport UI | **Editor** |
| `apps/playground` | **Playground** |
| Editor UI kit / design system | **UI system** |
| Particles / VFX | **Particles** |
| Audio | **Audio** |
| Animation / clips | **Animation** |
| Physics | **Physics** |
| ScriptRef / runtime scripts | **Script runtime** |
| In-editor code editor | **Built-in code editor** |

If unclear → ask user before creating the ticket.

### Type mapping

| Request | Type |
| ------- | ---- |
| New capability, user-facing behavior | **Feature** |
| Broken behavior, regression | **Bug** |
| Chore, docs-only, small refactor | **Task** |

---

## Workflow (before writing the ticket)

### 1. Understand the request

- What problem is solved?
- Who benefits?
- Expected behavior?
- **Out of scope** (explicit list)?

Resolve ambiguity **before** creating the ticket.

### 2. Study the project (minimal context)

Read from repo — **do not load whole project**:

| Need | Doc / action |
| ---- | ------------ |
| Workflow | `docs/agent-workflow.md` |
| Architecture | `docs/architecture.md` |
| Stack | `docs/techstack.md` |
| UI | `docs/ui-kit.md` |
| Failures | `docs/edge-cases.md` |
| API | `docs/links.md` |

Grep similar features; reference **file paths**, not full file contents in the ticket.

Do not duplicate existing docs — summarize only what the implementer needs.

### 3. Research external information

- Use `docs/links.md` for official Three.js / React / Zod URLs
- `source-driven-development` skill — verify against pinned versions
- **Project architecture wins** over external blog posts

### 4. Identify affected areas (@haku)

Mention only relevant:

- `schema` / `core` / `serializer` / `engine` / `editor` / `playground`
- Tests (`packages/*/src/*.test.ts`)
- **Local repo docs** (`docs/*.md`) — implementation agent **must** update these
- Notion Docs artifact (optional spec page)

### 5. Write the task

Concise, implementation-ready, self-contained.  
Assume implementer has **never** seen the project — but link to `docs/` instead of pasting architecture tomes.

---

## MCP: create ticket

### Step A — Duplicate Feature Task Template (spec in 📎 Docs)

1. `notion-fetch` template (optional — refresh structure):  
   `https://app.notion.com/p/39a1402af56080349186fce071ae7c72`
2. `notion-duplicate-page` → `page_id: "39a1402af56080349186fce071ae7c72"`  
   Duplication is async — wait, then `notion-fetch` the new page URL.
3. `notion-update-page` on the duplicate:
   - **Name** → `<task title> — Spec`
   - **Type** → `Technical Spec`
   - **Status** → `In Progress`
   - **Content** → fill all sections per template below (do not leave placeholders)

Save the new spec page URL for Step B.

**Alternative:** `notion-create-pages` in Docs data source with content matching the template sections (if duplicate is unavailable).

### Step B — Create task card in TODO

```
notion-create-pages
  parent: { data_source_id: "114a0724-5da5-4611-967b-e8def615d996" }
  pages: [{
    template_id: "cbc2116d-c27d-47b0-878d-c67dfcb45461",
    properties: {
      "Name": "<task title>",
      "Select": "To do",
      "Epic": "<Engine|Editor|...>",
      "Type": "<Feature|Bug|Task>",
      "📎 Docs": "[\"<spec page URL from Step A>\"]"
    }
  }]
```

Do **not** pass `content` when using `template_id` — spec is in 📎 Docs.

**Verify:** task in **To do** column; **📎 Docs** links to filled spec.

---

## Feature Task Template — sections to fill

Source: [Feature Task Template](https://app.notion.com/p/Feature-Task-Template-39a1402af56080349186fce071ae7c72) (`39a1402af56080349186fce071ae7c72`)

Fill every section in the duplicated page. @haku additions in **bold**.

### Objective
One or two short paragraphs — desired outcome, not implementation.

### Background
Current behavior, motivation, minimal architectural context.

### References

| Subsection | @haku — fill with |
| ---------- | ----------------- |
| **Documentation** | `docs/agent-workflow.md`, `docs/<relevant>.md` paths |
| **Architecture** | `docs/architecture.md`, `IMPLEMENTATION_PLAN.md` § if locked |
| **Relevant Code** | `packages/.../file.ts` paths (grep results) |
| **Similar Implementations** | Existing patterns to reuse |

### Requirements
- **Functional** — measurable bullets
- **Non-Functional** — only applicable (performance, security, etc.)

### Constraints
Package boundaries (`AGENTS.md`), `commitSceneEdit`, no React in engine, no invented APIs.

### Suggested Investigation
Modules, tests, APIs to read before coding.

### Acceptance Criteria
Objective, independently testable. **Must include:** list of `docs/*.md` files implementer updates in git.

### Validation
```bash
pnpm --filter @haku/<package> test
pnpm build
./scripts/check.sh
```

### Deliverables
Implementation, tests, **repo `docs/` updates** (list files), migration if any.

### Out of Scope
Explicit exclusions.

---

## Writing principles

The task must answer:

- What needs to be built?
- Why is it needed?
- What context is required?
- Which existing code to reuse?
- What constraints exist?
- How is success verified?

Avoid long narratives. Short bullets. Every AC objectively verifiable.

---

## Quality checklist (before publishing)

- [ ] Objective clear
- [ ] Background concise
- [ ] Relevant project context + doc paths
- [ ] Similar implementations referenced by path
- [ ] External research done (links.md / official docs)
- [ ] Architecture constraints respected (no React in engine, etc.)
- [ ] **Select = To do**, **Epic** and **Type** correct
- [ ] **Feature Task Template** duplicated and all sections filled
- [ ] **📎 Docs** linked on task card
- [ ] Acceptance criteria measurable
- [ ] **Repo `docs/` update** listed in AC (mandatory section)
- [ ] Out of scope explicit
- [ ] Implementation-ready — minimal clarification needed

---

## Dual documentation rule

| Layer | When | Who updates |
| ----- | ---- | ----------- |
| **Git `docs/*.md`** | Permanent agent knowledge, API, architecture, edge cases | **Implementation agent** (required in AC) |
| **Notion 📎 Docs** | Task-specific spec, design notes, kickoff | **Task author** at create; implementer may extend |

Creating a ticket does **not** replace updating local `docs/` after implementation.

---

## After creating the ticket

1. Return to user: task URL, Epic, Type, linked Docs URL
2. Do **not** start implementation in the same session unless user asks
3. Suggest: "Run task via separate agent" → [`notion.md`](./notion.md)
