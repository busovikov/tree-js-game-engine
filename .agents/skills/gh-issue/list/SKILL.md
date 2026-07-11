---
name: gh-issue-list
description: >-
  GitHub issues (shuttle gh issue list, shuttle gh issue search): read-only list/search inventory.
---

# GitHub: list / search issues

Normative shapes: [`read-shuttle-gh-issue-read`](../../../internal/read/shuttle/gh/issue-read/SKILL.md). Legacy: [`read-issue-list`](../../../internal/read/issue/list/SKILL.md).

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../internal/read/safety/language-interaction-rules/SKILL.md) first. Use English by default for all assistant output, including AskQuestion prompts/options, unless the user explicitly requests another full-language response.

## Before batch

**Always run first** (sequential). Complete every applicable row in this table before execution steps in this skill. Skip a row only when its **When** column does not apply.

| Kind | Skill / library | When |
| --- | --- | --- |
| **Recommended** | [`@gh-issue-view`](../view/SKILL.md) | Filters depend on one known issue |
| **Tooling** | **`shuttle`** + authenticated **`gh`** | Repo scope per user intent |




## Required internal skills

Run after **Before batch** completes (names only; normative fences in linked libraries).

| Library | Role |
| --- | --- |
| `read-shuttle-gh-issue-read` | shuttle issue list/view/search |
| `read-repo-stream` | `--repo` targets |
| `read-issue-dedupe` | See linked library |

## Skip & suggestions

| Flag / param | Role |
| --- | --- |
| **`skip=false`** | Root invocation — offer next-step suggestions after **Verification** |
| **`skip=true`** | Nested public-skill child call — no next-step prompt |
| **`SKIP_QA_GH_ISSUES_LIST=true`** | Bypass routine write gates for this skill |
| **`SKIP_QA_WRITE=true`** | Shared write-flow Q&A bypass where allowed |
| **`SKIP_SUGGESTIONS=true`** | Suppress next-step suggestions even at root |

High-risk or destructive confirmations still require explicit user confirmation when bypass flags are set.

## Do

- Execute list/search from **`read-shuttle-gh-issue-read`** (`shuttle gh issue list|search`).
- Refine queries per that library’s **Caller refinement** section (state, label, limit, repo, search string).
- Report results in chat; **no** default confirmation for read-only listing. Mutations → **`@gh-issue`**, **`@gh-issue-close`**, **`@gh-issue-delete-closed`**.

## Do not

- Create, edit, or close issues in this skill.

## Verification

- [ ] List/search ran via **read-issue-list** shapes.
- [ ] Results summarized in chat; no mutations.

## Recommended next steps

When **`skip=false`** (root invocation) and **`SKIP_SUGGESTIONS`** is unset, delegate to **[`read-skill-suggestions`](../../../internal/read/skill-suggestions/SKILL.md)** for optional next-step choices (**summary** → **options** → AskQuestion). Nested public-skill calls use **`skip=true`**.


## See also

- [`@gh-issue`](../SKILL.md)
- [`read-issue-dedupe`](../../../internal/read/issue/dedupe/SKILL.md)
