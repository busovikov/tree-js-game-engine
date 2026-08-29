# Handoff: UI-M6 instance overrides, reset, and detach rollover 06

## Objective

Continue Milestone 6 from the completed component collection and lifecycle surface through the
remaining component-master Inspector adapters and final browser workflow, without entering M7 or
changing protected playground and Bounce Run user files.

## Scope and acceptance criteria

- [x] Inspect the selected document component instance and choose its rendered master source fields.
- [x] Show sparse allowed override indicators and omit structural override controls with actionable
      master-edit guidance.
- [x] Merge text, widget value, style, accessibility, and event patches without discarding neighboring
      source override fields.
- [x] Reset one override field or every instance override as separate atomic Undo/Redo commands.
- [x] Detach the selected document instance into an equivalent concrete subtree with globally fresh
      IDs and restore the instance/detached-root selection through one Undo/Redo.
- [ ] Complete the remaining component-master Inspector adapters and final M6 Chrome workflow.

## Required context

- `docs/ui-editor-figma-development-plan.md` — Create and reuse a component, Milestone 6, and
  Definition of Done sections only.
- `docs/stage-handoff.md`
- `docs/handoffs/UI-M6-ROLL-06.md`
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx` — Inspector adapter call sites only.
- `packages/editor/src/ui/ui-inspector-model.ts` — existing strict document helpers to adapt for the
  active component edit tree.
- `packages/editor/src/ViewportTabsShell.test.tsx` — component-master Inspector tests only.

## Decisions and invariants

- A selected document instance owns the instance override panel. Its source locator uses that exact
  instance ID, never the first instance of the same master, so multiple document instances do not
  cross-target override commands.
- The source list contains only source elements in the selected instance's immediate master. Nested
  instance source rows can be inspected, but nested-master descendant locator expansion remains a
  later navigation adapter because the current schema cannot encode an outer-instance-specific
  override for a nested master's source ID.
- `setUIInstanceOverride` merges the existing source override. `style`, `accessibility`, and `events`
  merge sparsely at their property level; explicit `undefined` removes a nested property and empty
  nested records are pruned.
- Reset one field removes exactly one top-level schema override category and prunes the source entry
  when empty. Reset all clears the selected authored instance only. Missing reset targets fail before
  `ReplaceUIDocumentCommand`, leaving asset, selection, and history unchanged.
- The document-instance Inspector exposes only schema-permitted value categories: name,
  visible/enabled, text when supported, typed widget value when supported, compact style controls,
  accessibility label/description, and compatible event slots. Children, layout, sizing, placement,
  and component identity are absent and explained as master-only structure.
- Detach continues to use the established recursive strict transform. Nested instances are fully
  materialized, source and theme IDs are globally fresh/remapped, effective overrides and instance
  appearance are preserved, and selection moves to the concrete root in the same command.

## Completed

- Added merge-preserving sparse override transforms plus reset-one-field and reset-all transforms.
- Added atomic session seams for per-field and all-instance reset with invalid no-history behavior.
- Added a compact selected-document-instance Inspector with source navigation, exact runtime locator,
  override/source badges, allowed value controls, reset actions, structural guidance, and Detach.
- Extended detach session coverage to prove exact Undo/Redo selection restoration.
- Added focused RED-to-GREEN pure, session, and panel coverage for merge preservation, reset
  granularity, invalid reset atomicity, forbidden structural UI absence, global fresh detach IDs, and
  selected-instance restoration.

## Files changed

- `packages/editor/src/ui/ui-component-authoring.ts`: merge-preserving sparse override updates and
  strict field/reset-all transforms.
- `packages/editor/src/ui/ui-component-authoring.test.ts`: sparse nested merge, reset-field,
  reset-all, and rejected-reset coverage.
- `packages/editor/src/ui/ui-authoring-session.ts`: atomic reset-field and reset-all session seams.
- `packages/editor/src/ui/ui-authoring-session.test.ts`: reset history, invalid history, and detach
  Undo/Redo selection coverage.
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`: selected document instance override/source
  Inspector and Detach entry.
- `packages/editor/src/ui/ui-document-editor-panel.css`: compact instance, source, and override badge
  presentation.
- `packages/editor/src/ViewportTabsShell.test.tsx`: selected source locator, indicators, structural
  exclusion, merge/reset history, fresh detach subtree, and selection coverage.
- `docs/handoffs/UI-M6-ROLL-06.md`: this rollover record.

## Local commits

- `48f30a4` — `Add field-level UI instance override commands`
- `a93e2c2` — `Expose UI instance overrides and detach`
- The documentation commit containing this handoff follows the implementation commits.

## Verification evidence

