---
name: gh-issue
description: >-
  GitHub issues (shuttle gh issue create/edit router). Single shipping entrypoint for issue create-or-edit.
  Sharpen/Abort/Ship gate, dedupe, then shuttle gh mutations after Proceed.
---

# GitHub: issues (router)

**Orchestration:** [`read-issue-dedupe`](../../internal/read/issue/dedupe/SKILL.md) (**`@gh-issue orchestration order`** + **Multi-intent clustering**). Discovery handoff: [`read-repo-discovery`](../../internal/read/repo/discovery/SKILL.md).

Normative command shapes: [`read-shuttle-gh-issue-read`](../../internal/read/shuttle/gh/issue-read/SKILL.md), [`read-shuttle-gh-issue-commands`](../../internal/read/shuttle/gh/issue-commands/SKILL.md). Legacy: [`read-issue-list`](../../internal/read/issue/list/SKILL.md), [`write-issue-commands`](../../internal/write/issue/commands/SKILL.md).

**Public.** Create-vs-edit router; no separate public create/edit path.

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../internal/read/safety/language-interaction-rules/SKILL.md) first. Use English by default for all assistant output, including AskQuestion prompts/options, unless the user explicitly requests another full-language response.

## Before batch

**Always run first** (sequential). Complete every applicable row in this table before execution steps in this skill. Skip a row only when its **When** column does not apply.

| Kind | Skill / library | When |
| --- | --- | --- |
| **Required** | [`@gh-issue-list`](list/SKILL.md) | Inventory after **Ship** |
| **Recommended** | [`@gh-issue-view`](view/SKILL.md) | Anchor to one issue |
| **Tooling** | **`shuttle`** + authenticated **`gh`** | Repo scope |

## Required internal skills

Run after **Before batch** completes (names only; normative fences in linked libraries).

**Do not** run dedupe until **Ship** (unless user overrides)

| Library | Role |
| --- | --- |
| `read-issue-spec` | See linked library |
| `read-issue-preflight-qa` | See linked library |
| `read-safety-structured-qa` | See linked library |
| `read-issue-dedupe` | See linked library |
| `read-issue-description` | See linked library |
| `read-issue-description-issue-body-skeleton` | See linked library |
| `read-issue-labels` | See linked library |
| `read-issue-labels-label-decorate` | See linked library |
| `read-shuttle-gh-issue-read` | Issue inventory |
| `read-shuttle-gh-issue-commands` | Issue mutations |
| `read-issue-nesting` | Epic + child batch shape |
| `read-issue-sequence` | Sequence title prefixes |
| `read-issue-split` | Split proposals |
| `read-issue-consolidate` | Merge proposals |

## Skip & suggestions

| Flag / param | Role |
| --- | --- |
| **`skip=false`** | Root invocation — offer next-step suggestions after **Verification** |
| **`skip=true`** | Nested public-skill child call — no next-step prompt |
| **`SKIP_QA_GH_ISSUES=true`** | Bypass routine write gates for this skill |
| **`SKIP_QA_WRITE=true`** | Shared write-flow Q&A bypass where allowed |
| **`SKIP_SUGGESTIONS=true`** | Suppress next-step suggestions even at root |

High-risk or destructive confirmations still require explicit user confirmation when bypass flags are set.

## On invoke

1. **`read-issue-spec`** + **`read-issue-preflight-qa`** → **write gate** kind **ship** until **Ship** or **Abort**.
   - When input came from chat/planning discovery, treat the narrative + candidate table as preflight context; still run **Ship** before dedupe unless the user explicitly overrides.
2. Branch per **`read-issue-dedupe`**: **single theme** (list → dedupe → description → labels) or **multi-intent** (**Multi-intent clustering** section).
   - **Multi-intent from discovery:** partition the long narrative into themes, dedupe each, then propose **one vs many** creates/edits in one **Proceed — batch** gate.
   - **Epic + children:** when themes share one roadmap, apply **`read-issue-nesting`** — parent epic + child issues, shared **`epic:<slug>`** labels, batch create order (parent → children → edit parent checklist).
3. **Write gate** — kind **disambiguate_issue** / **triage** before mutation; summary includes edit **#n**, create, batch table, or **Abort**; labels unless declined.
4. **`read-shuttle-gh-issue-commands`** — agreed create/edit order (batch or single); append **`--yes`** after **Proceed**.

## Do

- Preflight before dedupe; overlap evidence before create.
- Body files under **`.cursor/gh/issue/`** when batching drafts.
- Epic flows: **`epic:<slug>`** + **`issue-type:epic`** / **`issue-type:child`** per **`read-issue-nesting`**.
- Include an **Execution** section in each created/edited body: next steps (for example **`@gh-issue-view`** → **`@gh-issue-execute`**, or **`@gh-pr-review`** → **`@gh-pr`**).

## Do not

- Skip preflight or dedupe (per theme on multi-intent).
- Run raw **`gh issue`** fences — use **`read-shuttle-gh-issue-commands`** only.

## Verification

- [ ] **Ship** or **Abort** recorded before list/dedupe (unless explicit override).
- [ ] Dedupe verdict(s) shown; user chose edit/create/batch/defer.
- [ ] Mutations ran only after **Proceed** via **`read-shuttle-gh-issue-commands`**.
- [ ] Created/edited bodies include **Execution** pointers where applicable.

## Recommended next steps

When **`skip=false`** (root invocation) and **`SKIP_SUGGESTIONS`** is unset, delegate to **[`read-skill-suggestions`](../../internal/read/skill-suggestions/SKILL.md)** for optional next-step choices (**summary** → **options** → AskQuestion). Nested public-skill calls use **`skip=true`**.


## See also

- [`@gh-issue-execute`](execute/SKILL.md) · [`@gh-issue-review`](review/SKILL.md) · [`@gh-issue-list`](list/SKILL.md) · [`@gh-issue-backlog`](backlog/SKILL.md) · [`@gh-issue-next`](next/SKILL.md) · [`@gh-issue-labels`](labels/SKILL.md) · [`@gh-pr`](../pr/SKILL.md)
- [`read-issue-dedupe`](../../internal/read/issue/dedupe/SKILL.md) · [`read-issue-description`](../../internal/read/issue/description/SKILL.md)
