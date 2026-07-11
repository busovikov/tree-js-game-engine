# Notion — Task & Docs Workflow

> **Do not search for Notion URLs.** Use the fixed links below.  
> MCP server: `plugin-notion-workspace-notion` (Notion workspace).

---

## Fixed URLs (canonical)

| Board | URL | Use for |
| ----- | --- | ------- |
| **Project / TODO** | https://app.notion.com/p/187bea824a66467caa3d7b75656a3d9b?v=8a0aff4dfc0e492cbe801afa236ec13d | Tasks, backlog, status |
| **Iterative development** | https://app.notion.com/p/39a1402af56080458673d2afa6c1cdc5?v=7011402af5608398a5fe88954b3e9a8e | Reference-driven cycle (orchestrator) |
| **Docs** | https://app.notion.com/p/4b9d6e2385114318803399f91bc1d539?v=bf7c4fca0df345d2abe99f034852517a | Artifacts, specs, attachments |
| **Feature Task Template** | https://app.notion.com/p/Feature-Task-Template-39a1402af56080349186fce071ae7c72?v=bf7c4fca0df345d2abe99f034852517a | Duplicate → fill spec → link via 📎 Docs |

### Page IDs (for MCP)

```
Project:              187bea82-4a66-467c-aa3d-7b75656a3d9b
Docs:                 4b9d6e23-8511-4318-8033-99f91bc1d539
Feature Task Template: 39a1402a-f560-8034-9186-fce071ae7c72
Tasks data source:    114a0724-5da5-4611-967b-e8def615d996
Iterative data source: 86f1402a-f560-826a-8ea0-07594e7d6759
Docs data source:     73ffe0c3-80da-4bc2-939e-a92e4fb08cb4
Iterative task template (New Task): 7291402a-f560-82f8-bb89-81649141037a
```

**Reference-driven cycle** uses the **Iterative development** board — full workflow in [`reference-driven-cycle.md`](./reference-driven-cycle.md). Status `Select`: empty = No Select column; orchestrator grooms → To do; subagent → In progress → Review (+ commit for code); user → Done or To do.

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
| `notion-update-page` | Status → In progress / Review / Done |
| `notion-create-comment` | **Every iteration** + final summary on commit |
| `notion-create-pages` | New doc page under Docs board |
| `notion-search` | Only to find a **named task** inside known boards — not to find boards |

If MCP returns auth error → call `mcp_auth` for `plugin-notion-workspace-notion`, retry.

---

## Task status lifecycle

| Status | When |
| ------ | ---- |
| **To do** | New ticket (create flow) |
| **In progress** | Agent started work on this iteration |
| **Review** | Implementation iteration complete — **user reviews and may request changes** |
| **Done** | User approved + asked to commit + commit created |

**Never skip Review.** After each implementation pass → **Review**, not Done.

```
To do → In progress → Review → (user feedback) → In progress → Review → … → Done
                                                              ↑ only after commit
```

---

## Task anchor in chat (mandatory)

Every session working on a Notion task must **pin the task URL** and **sync Notion on every code pass** — including small user fixes and subagent sessions.

### Session variables

Establish once at task start (from user URL, board pick, or `notion-fetch`):

```
NOTION_TASK_URL:     https://app.notion.com/p/<page-id>
NOTION_TASK_PAGE_ID: <page-id>   # for notion-create-comment page_id
NOTION_TASK_TITLE:   <from fetch>
ITERATION:           1            # increment each implementation pass
```

If the user did not give a URL → **fetch board or ask** before editing files.

### Visible in every assistant message

While `NOTION_TASK_URL` is set, **every** user-facing reply must start with:

```markdown
**Notion:** [Task title](NOTION_TASK_URL) · **Status:** In progress | Review | Done
```

Subagents **must** echo the same line in their **first and last** message.

### Notion sync — required on every code pass

Applies to full implementations **and** small tweaks (“поправь”, “ещё раз”, one-line fixes).

| When | MCP action |
| ---- | ---------- |
| **Start pass** (before file edits) | `notion-update-page` → **In progress** |
| **Start pass** | `notion-create-comment` — "Started iteration N" |
| **End pass** (after edits + tests) | `notion-create-comment` — iteration summary |
| **End pass** | `notion-update-page` → **Review** |
| **User says commit** | comment + **Done** (see Ship wrap-up) |

**Rule:** no file edits for a Notion task without an anchored `NOTION_TASK_URL`.  
**Rule:** no code pass ends without `notion-create-comment` + status update.

### Subagent handoff (parent → Task tool)

Parent **must** include in subagent prompt:

```markdown
## Notion anchor (mandatory)
NOTION_TASK_URL: <full URL>
NOTION_TASK_PAGE_ID: <id>
NOTION_TASK_TITLE: <title>
ITERATION: <n>

Follow docs/notion.md § Task anchor in chat.
First action: echo task link in reply → notion-fetch → In progress → start comment.
Last action: iteration comment → Review → echo task link.
```

Parent's first reply after launch must also show **Notion:** link.

### Small fixes in same chat

When user requests tweaks while task is already anchored:

1. Re-use `NOTION_TASK_URL` from session (do not drop the link)
2. If status is **Review** → set **In progress** before edits
3. Apply file changes
4. `notion-create-comment` — short summary of tweak
5. **Review** again

