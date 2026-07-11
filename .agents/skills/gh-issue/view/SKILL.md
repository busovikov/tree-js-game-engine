---
name: gh-issue-view
description: >-
  GitHub issues (shuttle gh issue view): read-only single issue URL, #n, or id; JSON via shuttle.
---

# GitHub: view issue

Normative fences / full matrix: [`read-issue-view`](../../../internal/read/issue/view/SKILL.md).

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../internal/read/safety/language-interaction-rules/SKILL.md) first. Use English by default for all assistant output, including AskQuestion prompts/options, unless the user explicitly requests another full-language response.

## Before batch

**Always run first** (sequential). Complete every applicable row in this table before execution steps in this skill. Skip a row only when its **When** column does not apply.

| Kind | Skill / library | When |
| --- | --- | --- |
| **Recommended** | [`@gh-issue-list`](../list/SKILL.md) | Target issue not known yet |
| **Tooling** | authenticated `gh` | Repo scope per user intent |




## Required internal skills

Run after **Before batch** completes (names only; normative fences in linked libraries).

| Library | Role |
| --- | --- |
| `read-issue-view` | See linked library |
| `read-repo-stream` | See linked library |

## Skip & suggestions

| Flag / param | Role |
| --- | --- |
| **`skip=false`** | Root invocation — offer next-step suggestions after **Verification** |
| **`skip=true`** | Nested public-skill child call — no next-step prompt |
| **`SKIP_QA_GH_ISSUES_VIEW=true`** | Bypass routine write gates for this skill |
| **`SKIP_QA_WRITE=true`** | Shared write-flow Q&A bypass where allowed |
| **`SKIP_SUGGESTIONS=true`** | Suppress next-step suggestions even at root |

High-risk or destructive confirmations still require explicit user confirmation when bypass flags are set.

## Do

- Resolve the issue reference from **chat**: full **`https://github.com/owner/repo/issues/N`**, **`#N`**, or numeric **`N`** (default repo context unless user names **`owner/repo`**).
- Open **[`read-issue-view`](../../../internal/read/issue/view/SKILL.md)** and execute the fenced blocks for that reference; include **`comments`** in the **`--json`** field list when the user needs the thread for review.
- Reply in chat with a **stable outline**: **title**, **state**, **labels**, **assignees**, **URL**, short **body** summary, optional **comment** highlights.
- When the user will implement next, paste **title** (one line) for branch naming in chat.

## Do not

- Edit/create, close, or delete via **`@gh-issue`**, **`@gh-issue-close`**, or **`@gh-issue-delete-closed`** (bulk) as appropriate.

## Verification

- [ ] Issue loaded via **read-issue-view**; key fields summarized.
- [ ] No mutations in this skill.

## Recommended next steps

When **`skip=false`** (root invocation) and **`SKIP_SUGGESTIONS`** is unset, delegate to **[`read-skill-suggestions`](../../../internal/read/skill-suggestions/SKILL.md)** for optional next-step choices (**summary** → **options** → AskQuestion). Nested public-skill calls use **`skip=true`**.


## See also

- [`@gh-issue-review`](../review/SKILL.md) — deep read + peer compare before **`@gh-issue`**
- [`read-issue-view`](../../../internal/read/issue/view/SKILL.md)
- [`ISSUE_CONTEXT.md`](../../../internal/read/issue/description/issue-context/SKILL.md) — optional local notes linked to an issue
