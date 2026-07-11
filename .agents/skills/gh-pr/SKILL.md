---
name: gh-pr
description: >-
  Pull requests (shuttle gh pr create/edit). PR lookup, description work, then shuttle gh after Proceed.
---

**Orchestration:** [`read-pr-content-pr-orchestration`](../../internal/read/pr/content/pr-orchestration/SKILL.md).

# PR

Normative fences / full matrix: [`read-pr-description`](../../internal/read/pr/description/SKILL.md), [`read-shuttle-gh-pr-read`](../../internal/read/shuttle/gh/pr-read/SKILL.md), [`read-shuttle-gh-pr-commands`](../../internal/read/shuttle/gh/pr-commands/SKILL.md). Legacy: [`write-pr-commands`](../../internal/write/pr/commands/SKILL.md).

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../internal/read/safety/language-interaction-rules/SKILL.md) first. Use English by default for all assistant output, including AskQuestion prompts/options, unless the user explicitly requests another full-language response.

## Before batch

| Kind | Skill / library | When |
| --- | --- | --- |
| **Recommended** | [`@gh-pr-review`](review/SKILL.md) | User wants acceptance review before or after PR text |
| **Recommended** | [`@gh-pr-list`](list/SKILL.md) · [`@gh-pr-view`](view/SKILL.md) | Inventory before create/edit |
| **Tooling** | authenticated `gh` | Repo scope per user intent |

## Required internal skills

| Library | Role |
| --- | --- |
| `read-pr-preflight-qa` | See linked library |
| `read-pr-branch-context` | See linked library |
| `read-pr-prevalidate` | See linked library |
| `read-dependencies-discover` | See linked library |
| `read-config-configuration` | See linked library |
| `write-dependencies-install` | See linked library |
| `write-quality-evaluate` | See linked library |
| `read-pr-list` | See linked library |
| `read-pr-description` | See linked library |
| `read-pr-content` | See linked library |
| `read-pr-body-sections` | See linked library |
| `read-pr-body-sections-section-patterns` | See linked library |
| `read-diff-summary` | See linked library |
| `read-diff-summary-delta-narrative` | See linked library |
| `read-repo-stream` | See linked library |
| `read-repo-forms-json` | See linked library |
| `read-shuttle-gh-pr-read` | PR inventory / view |
| `read-shuttle-gh-pr-commands` | PR mutations |
| `read-safety-structured-qa` | See linked library |
| `read-shuttle-gh-pr-commands` | PR mutations |

## Skip & suggestions

| Flag / param | Role |
| --- | --- |
| **`skip=false`** | Root invocation — offer next-step suggestions after **Verification** |
| **`skip=true`** | Nested public-skill child call — no next-step prompt |
| **`SKIP_QA_GH_PR=true`** | Bypass routine write gates for this skill |
| **`SKIP_QA_WRITE=true`** | Shared write-flow Q&A bypass where allowed |
| **`SKIP_SUGGESTIONS=true`** | Suppress next-step suggestions even at root |
| **`SKIP_PR_PREVALIDATE=true`** | Skip discover/evaluate gate (branch gate still runs) |

## On invoke

**Fixed order (stop on failure or Abort):**

1. **[`read-pr-preflight-qa`](../../internal/read/pr/preflight-qa/SKILL.md)** — **[`read-pr-branch-context`](../../internal/read/pr/branch-context/SKILL.md)** (branch **X**, diff **Y**, target **main**); branch placement gate; overlap preference; publish readiness.
2. **[`read-pr-prevalidate`](../../internal/read/pr/prevalidate/SKILL.md)** — discover repo checks from docs/CI, run install + evaluate sequence, **prevalidate_pr** gate (or explicit skip).
3. Optional **`@gh-pr-review`** when the user asked for acceptance review.
4. **PR lookup** — **`read-shuttle-gh-pr-read`** + **`read-repo-stream`**; **write gate** kind **disambiguate_pr** when matches exist.
5. **Draft** — **`read-pr-description`** in full (§5–7).
6. **§9 apply** — **Write gate** before **`read-shuttle-gh-pr-commands`** (`shuttle gh … --yes`).

**Diff scope:** Full destination vs **`HEAD`** delta for narrative. **Same-repo `main`** without fork: stop if there is nothing to PR.

## Do

- Confirm publish readiness in chat when the branch may not be on the remote yet (out of scope for this skill to fix).
- Apply PR mutations only after **§9 Proceed** via **`read-shuttle-gh-pr-commands`**.

## Do not

- Run local repository sync or publish workflows from this skill.
- Merge the PR on GitHub from this skill.

## Verification

- [ ] Branch placement confirmed (branch, diff, target base).
- [ ] Prevalidate checklist green or explicit skip recorded.
- [ ] Preflight captured PR intent and publish readiness.
- [ ] PR create/edit ran only after **§9 Proceed** via **read-shuttle-gh-pr-commands**.

## Recommended next steps

When **`skip=false`** (root invocation) and **`SKIP_SUGGESTIONS`** is unset, delegate to [`read-skill-suggestions`](../../internal/read/skill-suggestions/SKILL.md) for optional next-step choices. Nested public-skill calls use **`skip=true`**.

## See also

- [`@gh-pr-view`](view/SKILL.md)
- [`@gh-pr-review`](review/SKILL.md)
