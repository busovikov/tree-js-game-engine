---
name: write-issue-commands-delete-closed
description: >-
  Read-only: bulk delete closed issues (gh shapes). Parent write-issue-commands.
---
# Bulk delete closed issues

**Normative CLI shapes** — **list:** [`read-issue-list`](../../../internal/read/issue/list/SKILL.md); **delete:** [`write-issue-commands`](./SKILL.md). **Public skill:** **`@gh-issue-delete-closed`**.

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../../../read/safety/language-interaction-rules/SKILL.md) first. Use English by default for all assistant output, including AskQuestion prompts/options, unless the user explicitly requests another full-language response.

