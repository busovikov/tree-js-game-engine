---
name: gh-issue-pick
description: >-
  GitHub issues (shuttle gh issue list/view): list open issues with filters, then structured AskQuestion so the user picks the next task; read-only until user
  choice. Suggest @gh-issue-view and @gh-issue-execute after selection.
---

# GitHub: pick next issue

Normative fences / full matrix: [`read-shuttle-gh-issue-read`](../../../internal/read/shuttle/gh/issue-read/SKILL.md).

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../internal/read/safety/language-interaction-rules/SKILL.md) first. Use English by default for all assistant output, including AskQuestion prompts/options, unless the user explicitly requests another full-language response.

## Before batch

**Always run first** (sequential). Complete every applicable row in this table before execution steps in this skill. Skip a row only when its **When** column does not apply.

| Kind | Skill / library | When |
| --- | --- | --- |
| **Recommended** | [`@gh-issue-list`](../list/SKILL.md) | Filtered candidate issues already listed |
| **Recommended** | [`@gh-issue-view`](../view/SKILL.md) | Expand one issue before choosing |
| **Tooling** | authenticated `gh` | Repo scope per user intent |




## Required internal skills

Run after **Before batch** completes (names only; normative fences in linked libraries).

| Library | Role |
| --- | --- |
| `read-shuttle-gh-issue-read` | Issue list/search |
| `read-safety-structured-qa` | See linked library |

## Skip & suggestions

| Flag / param | Role |
| --- | --- |
| **`skip=false`** | Root invocation — offer next-step suggestions after **Verification** |
| **`skip=true`** | Nested public-skill child call — no next-step prompt |
| **`SKIP_QA_GH_ISSUES_PICK=true`** | Bypass routine write gates for this skill |
| **`SKIP_QA_WRITE=true`** | Shared write-flow Q&A bypass where allowed |
| **`SKIP_SUGGESTIONS=true`** | Suppress next-step suggestions even at root |

High-risk or destructive confirmations still require explicit user confirmation when bypass flags are set.

## Do

1. **Goal** — One line: what “next” means (e.g. highest priority **`bug`**, unblocked **`help wanted`**, etc.).
2. **Inventory (read-only)** — Run list/search from **[`read-shuttle-gh-issue-read`](../../../internal/read/shuttle/gh/issue-read/SKILL.md)** with user-supplied **`--label`**, **`--assignee`**, **`--milestone`**, or search text. Cap **`--limit`** (e.g. **30**).
3. **Present candidates** — Short table in chat **above** the gate: **#n — title — labels** for the top set (link **#n** when URL known). No issue body text.
4. **Choice gate** — **`read-safety-structured-qa` §0**, kind **disambiguate_issue** (read-only; no GitHub mutations). **Proceed** → **`@gh-issue-view`** on selected **#n**.
5. **After selection** — Emit solve strategy in chat; suggest **`@gh-issue-execute`** when ready. If **Refine filters**, return to step **2**.

### Solve strategy outline (chat)

After **`@gh-issue-view`**, include:

1. **Goal** — one line from the issue
2. **Approach** — 3–6 ordered steps
3. **Touch areas** — paths/skills likely to change
4. **Verification** — how to prove done (tests, `@gh-pr-review`, manual checks)
5. **Next invoke** — **`@gh-issue-execute`** (default) or **`@gh-issue-backlog`** if scope still unclear

## Do not

- Create, edit, close, or delete issues from this skill.

## Verification

- [ ] Inventory and choice gate captured.
- [ ] Selected issue handed to **@gh-issue-view** with solve strategy (or filters refined); no mutations.

## Recommended next steps

When **`skip=false`** (root invocation) and **`SKIP_SUGGESTIONS`** is unset, delegate to **[`read-skill-suggestions`](../../../internal/read/skill-suggestions/SKILL.md)** for optional next-step choices (**summary** → **options** → AskQuestion). Nested public-skill calls use **`skip=true`**.


## See also

- [`read-shuttle-gh-issue-read`](../../../internal/read/shuttle/gh/issue-read/SKILL.md)
- [`@gh-issue-list`](../list/SKILL.md)
- [`@gh-issue-view`](../view/SKILL.md)
- [`read-safety-structured-qa`](../../../internal/read/safety/structured-qa/SKILL.md)
