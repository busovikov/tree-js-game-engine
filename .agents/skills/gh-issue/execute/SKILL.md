---
name: gh-issue-execute
description: >-
  GitHub issues execution orchestration: run an approved checkpoint plan from chat with verification evidence,
  then hand off to @gh-pr. Use write gate + Proceed for risky or destructive operations.
---

# GitHub issues: execute

Execute an approved checkpoint plan from **chat/planning** (issue body + user-confirmed checkpoints).

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../internal/read/safety/language-interaction-rules/SKILL.md) first.

## Before batch

| Kind | Skill / library | When |
| --- | --- | --- |
| **Required** | [`@gh-issue-view`](../view/SKILL.md) | Target issue context |
| **Recommended** | [`@gh-pr-review`](../../pr/review/SKILL.md) | PR acceptance review before handoff |
| **Tooling** | **`shuttle`** + authenticated **`gh`** | Repo scope |

## Required internal skills

| Library | Role |
| --- | --- |
| `read-workflow-workflows` | Checkpoint patterns |
| `read-safety-structured-qa` | Write gate |
| `read-safety-skill-safety` | Risky ops |
| `read-dependencies-discover` | Repo verification commands |

## Skip & suggestions

| Flag / param | Role |
| --- | --- |
| **`skip=false`** | Root invocation — offer next-step suggestions after **Verification** |
| **`skip=true`** | Nested public-skill child call — no next-step prompt |
| **`SKIP_QA_GH_ISSUES_EXECUTE=true`** | Bypass routine write gates for this skill |
| **`SKIP_QA_WRITE=true`** | Shared write-flow Q&A bypass where allowed |
| **`SKIP_SUGGESTIONS=true`** | Suppress next-step suggestions even at root |

High-risk or destructive confirmations still require explicit user confirmation when bypass flags are set.

## Do

1. Set a **Goal** line and confirm checkpoint order (from issue body or chat).
2. Execute checkpoints with verification evidence per checkpoint.
3. Use **write gate** before risky operations.
4. Optional **`@gh-pr-review`** before **`@gh-pr`** when the user wants review.
5. Handoff to **`@gh-pr`** when complete (user ensures branch is published separately).

## Do not

- Start without confirmed checkpoints and **`@gh-issue-view`** context.
- Replace **`@gh-pr`** with ad-hoc PR flow.

## Verification

- [ ] Checkpoint sequence followed with evidence.
- [ ] Next invoke is **`@gh-pr`** or a named blocker.

## Recommended next steps

When **`skip=false`** (root invocation) and **`SKIP_SUGGESTIONS`** is unset, delegate to **[`read-skill-suggestions`](../../../internal/read/skill-suggestions/SKILL.md)** for optional next-step choices (**summary** → **options** → AskQuestion). Nested public-skill calls use **`skip=true`**.

## See also

- [`@gh-issue-next`](../next/SKILL.md)
- [`@gh-issue`](../SKILL.md)
