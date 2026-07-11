---
name: gh-issue-delete-closed
description: >-
  GitHub issues (shuttle gh issue delete on closed). Preview, write gate + Proceed, then delete per id.
  Mutates GitHub.
---

# GitHub: delete closed issues (bulk)

Normative fences / full matrix: [`read-shuttle-gh-issue-read`](../../../../internal/read/shuttle/gh/issue-read/SKILL.md), [`read-shuttle-gh-issue-commands`](../../../../internal/read/shuttle/gh/issue-commands/SKILL.md).

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../../internal/read/safety/language-interaction-rules/SKILL.md) first. Use English by default for all assistant output, including AskQuestion prompts/options, unless the user explicitly requests another full-language response.

## Before batch

**Always run first** (sequential). Complete every applicable row in this table before execution steps in this skill. Skip a row only when its **When** column does not apply.

| Kind | Skill / library | When |
| --- | --- | --- |
| **Recommended** | [`@gh-issue-list`](../../list/SKILL.md) | Preview closed inventory |
| **Recommended** | [`@gh-issue-view`](../../view/SKILL.md) | Validate a candidate before delete |
| **Tooling** | **`shuttle`** + authenticated **`gh`** | Delete permission on target repo |

## Required internal skills

Run after **Before batch** completes (names only; normative fences in linked libraries).

| Library | Role |
| --- | --- |
| `read-shuttle-gh-issue-read` | Closed issue inventory |
| `read-shuttle-gh-issue-commands` | Delete mutation shapes |
| `read-safety-skill-safety` | See linked library |
| `read-safety-structured-qa` | See linked library |

## Skip & suggestions

| Flag / param | Role |
| --- | --- |
| **`skip=false`** | Root invocation — offer next-step suggestions after **Verification** |
| **`skip=true`** | Nested public-skill child call — no next-step prompt |
| **`SKIP_QA_GH_ISSUES_DELETE_CLOSED=true`** | Bypass routine write gates for this skill |
| **`SKIP_QA_WRITE=true`** | Shared write-flow Q&A bypass where allowed |
| **`SKIP_SUGGESTIONS=true`** | Suppress next-step suggestions even at root |

High-risk or destructive confirmations still require explicit user confirmation when bypass flags are set.

## Do

1. **Goal** - Why closed issues should be removed from GitHub (housekeeping, compliance, etc.).
2. **Inventory (read-only)** - Run closed list from **[`read-shuttle-gh-issue-read`](../../../../internal/read/shuttle/gh/issue-read/SKILL.md)**. Show **count** and a **preview** (ids + titles). Warn: **irreversible** for viewers without trash restore; requires **permissions** to delete issues.
3. **Write gate** — **Proceed** / **Cancel** before **any** delete mutation.
4. **On Proceed only** - For each id to delete, execute **Delete one closed issue** in **`read-shuttle-gh-issue-commands`**. Stop on first CLI error and report.

## Do not

- Delete issues **before** user **Proceed**.
- Delete **open** issues from this skill - scope is **closed** cleanup only unless the user explicitly re-scopes in chat (then re-run **Goal** + preview).

## Verification

- [ ] Preview list shown; **Proceed** captured before deletes.
- [ ] Only closed issues in scope were deleted (or user aborted).

## Recommended next steps

When **`skip=false`** (root invocation) and **`SKIP_SUGGESTIONS`** is unset, delegate to **[`read-skill-suggestions`](../../../../internal/read/skill-suggestions/SKILL.md)** for optional next-step choices (**summary** → **options** → AskQuestion). Nested public-skill calls use **`skip=true`**.

## See also

- [`read-shuttle-gh-issue-read`](../../../../internal/read/shuttle/gh/issue-read/SKILL.md)
- [`read-shuttle-gh-issue-commands`](../../../../internal/read/shuttle/gh/issue-commands/SKILL.md)
- [`read-safety-skill-safety`](../../../../internal/read/safety/skill-safety/SKILL.md)
- [`read-safety-structured-qa`](../../../../internal/read/safety/structured-qa/SKILL.md)
