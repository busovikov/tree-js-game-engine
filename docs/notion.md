# Notion — Task & Docs Workflow

> **Do not search for Notion URLs.** Use the fixed links below.  
> MCP server: `plugin-notion-workspace-notion` (Notion workspace).

---

## Fixed URLs (canonical)

| Board | URL | Use for |
| ----- | --- | ------- |
| **Project / TODO** | https://app.notion.com/p/187bea824a66467caa3d7b75656a3d9b?v=8a0aff4dfc0e492cbe801afa236ec13d | Tasks, backlog, status |
| **Docs** | https://app.notion.com/p/4b9d6e2385114318803399f91bc1d539?v=bf7c4fca0df345d2abe99f034852517a | Artifacts, specs, attachments |
| **Feature Task Template** | https://app.notion.com/p/Feature-Task-Template-39a1402af56080349186fce071ae7c72?v=bf7c4fca0df345d2abe99f034852517a | Duplicate → fill spec → link via 📎 Docs |

### Page IDs (for MCP)

```
Project:              187bea82-4a66-467c-aa3d-7b75656a3d9b
Docs:                 4b9d6e23-8511-4318-8033-99f91bc1d539
Feature Task Template: 39a1402a-f560-8034-9186-fce071ae7c72
Tasks data source:    114a0724-5da5-4611-967b-e8def615d996
Docs data source:     73ffe0c3-80da-4bc2-939e-a92e4fb08cb4
```

---

## How to open Notion (agent — no search)

**Step 1:** Read this file — `docs/notion.md` (not workspace search).

**Step 2:** Fetch content via MCP:

```
notion-fetch  →  url: <Project or Docs URL above>
```

Or fetch a specific task page URL if the user pasted it.

**Step 3 (optional UI):** Open in browser for user visibility:

```
cursor-ide-browser: browser_navigate → Project or Docs URL
```

**Do not** use `notion-search` to find the project board — URLs are fixed above.

### MCP tools (common)

| Tool | When |
| ---- | ---- |
| `notion-fetch` | Read task page, board, docs, Feature Task Template |
| `notion-duplicate-page` | Copy Feature Task Template → new spec |
| `notion-update-page` | Status → In progress / Done |
| `notion-create-comment` | Progress, summary, links to artifacts |
| `notion-create-pages` | New doc page under Docs board |
| `notion-search` | Only to find a **named task** inside known boards — not to find boards |

If MCP returns auth error → call `mcp_auth` for `plugin-notion-workspace-notion`, retry.

---

## Execute task from TODO (separate agent)

When the user asks to **run / execute / build a task from todo** (or gives a Notion task URL):

### Parent agent (this chat)

1. **Do not implement in the same long session** if other work is present.
2. Fetch task from Notion Project URL (or user-provided task URL).
3. **Launch a new subagent** (`Task` tool) with a **fresh prompt** containing:
   - Task title + description + acceptance criteria from Notion
   - Links: `docs/agent-workflow.md`, relevant `docs/*.md` for task type
   - Done criteria (test, docs update, Notion update)
4. Optionally set parent task status in Notion → In progress before subagent starts.

### Subagent (one task = one context)

```
1. Read docs/agent-workflow.md + task-specific docs (1–3 files)
2. notion-fetch task page → confirm scope and done criteria
3. notion-update-page → Status: In progress
4. Implement minimal diff in repo (grep → 3–10 files)
5. Test: pnpm test / pnpm build / ./scripts/check.sh (as needed)
6. Update repo docs if behavior/architecture changed (docs/*.md)
7. Notion wrap-up (see below)
8. Report back to user with summary + commit hash if committed
```

**Rule:** one Notion task = **one subagent session**. No multi-task batching in one agent.

---

## After implementation (Notion wrap-up)

| Step | Action |
| ---- | ------ |
| 1. Test | Run targeted tests + build; note commands in comment |
| 2. Repo docs | Update `docs/` if API, UI, edge cases, or workflow changed |
| 3. Task comment | `notion-create-comment` on task page: summary, files changed, test results |
| 4. Artifacts | If spec/design/decision doc created → attach under **Docs** board (`notion-create-pages` or link in comment) |
| 5. Status | `notion-update-page` → Done (or Blocked + comment if failed) |

### Comment template (task page)

```markdown
## Done

**Summary:** <1–2 sentences>

**Changed:** `path/a.ts`, `docs/edge-cases.md`

**Tests:** `pnpm --filter @haku/engine test` — pass

**Docs artifact:** <Notion Docs page URL if created>
```

---

## When to update repo `docs/` vs Notion Docs

| Change | Where |
| ------ | ----- |
| Agent rules, API, architecture, edge cases | `docs/*.md` in git (source of truth for agents) |
| Task-specific spec, meeting notes, one-off design | Notion **Docs** board |
| Both | Update git docs for permanent agent knowledge + link Notion page in task comment |

---

## Quick reference for rules & skills

- Cursor rules: `.cursor/rules/haku-notion.mdc`, `haku-notion-create-task.mdc`
- **Create ticket:** [`notion-create-task.md`](./notion-create-task.md) — do not implement
- **Execute ticket:** this file § Execute task from TODO
- Agent workflow: `docs/agent-workflow.md`

---

## Database schema (cached)

### Tasks — ✔️ Haku@editor

`data_source_id`: `114a0724-5da5-4611-967b-e8def615d996`

| Property | Values |
| -------- | ------ |
| **Select** (status) | `To do`, `In progress`, `Review`, `Done` |
| **Epic** | Playground, Engine, Editor, Built-in code editor, Particles, Audio, UI system, Animation, Physics, Script runtime |
| **Type** | Bug, Feature, Task |
| **📎 Docs** | Relation → Docs DB |

New tickets: **Select = `To do`**. Epic + Type per [`notion-create-task.md`](./notion-create-task.md).

### Docs — 📎

`data_source_id`: `73ffe0c3-80da-4bc2-939e-a92e4fb08cb4`

| Property | Values |
| -------- | ------ |
| **Type** | Project Kickoff 🚀, Technical Spec, Architecture Overview |
| **Status** | In Progress, In Review, Approved, Archived |

Refresh schema: `notion-fetch` with board URLs above.
