---
name: notion-execute-task
description: >-
  Executes Notion TODO tasks for @haku. Anchors NOTION_TASK_URL in every chat
  message, syncs Notion status and comments on every code pass (including small
  fixes and subagents). Review after each iteration; Done only after user-approved
  commit. Use when implementing or iterating on a Haku@editor Notion task.
---

# Notion — Execute Task

**Full reference:** [`docs/notion.md`](../../../docs/notion.md) § Task anchor in chat

**MCP server:** `plugin-notion-workspace-notion`

---

## Step 0 — Anchor (before any file edit)

```
NOTION_TASK_URL:     <from user or notion-fetch>
NOTION_TASK_PAGE_ID: <uuid from URL>
NOTION_TASK_TITLE:   <from fetch>
ITERATION:           <n>
```

If URL unknown → fetch board or ask user. **Do not code without anchor.**

**First reply must include:**

```markdown
**Notion:** [NOTION_TASK_TITLE](NOTION_TASK_URL) · **Status:** In progress
```

---

## Every code pass (full feature or small fix)

```
- [ ] Echo Notion link in reply
- [ ] notion-fetch NOTION_TASK_URL (first pass or if stale)
- [ ] notion-update-page → In progress
- [ ] notion-create-comment — "Started iteration N"
- [ ] **Define detailed AC** (see M1_VERIFICATION.md for vehicle/editor tasks)
- [ ] Implement + test
- [ ] **Playwright + screenshot self-review** — open PNGs; rework if wheels/drive/camera wrong
- [ ] notion-create-comment — **Review handoff** (mandatory template below)
- [ ] Update task card body with "Last iteration" block (same content)
- [ ] notion-update-page → Review
- [ ] Echo Notion link · Status: Review
```

**Never Review** when `m1-vehicle-alignment.spec.ts` fails or screenshots show detached wheels / backward drive.

Increment `ITERATION` each pass. **Small user tweaks use the same flow.**

If status was **Review** and user asks a fix → **In progress** → edits → comment → **Review**.

**Rework scope:** user comment may mention missing behavior that is **planned in another Notion task**. Do **not** expand current task scope — post `notion-create-comment`: «Out of scope for this task → **[Txx.x title](URL)**» and link the board card. Implement only what the current task AC covers.

---

## Review handoff comment (mandatory — user reviews from this)

Every pass ending in **Review** must post `notion-create-comment` **and** update the task card with:

```markdown
**Iteration N — ready for review**

## What was done
- Bullet list of concrete changes (packages, systems, UI, scenes)

## Files changed
- `path/to/file.ts` — one-line why

## Tests run
```bash
pnpm --filter @haku/<pkg> test  # N pass
pnpm build                        # pass
```

## Commit
`<hash>` — first line of commit message

## How to review
- Steps to verify (run commands, open editor, play mode actions)
- **Target project** play mode — not monorepo Demo Scene (AD-09)
- What is **not** visible yet (if applicable)

## Editor screenshots (mandatory when UI/editor-visible)

Attach **2–4 PNG screenshots** to the Notion task (comment upload or page embed) when the change is visible in editor/play mode:

1. Inspector / panel with new UI
2. Play mode demonstrating behavior (if applicable)

Capture via Playwright in `.agents/tools/editor-playwright/tests/` → save under `review-artifacts/<TASK_ID>/`. Link artifact paths in the comment.
```

**Without this comment the user cannot review.** Do not move to Review with only "done" or empty summary.

---

## Subagent

Parent passes anchor block in prompt. Subagent:

1. Echoes `**Notion:** [title](URL)` in first message
2. Runs full pass checklist above
3. Echoes link + Status in final message

---

## Ship (user says commit / закоммить)

```
- [ ] Final summary
- [ ] Update docs/*.md (task AC)
- [ ] git commit
- [ ] notion-create-comment — Shipped + commit hash
- [ ] notion-update-page → Done
- [ ] **Notion:** [title](URL) · **Status:** Done
```

---

## Do not

- Drop Notion link from chat mid-session
- Edit files without `NOTION_TASK_URL`
- End a pass without comment + status
- Set Done without user commit request
- Skip Notion sync on "small" fixes
- Implement rework feedback that belongs to another planned task — comment + link instead
