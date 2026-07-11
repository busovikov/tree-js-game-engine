---
name: notion-create-task
description: >-
  Creates implementation-ready Notion TODO tickets for @haku without writing code.
  Duplicates Feature Task Template into Docs, sets Epic/Type/To do, links spec via
  📎 Docs. Use when the user asks to create a Notion task, ticket, todo, or feature
  spec for another agent to implement.
---

# Notion — Create Task

**Do not implement.** Plan and publish a ticket another agent executes.

**Full reference:** [`docs/notion-create-task.md`](../../../docs/notion-create-task.md) · URLs: [`docs/notion.md`](../../../docs/notion.md)

**MCP server:** `plugin-notion-workspace-notion` · Auth fail → `mcp_auth`, retry.

---

## Fixed IDs (no Notion search)

| Resource | ID / URL |
| -------- | -------- |
| Tasks data source | `114a0724-5da5-4611-967b-e8def615d996` |
| Docs data source | `73ffe0c3-80da-4bc2-939e-a92e4fb08cb4` |
| Feature Task Template | `39a1402af56080349186fce071ae7c72` |
| Task card template (New Task) | `cbc2116d-c27d-47b0-878d-c67dfcb45461` |

Template URL: https://app.notion.com/p/Feature-Task-Template-39a1402af56080349186fce071ae7c72

---

## On invoke — checklist

```
Progress:
- [ ] 1. Understand request (scope, out of scope)
- [ ] 2. Study project (docs/ + grep, 3–10 files)
- [ ] 3. External research (docs/links.md, official docs)
- [ ] 4. Pick Epic + Type
- [ ] 5. Duplicate Feature Task Template → fill spec
- [ ] 6. Create task card → To do + 📎 Docs
- [ ] 7. Quality checklist → return URLs
```

---

## Step 1–4: Research (before Notion)

### Understand

- Problem, beneficiary, expected behavior, **out of scope**
- Ask user if Epic or scope is ambiguous

### Study project (minimal)

| Need | Read |
| ---- | ---- |
| Workflow | `docs/agent-workflow.md` |
| Architecture | `docs/architecture.md` |
| Stack | `docs/techstack.md` |
| UI | `docs/ui-kit.md` |
| Failures | `docs/edge-cases.md` |
| API | `docs/links.md` |

Grep similar code → cite **paths only** in spec. Do not paste whole files.

### External research

- `docs/links.md` for official Three.js / React / Zod
- `@source-driven-development` for pinned versions
- **Project architecture wins** over external blogs

### Epic mapping

| Area | Epic |
| ---- | ---- |
| schema, core, serializer, engine, render | **Engine** |
| editor, apps/editor | **Editor** |
| playground | **Playground** |
| UI kit | **UI system** |
| particles, audio, animation, physics, scripts, code editor | matching Epic name |

### Type mapping

| Request | Type |
| ------- | ---- |
| New capability | **Feature** |
| Regression / broken | **Bug** |
| Chore / docs / small refactor | **Task** |

---

## Step 5: Spec in 📎 Docs

1. `notion-duplicate-page` → `page_id: "39a1402af56080349186fce071ae7c72"`
2. Wait (async) → `notion-fetch` new page URL
3. `notion-update-page`:
   - **Name** → `<title> — Spec`
   - **Type** → `Technical Spec`
   - **Status** → `In Progress`
   - **Content** → fill **all** template sections (no placeholders)

### Sections to fill (@haku)

| Section | Fill with |
| ------- | --------- |
| Objective | Outcome, not implementation |
| Background | Current behavior, why |
| References → Documentation | `docs/*.md` paths |
| References → Architecture | `docs/architecture.md`, locked § |
| References → Relevant Code | `packages/...` paths |
| References → Similar Implementations | Patterns to reuse |
| Requirements | Functional + applicable non-functional |
| Constraints | AGENTS.md boundaries, `commitSceneEdit`, no React in engine |
| Suggested Investigation | Modules, tests to read |
| Acceptance Criteria | Testable; **list `docs/*.md` files implementer must update** |
| Validation | `pnpm test`, `pnpm build`, `./scripts/check.sh` |
| Deliverables | Code, tests, **repo docs updates** |
| Out of Scope | Explicit exclusions |

---

## Step 6: Task card in TODO

```
notion-create-pages
  parent: { data_source_id: "114a0724-5da5-4611-967b-e8def615d996" }
  pages: [{
    template_id: "cbc2116d-c27d-47b0-878d-c67dfcb45461",
    properties: {
      "Name": "<task title>",
      "Select": "To do",
      "Epic": "<Epic>",
      "Type": "<Feature|Bug|Task>",
      "📎 Docs": "[\"<spec URL>\"]"
    }
  }]
```

No `content` when using `template_id` — body lives in 📎 Docs.

---

## Step 7: Quality gate

Before returning to user:

- [ ] Spec: every section filled, no placeholders
- [ ] Task: **To do**, correct Epic + Type
- [ ] **📎 Docs** linked
- [ ] AC lists git `docs/*.md` updates for implementer
- [ ] Out of scope explicit
- [ ] **Did not write production code**

---

## Dual documentation

| Layer | Who updates |
| ----- | ----------- |
| **Notion 📎 Docs** | Task author now (spec) |
| **Git `docs/*.md`** | Implementation agent later (required in AC) |

---

## After publish

Return to user:

1. Task board URL
2. Spec page URL
3. Epic, Type
4. Do **not** implement unless user asks separately
5. Suggest: execute via `@notion` / separate agent → `docs/notion.md`

---

## Do not

- Implement the feature in this session
- Search Notion for board URLs (use fixed IDs above)
- Load whole repo into context
- Skip 📎 Docs spec for Feature/Bug tickets
- Omit repo `docs/` update list from Acceptance Criteria
