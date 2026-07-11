---
name: notion-ship-task
description: >-
  Completes Notion task ship on commit request in any Cursor chat. Resolves
  NOTION_TASK_URL, updates docs, commits, posts Notion comment, moves task to
  Done. Use when user says commit, ship, закоммить, or push after Notion work.
---

# Notion — Ship Task (on commit)

**Reference:** [`docs/notion.md`](../../../docs/notion.md) § Ship in another chat  
**Rule:** `haku-notion-ship.mdc` (always apply on commit)

---

## Trigger

User asks: commit, ship, закоммить, запуш, savepoint.

**Runs even in a new chat** with no prior `NOTION_TASK_URL`.

---

## Checklist

```
- [ ] 1. Resolve NOTION_TASK_URL (user URL → search → ask)
- [ ] 2. notion-fetch task
- [ ] 3. Echo **Notion:** [title](URL) in reply
- [ ] 4. Update docs/*.md (final pass)
- [ ] 5. git status / diff → git commit
- [ ] 6. notion-create-comment — Shipped + commit hash
- [ ] 7. notion-update-page → Done
- [ ] 8. Reply: **Notion:** … · **Status:** Done
```

---

## Resolve URL

1. URL in user message
2. `notion-search` task name on board
3. **Ask user** — block commit until answered
4. Query **Review** / **In progress** tasks — confirm with user

---

## Do not

- Commit without resolving task URL (unless user says skip Notion)
- Skip `notion-create-comment` or **Done**
- Assume rules from coding chat carry to commit chat
