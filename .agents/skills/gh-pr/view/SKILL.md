---
name: gh-pr-view
description: >-
  Pull requests (shuttle gh pr view, shuttle gh pr diff): read-only PR view and diff stat via shuttle.
---

# GitHub: view pull request

Normative fences / full matrix: [`read-pr-list`](../../../internal/read/pr/list/SKILL.md).

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../internal/read/safety/language-interaction-rules/SKILL.md) first. Use English by default for all assistant output, including AskQuestion prompts/options, unless the user explicitly requests another full-language response.

## Before batch

**Always run first** (sequential). Complete every applicable row in this table before execution steps in this skill. Skip a row only when its **When** column does not apply.

| Kind | Skill / library | When |
| --- | --- | --- |
| **Recommended** | [`@gh-pr-list`](../list/SKILL.md) | Target PR not yet identified |
| **Recommended** | [`@gh-issue-view`](../../issue/view/SKILL.md) | Results review against linked issue |
| **Tooling** | authenticated `gh` | Repo scope per user intent |




## Required internal skills

Run after **Before batch** completes (names only; normative fences in linked libraries).

| Library | Role |
| --- | --- |
| `read-pr-list` | See linked library |
| `read-repo-stream` | See linked library |
| `read-safety-skill-safety` | See linked library |

## Skip & suggestions

| Flag / param | Role |
| --- | --- |
| **`skip=false`** | Root invocation — offer next-step suggestions after **Verification** |
| **`skip=true`** | Nested public-skill child call — no next-step prompt |
| **`SKIP_QA_GH_PR_VIEW=true`** | Bypass routine write gates for this skill |
| **`SKIP_QA_WRITE=true`** | Shared write-flow Q&A bypass where allowed |
| **`SKIP_SUGGESTIONS=true`** | Suppress next-step suggestions even at root |

High-risk or destructive confirmations still require explicit user confirmation when bypass flags are set.

## Do

- Execute **View** (and optional diff-stat) from **[`read-pr-list`](../../../internal/read/pr/list/SKILL.md)** — run **only** the fenced blocks defined there.
- When **`--repo`** is required (fork **`$UPSTREAM`**), align with **[`read-repo-stream`](../../../internal/read/repo/stream/SKILL.md)**.
- **Structured confirm** before any follow-on **mutation** (**`@gh-pr-close`**, **`@gh-pr`**, …) per **[`read-safety-skill-safety`](../../../internal/read/safety/skill-safety/SKILL.md)**.

### Results review (when user asks)

After loading the PR, optionally run **`@gh-issue-view`** on linked issue(s). Deliver a short **results review** in chat:

1. **PR summary** — title, state, scope (files/stat)
2. **Issue acceptance** — bullets from issue body vs what the PR appears to deliver
3. **Gaps** — missing tests/docs, edge cases, follow-up issues
4. **Verdict** — merge-ready / needs work / needs issue update
5. **Next invoke** — **`@gh-pr`**, **`@gh-pr-review`**, **`@gh-issue`**, **`@gh-issue-backlog`**, or merge in GitHub UI when verdict is merge-ready

## Do not

- Mutate GitHub state from this skill.

## Verification

- [ ] PR loaded via **read-pr-list** view shapes; key fields summarized.
- [ ] When results review was requested, acceptance vs gaps documented.
- [ ] No mutations in this skill.

## Recommended next steps

When **`skip=false`** (root invocation) and **`SKIP_SUGGESTIONS`** is unset, delegate to **[`read-skill-suggestions`](../../../internal/read/skill-suggestions/SKILL.md)** for optional next-step choices (**summary** → **options** → AskQuestion). Nested public-skill calls use **`skip=true`**.


## See also

- [`@gh-pr-list`](../list/SKILL.md)
- [`@gh-pr`](../SKILL.md)
- [`@gh-pr-review`](../review/SKILL.md)
- [`@gh-issue-backlog`](../../issue/backlog/SKILL.md) — backlog follow-ups after review