- Initial focused RED: `pnpm exec vitest run packages/editor/src/ui/ui-component-authoring.test.ts
packages/editor/src/ui/ui-authoring-session.test.ts packages/editor/src/ViewportTabsShell.test.tsx
--reporter=dot` — 3 files failed, 3 tests failed / 104 passed: whole-source replacement discarded
  neighboring overrides, field/reset-all session seams were absent, and the panel had no instance
  override region.
- Pure/session GREEN: `pnpm exec vitest run packages/editor/src/ui/ui-component-authoring.test.ts
packages/editor/src/ui/ui-authoring-session.test.ts --reporter=dot` — pass, 2 files / 39 tests.
- Complete focused GREEN: `pnpm exec vitest run
packages/editor/src/ui/ui-component-authoring.test.ts
packages/editor/src/ui/ui-authoring-session.test.ts packages/editor/src/ViewportTabsShell.test.tsx
--reporter=dot` — pass, 3 files / 107 tests.
- `pnpm --filter @haku/ui test` — pass, 5 files / 38 tests.
- `pnpm --filter @haku/ui typecheck` — pass.
- `pnpm --filter @haku/ui build` — pass.
- `pnpm --filter @haku/editor test` — pass, 54 files / 337 tests.
- `pnpm --filter @haku/editor typecheck` — pass.
- `pnpm --filter @haku/editor build` — pass.
- Targeted ESLint over all six TypeScript/TSX implementation and test files — pass.
- `git diff --check` — pass.
- Targeted Prettier check over the six TypeScript/TSX files and CSS — CSS passes; the six source/test
  files retain their known whole-file baseline mismatches. New sections were manually aligned with
  formatter output, and no unrelated formatter rewrite was applied.
- Browser check — intentionally not run; the final complete M6 Chrome workflow remains after the
  component-master Inspector adapter slice.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD before this documentation commit: `a93e2c2`
- Worktree before this handoff contained only protected user work outside commits:
  `M apps/bounce-run/tsconfig.json`, `M apps/playground/haku.project.json`,
  `?? apps/bounce-run/.haku/`, and `?? apps/playground/public/assets/ui/`.

## Remaining work

- Make Frame layout-mode conversion component-scope aware; it currently uses document-only strict
  helper paths when a component source Frame is active.
- Make free/absolute placement and constraint conversion component-scope aware, including correct
  parent lookup and bounds context inside the active master tree.
- Make the complete Style Inspector component-scope aware, especially corner-radius helpers and all
  typography/image-fit/style fields; the compact instance panel currently exposes only text color,
  fill, and opacity overrides.
- Make Accessibility component-scope aware, including role/live/tabIndex and Image alt/decorative
  helper paths; the compact instance panel currently exposes label and description overrides.
- Make Events component-scope aware through the active master tree while retaining compatible
  payload filtering and strict override-invalidation diagnostics.
- Expand owning-instance locator navigation for nested runtime source paths and preserve explicit
  ownership when a master has multiple document or nested owners. The selected document-instance
  panel already targets the exact selected top-level owner; the older master-scope locator still
  chooses the first top-level instance.
- After those adapters are green, run the final M6 Chrome workflow: create a button/card master,
  place multiple instances, override one, edit the master, reset one field and all fields, detach,
  Undo/Redo each atomic action, and verify nested runtime event source paths plus zero unexpected
  console errors. M6 remains incomplete until that evidence is recorded.

## Risks and open defects

- Component-master Widget fields already route through `session.updateElement`, but the listed
  layout, placement, style, accessibility, and event helper paths still assume document elements.
- Instance style/accessibility controls are intentionally compact, not the complete M5 field surface;
  broaden them only through shared component-aware adapters rather than duplicating the Inspector.
- Nested-master descendant overrides cannot be authored per outer instance with the current schema.
  Do not invent structural or path-keyed compatibility overrides in this milestone.
- Current Prettier configuration would reformat substantial pre-existing content in the large panel
  and test files; keep unrelated formatting outside the next semantic commit.

## Exact next action

Write failing panel tests while editing a component master for Frame layout conversion, nested
placement/constraints, style corner/typography fields, Image accessibility, and compatible event
bindings, proving each routes through the active component tree and rejects invalid candidates
without history. Implement shared edit-tree-aware Inspector adapters only, then hand off to a fresh
Chrome entry for the complete M6 workflow above. Do not start M7 or modify protected assets.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- `apps/bounce-run/tsconfig.json`
- `apps/bounce-run/.haku/**`
- M7 Bounce Run dogfood, M8 graph wiring, M9 stabilization, scene/engine/physics/audio systems, and
  unrelated editor panels.
