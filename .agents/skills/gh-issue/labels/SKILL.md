---
name: gh-issue-labels
description: >-
  GitHub labels (shuttle gh label sync): manifest sync, inventory diff, labelize proposals, optional prune.
---

# GitHub: issue labels

Sync **`.cursor/gh/labels.manifest.yaml`**, inventory labels, propose **labelize** edits, optional orphan prune. All mutations via **`shuttle gh`** after **Proceed**.

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../internal/read/safety/language-interaction-rules/SKILL.md) first.

## Before batch

| Kind | Skill / library | When |
| --- | --- | --- |
| **Required** | [`@gh-issue-list`](../list/SKILL.md) | Open-issue inventory for labelize |
| **Tooling** | **`shuttle`** + authenticated **`gh`** | Repo scope |

## Required internal skills

| Library | Role |
| --- | --- |
| `read-shuttle-gh-label-read` | shuttle command shapes |
| `read-issue-label-manifest` | Manifest taxonomy |
| `read-issue-labels` | Heuristics |
| `read-shuttle-gh-issue-read` | Open issues per label |
| `read-shuttle-gh-issue-commands` | Labelize batch edits |
| `read-safety-structured-qa` | Write gate |

## Skip & suggestions

| Flag / param | Role |
| --- | --- |
| **`skip=false`** | Root invocation — offer next-step suggestions after **Verification** |
| **`skip=true`** | Nested public-skill child call — no next-step prompt |
| **`SKIP_QA_GH_ISSUES_LABELS=true`** | Bypass routine write gates for this skill |
| **`SKIP_QA_WRITE=true`** | Shared write-flow Q&A bypass where allowed |
| **`SKIP_SUGGESTIONS=true`** | Suppress next-step suggestions even at root |

High-risk or destructive confirmations still require explicit user confirmation when bypass flags are set.

## Modes

| Mode | Action |
| --- | --- |
| **Sync** | `shuttle gh label sync --manifest .cursor/gh/labels.manifest.yaml --yes` |
| **Inventory** | `shuttle gh label list` + diff vs manifest (read-only) |
| **Labelize** | AI table `#n → labels` → `shuttle gh issue edit` batch with **`--yes`** |
| **Prune** | Sync with **`--prune-orphans`** after explicit **Proceed** |

## Do not

- Delete protected/default labels without user override.
- Embed raw GitHub CLI fences — use **`read-shuttle-gh-label-read`**.

## Verification

- [ ] Mode executed via shuttle with **Proceed** before writes.
- [ ] Protected labels untouched unless user overrode.

## Recommended next steps

When **`skip=false`** (root invocation) and **`SKIP_SUGGESTIONS`** is unset, delegate to **[`read-skill-suggestions`](../../../internal/read/skill-suggestions/SKILL.md)** for optional next-step choices (**summary** → **options** → AskQuestion). Nested public-skill calls use **`skip=true`**.

## See also

- [`@gh-issue-backlog`](../backlog/SKILL.md)
- [`read-issue-nesting`](../../../internal/read/issue/nesting/SKILL.md)
