---
name: gh-issue-review
description: >-
  GitHub issues (shuttle gh issue view/list): read-only — discover repo context, view target issue(s), list/search open issues for overlaps, compare like dedupe
  but for reshape; propose clearer title/body and AskQuestion on gaps. No GitHub writes—@gh-issue applies changes after
  confirm. Complements PR review (`@gh-pr-review`) with issue clarity.
---

# GitHub: review / reshape issues (read-only)

**Report + order:** [`read-issue-description-review-report`](../../../internal/read/issue/description/review-report/SKILL.md).

Normative fences / full matrix: [`read-shuttle-gh-issue-read`](../../../internal/read/shuttle/gh/issue-read/SKILL.md).

**Public.** **Goal:** Understand codebase + issue + peers; deliver overlap map, gaps, optional reshape draft for **`@gh-issue`**. **Not** **`@gh-pr-review`** unless the user asks.

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../internal/read/safety/language-interaction-rules/SKILL.md) first. Use English by default for all assistant output, including AskQuestion prompts/options, unless the user explicitly requests another full-language response.

## Before batch

**Always run first** (sequential). Complete every applicable row in this table before execution steps in this skill. Skip a row only when its **When** column does not apply.

| Kind | Skill / library | When |
| --- | --- | --- |
| **Recommended** | [`@gh-issue-view`](../view/SKILL.md) | Lock target issue |
| **Recommended** | [`@gh-issue-list`](../list/SKILL.md) | Overlap context |
| **Tooling** | authenticated `gh` | Repo scope |




## Required internal skills

Run after **Before batch** completes (names only; normative fences in linked libraries).

| Library | Role |
| --- | --- |
| `read-dependencies-discover` | See linked library |
| `read-repo-project-structure-eval` | See linked library |
| `read-shuttle-gh-issue-read` | Issue list/view/search |
| `read-issue-dedupe` | See linked library |
| `read-issue-spec` | See linked library |
| `read-safety-structured-qa` | See linked library |

## Skip & suggestions

| Flag / param | Role |
| --- | --- |
| **`skip=false`** | Root invocation — offer next-step suggestions after **Verification** |
| **`skip=true`** | Nested public-skill child call — no next-step prompt |
| **`SKIP_QA_GH_ISSUES_REVIEW=true`** | Bypass routine write gates for this skill |
| **`SKIP_QA_WRITE=true`** | Shared write-flow Q&A bypass where allowed |
| **`SKIP_SUGGESTIONS=true`** | Suppress next-step suggestions even at root |

High-risk or destructive confirmations still require explicit user confirmation when bypass flags are set.

## On invoke

Run **`read-issue-description-review-report`** fixed order; stop on missing **`gh`** auth or unknown repo.

## Do

- Follow the **report scaffold** and **fixed order** in **`read-issue-description-review-report`**.
- Hand off reshapes to **`@gh-issue`** after user **Proceed**.

## Do not

- Mutate GitHub from this skill.
- Skip peer list/search when overlaps matter.

## Verification

- [ ] Target issue viewed; peer list/search ran at least once.
- [ ] Written report delivered; no GitHub mutations in this skill.

## Recommended next steps

When **`skip=false`** (root invocation) and **`SKIP_SUGGESTIONS`** is unset, delegate to **[`read-skill-suggestions`](../../../internal/read/skill-suggestions/SKILL.md)** for optional next-step choices (**summary** → **options** → AskQuestion). Nested public-skill calls use **`skip=true`**.


## See also

- [`@gh-issue-view`](../view/SKILL.md) · [`@gh-issue-list`](../list/SKILL.md) · [`@gh-issue`](../SKILL.md)
- [`@gh-pr-review`](../../pr/review/SKILL.md) — PR acceptance review (separate)
- [`read-issue-dedupe`](../../../internal/read/issue/dedupe/SKILL.md)
