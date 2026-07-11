---
name: write-issue-commands
description: >-
  Deprecated redirect: issue mutations via read-shuttle-gh-issue-commands (shuttle gh issue … --yes).
---
# Internal: GitHub issue CLI (`write-issue-commands`)

> **Deprecated.** All issue **mutations** use [`read-shuttle-gh-issue-commands`](../../read/shuttle/gh/issue-commands/SKILL.md) — **`shuttle gh issue … --yes`** after Cursor **Proceed**. **Do not** embed raw `gh issue` or `gh label` bash fences.

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../read/safety/language-interaction-rules/SKILL.md) first.

## Operations (via shuttle)

| Operation | Library section |
| --- | --- |
| create / edit / batch | `read-shuttle-gh-issue-commands` |
| close / delete / comment | `read-shuttle-gh-issue-commands` |
| label delete | `read-shuttle-gh-label-read` |

Body file patterns: [`issue-create-prompt/SKILL.md`](./create/prompt/SKILL.md).

## See also

- [`read-shuttle-gh-issue-read`](../../read/shuttle/gh/issue-read/SKILL.md)
- [`read-safety-structured-qa`](../../../internal/read/safety/structured-qa/SKILL.md)