Increment `ITERATION` on each pass.

### MCP examples

```
notion-create-comment
  page_id: "<NOTION_TASK_PAGE_ID>"
  markdown: "**Iteration 2** — Fixed validation in AssetBrowserPanel. Tests pass."

notion-update-page
  page_id: "<NOTION_TASK_PAGE_ID>"
  properties: { "Select": "Review" }
```

---

## Execute task from TODO (separate agent)

When the user asks to **run / execute / build a task from todo** (or gives a Notion task URL):

### Parent agent (this chat)

1. Resolve task URL → set **NOTION_TASK_URL** (see § Task anchor in chat).
2. **First reply:** show `**Notion:** [title](URL)` + `notion-fetch`.
3. **Launch subagent** with anchor block (URL, page_id, title, iteration) in prompt.
4. Subagent must sync Notion; parent keeps link visible when summarizing subagent result.

### Subagent (one task = one context)

```
0. Echo **Notion:** [title](NOTION_TASK_URL) in first message
1. notion-fetch NOTION_TASK_URL → confirm scope
2. notion-update-page → In progress + start comment
3. Read docs/ (1–3 files) + grep → implement
4. Test
5. notion-create-comment (iteration) → Review
6. Echo **Notion:** link in final message
```

**Rule:** one Notion task = one subagent per iteration. Anchor survives parent ↔ subagent handoff.

---

## Iteration wrap-up (after each implementation pass)

User reviews in **Review** before Done. Run after every coding pass:

| Step | Action |
| ---- | ------ |
| 1. Test | Run targeted tests + build; note commands in comment |
| 2. Comment | `notion-create-comment` — **required every iteration** (see template) |
| 3. Status | `notion-update-page` → **Review** |

**Do not** on iteration wrap-up:
- Move to **Done**
- `git commit` (unless user explicitly asks)
- Final `docs/` sweep (draft notes in comment only; full doc update at ship)

### Comment template (start pass)

```markdown
**Started iteration <n>** — <one line: what this pass will do>
```

### Comment template (iteration)

```markdown
## Iteration <n>

**Summary:** <what was implemented this pass>

**Changed:** `path/a.ts`, `path/b.ts`

**Tests:** `pnpm --filter @haku/<pkg> test` — pass / fail

**Docs (pending ship):** `docs/edge-cases.md` — planned update

**Ready for review:** yes / blocked — <reason>
```

### Comment template (small fix)

```markdown
**Tweak iteration <n>:** <what user asked> — <files changed>. Tests: pass/fail.
```

---

## Ship wrap-up (only when user says commit)

When the user explicitly asks to **commit** / **закоммить** / ship:

| Step | Action |
| ---- | ------ |
| 1. Summary | Final summary of all work across iterations |
| 2. Repo docs | Update `docs/*.md` listed in task AC (final pass) |
| 3. Commit | `git commit` per user format — only now |
| 4. Comment | `notion-create-comment` — final summary + commit hash |
| 5. Status | `notion-update-page` → **Done** |
| 6. Artifacts | Link Notion Docs pages if created |

### Comment template (ship / Done)

```markdown
## Shipped

**Summary:** <1–3 sentences — full feature outcome>

**Commit:** `<hash>` — `<first line of commit message>`

**Changed:** `path/a.ts`, `docs/edge-cases.md`, …

**Tests:** `pnpm test`, `pnpm build`, `./scripts/check.sh` — pass

**Docs updated:** `docs/edge-cases.md`, `docs/ui-kit.md`

**Docs artifact:** <Notion Docs page URL if any>
```

If commit fails or user cancels → stay in **Review**, comment why.

---

## Ship in another chat (commit without code session)

Commit often happens in a **new chat** without `NOTION_TASK_URL`. Agent **must** still complete Notion ship.

### Resolve task URL (before `git commit`)

| Priority | Action |
| -------- | ------ |
| 1 | User pasted URL in commit message → use it |
| 2 | User says "commit task X" → `notion-search` on Haku@editor board |
| 3 | Unknown → **Ask user:** "Notion task URL?" — **wait** before commit |
| 4 | Optional hint | Query board: `Select` in (`Review`, `In progress`) — confirm with user |

**Do not** run `git commit` until URL is resolved or user explicitly says "skip Notion".

### Ship checklist (same as § Ship wrap-up)

1. `notion-fetch` task + linked 📎 Docs
2. Final `docs/*.md` update
3. `git commit`
4. `notion-create-comment` — Shipped + hash
5. `notion-update-page` → **Done**
6. Reply with `**Notion:** [title](URL) · **Status:** Done`

### User tip (paste into commit chat)

```
Закоммить. Notion: https://app.notion.com/p/<task-id>
```

Cursor rule `haku-notion-ship.mdc` applies even without prior coding in this chat.

---

## When to update repo `docs/` vs Notion Docs

| Change | Where |
| ------ | ----- |
| Agent rules, API, architecture, edge cases | `docs/*.md` in git (source of truth for agents) |
| Task-specific spec, meeting notes, one-off design | Notion **Docs** board |
| Both | Update git docs for permanent agent knowledge + link Notion page in task comment |

---

## Quick reference for rules & skills

- Cursor rules: `.cursor/rules/haku-notion.mdc`, `haku-notion-ship.mdc`, `haku-notion-create-task.mdc`
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
