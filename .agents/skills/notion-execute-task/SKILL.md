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
- [ ] Implement + test
- [ ] notion-create-comment — summary, files, tests
- [ ] notion-update-page → Review
- [ ] Echo Notion link · Status: Review
```

Increment `ITERATION` each pass. **Small user tweaks use the same flow.**

If status was **Review** and user asks a fix → **In progress** → edits → comment → **Review**.

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
