---
name: gh-pr-list
description: >-
  Pull requests (shuttle gh pr list): read-only pull request list inventory via shuttle gh.
---

# GitHub: list pull requests

Normative fences / full matrix: [`read-pr-list`](../../../internal/read/pr/list/SKILL.md).

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../internal/read/safety/language-interaction-rules/SKILL.md) first. Use English by default for all assistant output, including AskQuestion prompts/options, unless the user explicitly requests another full-language response.

## Before batch

**Always run first** (sequential). Complete every applicable row in this table before execution steps in this skill. Skip a row only when its **When** column does not apply.

| Kind | Skill / library | When |
| --- | --- | --- |
| **Recommended** | [`@gh-pr-view`](../view/SKILL.md) | One PR needs detail before next step |
| **Tooling** | authenticated `gh` | Repo scope per user intent |




## Required internal skills

Run after **Before batch** completes (names only; normative fences in linked libraries).

| Library | Role |
| --- | --- |
| `read-pr-list` | See linked library |
| `read-safety-skill-safety` | See linked library |

## Skip & suggestions

| Flag / param | Role |
| --- | --- |
| **`skip=false`** | Root invocation — offer next-step suggestions after **Verification** |
| **`skip=true`** | Nested public-skill child call — no next-step prompt |
| **`SKIP_QA_GH_PR_LIST=true`** | Bypass routine write gates for this skill |
| **`SKIP_QA_WRITE=true`** | Shared write-flow Q&A bypass where allowed |
| **`SKIP_SUGGESTIONS=true`** | Suppress next-step suggestions even at root |

High-risk or destructive confirmations still require explicit user confirmation when bypass flags are set.

## Do

- Execute **List** (and related inventory) from **[`read-pr-list`](../../../internal/read/pr/list/SKILL.md)** — run **only** the fenced blocks defined there.
- **Refine queries** per user intent: add **`--state`** (e.g. **`closed`** for merged+closed), **`--head`**, **`--base`**, **`--limit`**, **`--json`**, **`--repo`**, as in that internal library’s **Caller refinement** section. Optional context: **[`LIST_VIEW_HUB.md`](../../../internal/read/pr/list/list-view-hub/SKILL.md)** (hub, no duplicate fences).
- Report results in chat; **no** default confirmation for read-only listing. **Structured confirm** is required before any PR mutation (**`@gh-pr-close`**, **`@gh-pr`**) per **`read-safety-skill-safety`**.

## Do not

- Create, edit, merge, or close PRs in this skill.

## Verification

- [ ] List ran via **read-pr-list** shapes.
- [ ] Results summarized in chat; no mutations.

## Recommended next steps

When **`skip=false`** (root invocation) and **`SKIP_SUGGESTIONS`** is unset, delegate to **[`read-skill-suggestions`](../../../internal/read/skill-suggestions/SKILL.md)** for optional next-step choices (**summary** → **options** → AskQuestion). Nested public-skill calls use **`skip=true`**.


## See also

- [`@gh-pr-view`](../view/SKILL.md)
- [`@gh-pr`](../SKILL.md)
