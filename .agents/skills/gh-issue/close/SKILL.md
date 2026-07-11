---
name: gh-issue-close
description: >-
  GitHub issues (shuttle gh issue close). Write gate + Proceed before issue close mutation.
---

# GitHub: close issue

Normative fences / full matrix: [`read-shuttle-gh-issue-commands`](../../../internal/read/shuttle/gh/issue-commands/SKILL.md).

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../internal/read/safety/language-interaction-rules/SKILL.md) first. Use English by default for all assistant output, including AskQuestion prompts/options, unless the user explicitly requests another full-language response.

## Before batch

**Always run first** (sequential). Complete every applicable row in this table before execution steps in this skill. Skip a row only when its **When** column does not apply.

| Kind | Skill / library | When |
| --- | --- | --- |
| **Recommended** | [`@gh-issue-view`](../view/SKILL.md) | Confirm target issue before close |
| **Recommended** | [`@gh-issue-review`](../review/SKILL.md) | Duplicate or reshape-driven closure |
| **Tooling** | **`shuttle`** + authenticated **`gh`** | Repo scope per user intent |




## Required internal skills

Run after **Before batch** completes (names only; normative fences in linked libraries).

| Library | Role |
| --- | --- |
| `read-shuttle-gh-issue-commands` | Close mutation shapes |
| `read-safety-structured-qa` | See linked library |
| `read-safety-skill-safety` | See linked library |

## Skip & suggestions

| Flag / param | Role |
| --- | --- |
| **`skip=false`** | Root invocation — offer next-step suggestions after **Verification** |
| **`skip=true`** | Nested public-skill child call — no next-step prompt |
| **`SKIP_QA_GH_ISSUES_CLOSE=true`** | Bypass routine write gates for this skill |
| **`SKIP_QA_WRITE=true`** | Shared write-flow Q&A bypass where allowed |
| **`SKIP_SUGGESTIONS=true`** | Suppress next-step suggestions even at root |

High-risk or destructive confirmations still require explicit user confirmation when bypass flags are set.

## Do

- **Write gate** + **Proceed** before **Close issue** in **[`read-shuttle-gh-issue-commands`](../../../internal/read/shuttle/gh/issue-commands/SKILL.md)** (`shuttle gh issue close … --yes`).
- If closing as **duplicate**, follow **[`CLOSE_AS_DUPLICATE.md`](../../../internal/write/issue/commands/close/as/duplicate/SKILL.md)** (comment + close order).

## Do not

- Close without confirmation.

## Verification

- [ ] Target issue and close intent confirmed before **Proceed**.
- [ ] Close ran via **`read-shuttle-gh-issue-commands`** (or user aborted).

## Recommended next steps

When **`skip=false`** (root invocation) and **`SKIP_SUGGESTIONS`** is unset, delegate to **[`read-skill-suggestions`](../../../internal/read/skill-suggestions/SKILL.md)** for optional next-step choices (**summary** → **options** → AskQuestion). Nested public-skill calls use **`skip=true`**.


## See also

- [`@gh-issue`](../SKILL.md)
