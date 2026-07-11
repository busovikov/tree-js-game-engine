---
name: gh-issue-backlog
description: >-
  GitHub issue backlog (shuttle gh backlog tree): ordered epic/child tree; optional resequence write gate.
---

# GitHub: issue backlog

Show **sorted backlog tree** from sequence titles and epic labels. Optional **resequence** after **Proceed**.

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../internal/read/safety/language-interaction-rules/SKILL.md) first.

## Before batch

| Kind | Skill / library | When |
| --- | --- | --- |
| **Recommended** | [`@gh-issue-list`](../list/SKILL.md) | Compare tree vs open inventory |
| **Tooling** | **`shuttle`** + authenticated **`gh`** | Repo scope |

## Required internal skills

| Library | Role |
| --- | --- |
| `read-shuttle-gh` | Command map |
| `read-issue-sequence` | Title prefix contract |
| `read-safety-structured-qa` | Resequence write gate |

## Skip & suggestions

| Flag / param | Role |
| --- | --- |
| **`skip=false`** | Root invocation — offer next-step suggestions after **Verification** |
| **`skip=true`** | Nested public-skill child call — no next-step prompt |
| **`SKIP_QA_GH_ISSUES_BACKLOG=true`** | Bypass routine write gates for this skill |
| **`SKIP_QA_WRITE=true`** | Shared write-flow Q&A bypass where allowed |
| **`SKIP_SUGGESTIONS=true`** | Suppress next-step suggestions even at root |

High-risk or destructive confirmations still require explicit user confirmation when bypass flags are set.

## On invoke

1. Run **`shuttle gh --format json backlog tree`**
2. Render tree in chat (group by **`epic:*`**, sort by sequence)
3. Optional **Proceed — resequence** → write `plan.yaml` → **`shuttle gh backlog resequence --file plan.yaml --yes`**

## Do not

- Mutate titles without **Proceed**.
- Embed raw GitHub CLI fences — use **`read-shuttle-gh`**.

## Verification

- [ ] Tree rendered from shuttle JSON.
- [ ] Resequence only after confirmed gate.

## Recommended next steps

When **`skip=false`** (root invocation) and **`SKIP_SUGGESTIONS`** is unset, delegate to **[`read-skill-suggestions`](../../../internal/read/skill-suggestions/SKILL.md)** for optional next-step choices (**summary** → **options** → AskQuestion). Nested public-skill calls use **`skip=true`**.

## See also

- [`@gh-issue-next`](../next/SKILL.md)
- [`read-issue-nesting`](../../../internal/read/issue/nesting/SKILL.md)
