---
name: gh-issue-next
description: >-
  GitHub issues (shuttle gh backlog next): lowest open child by sequence; hand off to view and execute.
---

# GitHub: next issue

Pick the **lowest open child** by title sequence, confirm in chat, then hand off to **`@gh-issue-view`** and **`@gh-issue-execute`**.

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../internal/read/safety/language-interaction-rules/SKILL.md) first.

## Before batch

| Kind | Skill / library | When |
| --- | --- | --- |
| **Recommended** | [`@gh-issue-backlog`](../backlog/SKILL.md) | Full tree context |
| **Tooling** | **`shuttle`** + authenticated **`gh`** | Repo scope |

## Required internal skills

| Library | Role |
| --- | --- |
| `read-shuttle-gh` | `backlog next` command |
| `read-issue-sequence` | Sequence contract |

## Skip & suggestions

| Flag / param | Role |
| --- | --- |
| **`skip=false`** | Root invocation — offer next-step suggestions after **Verification** |
| **`skip=true`** | Nested public-skill child call — no next-step prompt |
| **`SKIP_QA_GH_ISSUES_NEXT=true`** | Bypass routine write gates for this skill |
| **`SKIP_QA_WRITE=true`** | Shared write-flow Q&A bypass where allowed |
| **`SKIP_SUGGESTIONS=true`** | Suppress next-step suggestions even at root |

High-risk or destructive confirmations still require explicit user confirmation when bypass flags are set.

## On invoke

1. **`shuttle gh --format json backlog next`**
2. Present **#n — title** in chat; confirm or pick alternate via **`@gh-issue-pick`**
3. **`@gh-issue-view`** on chosen issue
4. Optional **`@gh-issue-execute`** when user wants implementation

## Do not

- Skip view step when issue context is unknown.
- Embed raw GitHub CLI fences.

## Verification

- [ ] Next candidate from shuttle JSON (or explicit empty backlog message).
- [ ] Handoff to view/execute when user continues.

## Recommended next steps

When **`skip=false`** (root invocation) and **`SKIP_SUGGESTIONS`** is unset, delegate to **[`read-skill-suggestions`](../../../internal/read/skill-suggestions/SKILL.md)** for optional next-step choices (**summary** → **options** → AskQuestion). Nested public-skill calls use **`skip=true`**.

## See also

- [`@gh-issue-backlog`](../backlog/SKILL.md)
- [`@gh-issue-pick`](../pick/SKILL.md)
