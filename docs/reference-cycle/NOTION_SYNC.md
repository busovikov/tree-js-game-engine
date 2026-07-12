# Notion ↔ Local Docs Sync

**Rule:** Planning and cycle artifacts exist in **two places** — they must stay aligned.

| Layer | Location | Role |
| ----- | -------- | ---- |
| **Canonical (git)** | `docs/reference-cycle/<cycle>/` | Source of truth for agents, diffs, PRs |
| **Notion mirror** | Iterative board card + **📎 Docs** spec | Human board, execution anchor, comments |

---

## When to sync

| Event | Action |
| ----- | ------ |
| Create/update local cycle doc | Update matching Notion **📎 Docs** spec + card summary in same pass |
| User changes AD-xx / plan in chat | Update `DECISIONS_LOG.md` / `MASTER_PLAN.md` **and** Notion P0/P1 (or epic) specs |
| Subagent completes planning task | Notion comment includes paths to updated git files |
| Groom task to **To do** | Verify 📎 Docs spec exists, has **Testing** section, matches local task row in MASTER_PLAN |

**Never** leave Notion cards with placeholder `# To Do / - [ ] ...` while git has full content.

---

## Cycle artifact map (raycast-vehicle)

| Git file | Notion |
| -------- | ------ |
| `REFERENCE_INVENTORY.md` | P0 spec § Inventory |
| `REFERENCE_INTERPRETATION.md` | P0 spec § Interpretation |
| `OPEN_QUESTIONS.md` | P0 spec § Questions (answered) |
| `DECISIONS_LOG.md` | P0/P1 spec § AD-xx |
| `MASTER_PLAN.md` | P1 spec (full plan mirror) |
| `AGENT_EDITOR_WORKFLOW.md` | P1 spec § AD-08 |
| T01.x row in MASTER_PLAN | T01.x **📎 Docs** spec |

---

## Mandatory Testing on every implementation task (T01.x)

Every **📎 Docs** spec for executable tasks must include:

### Testing (required section)

- **Unit tests** — package-level (`pnpm --filter @haku/<pkg> test`)
- **Integration** — cross-package or system test where applicable
- **Manual / play verification** — editor or play mode steps
- **Regression** — `pnpm build`, affected `./scripts/check.sh` if CI-relevant

### Validation (required section)

Concrete commands + expected pass criteria. Example:

```bash
pnpm --filter @haku/physics test
pnpm build
# Manual: pnpm --filter @haku/editor-app dev → play mode → WASD moves vehicle
```

**Review gate:** subagent cannot move to **Review** without tests passing (or documented skip with user approval).

**Review handoff:** every **Review** pass must include a Notion comment + card update with: What was done, Files, Tests run, Commit hash, How to review. User cannot approve without this — see `notion-execute-task` skill.

**Editor screenshots:** when the change is visible in editor/play mode, attach **2–4 PNG screenshots** to the Notion task before Review (Playwright `page.screenshot()` → `.agents/tools/editor-playwright/review-artifacts/<TASK_ID>/`; link in comment).

**Review comment scope:** if user feedback touches work **already planned in another board task** (check MASTER_PLAN / 📎 Docs), **do not implement it in the current task**. Reply in Notion with a comment: out of scope here → will be done in **[Txx.x — title](task URL)**. Only fix what belongs to the current task AC.

---

## Planning tasks (P0, P1)

Use **Cycle Spec** type in 📎 Docs (not empty card):

- Objective, deliverables, git paths, validation checklist
- Link to child tasks on board
- Card body = executive summary + link to spec
