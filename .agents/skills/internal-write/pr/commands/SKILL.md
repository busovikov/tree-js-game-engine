---
name: write-pr-commands
description: >-
  Deprecated redirect: PR mutations via read-shuttle-gh-pr-commands (shuttle gh pr … --yes).
---
# Internal: GitHub pull request mutations (`write-pr-commands`)

> **Deprecated.** All PR **mutations** use [`read-shuttle-gh-pr-commands`](../../read/shuttle/gh/pr-commands/SKILL.md) — **`shuttle gh pr … --yes`** after **Proceed**. **Do not** embed raw `gh pr` bash fences.

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../read/safety/language-interaction-rules/SKILL.md) first.

## Platform note

PR ↔ issue linking uses body keywords or GitHub UI — see [`read-pr-description`](../../internal/read/pr/description/SKILL.md) §6.5–6.6.

## Operations (via shuttle)

| Operation | Shuttle |
| --- | --- |
| create / edit | `shuttle gh pr create` / `edit` |
| close | `shuttle gh pr close` |
| merge | `shuttle gh pr merge` |

Resolve **`--repo`**, **`--base`**, **`--head`** via [`read-repo-stream`](../../internal/read/repo/stream/SKILL.md).

## See also

- [`read-shuttle-gh-pr-read`](../../read/shuttle/gh/pr-read/SKILL.md)
- [`read-safety-structured-qa`](../../../internal/read/safety/structured-qa/SKILL.md)
