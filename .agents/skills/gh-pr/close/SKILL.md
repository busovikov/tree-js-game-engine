---
name: gh-pr-close
description: >-
  Pull requests (shuttle gh pr close): write gate + Proceed before PR close. Does not merge.
---

# GitHub: close pull request

Normative fences / full matrix: [`read-shuttle-gh-pr-commands`](../../../internal/read/shuttle/gh/pr-commands/SKILL.md).

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../internal/read/safety/language-interaction-rules/SKILL.md) first. Use English by default for all assistant output, including AskQuestion prompts/options, unless the user explicitly requests another full-language response.

## Before batch

**Always run first** (sequential). Complete every applicable row in this table before execution steps in this skill. Skip a row only when its **When** column does not apply.

| Kind | Skill / library | When |
| --- | --- | --- |
| **Recommended** | [`@gh-pr-view`](../view/SKILL.md) | Confirm target PR and rationale |
| **Recommended** | [`@gh-pr-list`](../list/SKILL.md) | User gave filters, not a PR number |
| **Tooling** | **`shuttle`** + authenticated **`gh`** | Repo scope per user intent |

## Required internal skills

Run after **Before batch** completes (names only; normative fences in linked libraries).

| Library | Role |
| --- | --- |
| `read-shuttle-gh-pr-commands` | Close mutation shapes |
| `read-safety-structured-qa` | See linked library |
| `read-safety-skill-safety` | See linked library |

## Skip & suggestions

| Flag / param | Role |
| --- | --- |
| **`skip=false`** | Root invocation — offer next-step suggestions after **Verification** |
| **`skip=true`** | Nested public-skill child call — no next-step prompt |
| **`SKIP_QA_GH_PR_CLOSE=true`** | Bypass routine write gates for this skill |
| **`SKIP_QA_WRITE=true`** | Shared write-flow Q&A bypass where allowed |
| **`SKIP_SUGGESTIONS=true`** | Suppress next-step suggestions even at root |

High-risk or destructive confirmations still require explicit user confirmation when bypass flags are set.

## Do

- **Write gate** + **Proceed** before **Close PR** in **[`read-shuttle-gh-pr-commands`](../../../internal/read/shuttle/gh/pr-commands/SKILL.md)** (`shuttle gh pr close … --yes`).
- Confirm **PR number**, **repo** (`--repo` when upstream), and that closing matches user intent (superseded branch, wrong target, duplicate PR).
- Prefer **`@gh-pr-list`** / **`@gh-pr-view`** first when the PR number is unknown.

## Do not

- Close when the user meant to **merge**, **draft**, or **update** title/body—redirect to **`@gh-pr`** or the web UI.

## Verification

- [ ] PR number/repo and close intent confirmed before **Proceed**.
- [ ] Close ran via **read-shuttle-gh-pr-commands** (or user aborted).

## Recommended next steps

When **`skip=false`** (root invocation) and **`SKIP_SUGGESTIONS`** is unset, delegate to **[`read-skill-suggestions`](../../../internal/read/skill-suggestions/SKILL.md)** for optional next-step choices (**summary** → **options** → AskQuestion). Nested public-skill calls use **`skip=true`**.

## See also

- [`@gh-pr`](../SKILL.md)
