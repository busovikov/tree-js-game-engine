---
name: gh-pr-review
description: >-
  Pull request review (AI): load PR via gh, compare against linked issues, summarize acceptance gaps,
  and recommend merge or follow-up. Read-only on GitHub.
---

# GitHub: review pull request

**Public.** **Read-only on GitHub.** Reviews **pull requests** and linked issue acceptance.

Normative PR load shapes: [`read-pr-list`](../../../internal/read/pr/list/SKILL.md).

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../internal/read/safety/language-interaction-rules/SKILL.md) first.

## Before batch

| Kind | Skill / library | When |
| --- | --- | --- |
| **Recommended** | [`@gh-pr-view`](../view/SKILL.md) | Lightweight metadata first |
| **Recommended** | [`@gh-pr-list`](../list/SKILL.md) | PR not yet identified |
| **Recommended** | [`@gh-issue-view`](../../issue/view/SKILL.md) | Linked issue acceptance review |
| **Tooling** | authenticated `gh` | Repo scope per user intent |

## Required internal skills

| Library | Role |
| --- | --- |
| `read-pr-list` | PR view / diff shapes |
| `read-repo-stream` | Fork / `--repo` target |
| `read-diff-summary` | Delta narrative when needed |
| `read-safety-skill-safety` | Confirm before mutations |

## Skip & suggestions

| Flag / param | Role |
| --- | --- |
| **`skip=false`** | Root invocation — offer next-step suggestions after **Verification** |
| **`skip=true`** | Nested public-skill child call — no next-step prompt |
| **`SKIP_QA_GH_PR_REVIEW=true`** | Bypass routine write gates |
| **`SKIP_QA_WRITE=true`** | Shared write-flow Q&A bypass where allowed |
| **`SKIP_SUGGESTIONS=true`** | Suppress next-step suggestions |

## Do

1. Load the target PR via **`read-pr-list`** view + optional diff stat.
2. When linked issues exist, run **`@gh-issue-view`** and compare acceptance criteria.
3. Deliver a **PR review** in chat:
   - **Summary** — title, state, scope (files/stat)
   - **Issue acceptance** — issue bullets vs PR delivery
   - **Code/doc gaps** — tests, docs, edge cases, regressions
   - **Verdict** — merge-ready / needs work / needs issue update
   - **Next invoke** — **`@gh-pr`**, **`@gh-issue`**, **`@gh-issue-backlog`**, or merge in GitHub UI when verdict is merge-ready

## Do not

- Mutate GitHub from this skill.
- Replace **`@gh-pr-view`** for metadata-only lookups.

## Verification

- [ ] PR loaded; key fields summarized.
- [ ] Acceptance vs gaps documented when issue context exists.
- [ ] No GitHub mutations in this skill.

## Recommended next steps

When **`skip=false`** (root invocation) and **`SKIP_SUGGESTIONS`** is unset, delegate to [`read-skill-suggestions`](../../../internal/read/skill-suggestions/SKILL.md). Nested public-skill calls use **`skip=true`**.

## See also

- [`@gh-pr-view`](../view/SKILL.md)
- [`@gh-pr`](../SKILL.md)
