# Handoff: UI-M6 Components collection, palette, and lifecycle safeguards rollover 05

## Objective

Continue Milestone 6 from the completed Components collection, instance palette, and strict
component lifecycle safeguards into the override/reset/detach panel entry without entering M7,
starting the complete browser workflow, or changing protected playground and Bounce Run user files.

## Scope and acceptance criteria

- [x] Show an explicit Components collection empty state and disable extraction when the document
      root or no single document subtree is selected.
- [x] Create a named component from the selected document subtree as one undoable command.
- [x] List and select component masters without changing the active edit scope or layer selection.
- [x] Open a selected master and place the selected master through `session.placeComponent` at the
      normal context-aware creation target.
- [x] Duplicate masters with deterministic unique names, globally fresh source IDs, remapped roots,
      children, and theme styles, and strict validation.
- [x] Trim and validate non-empty unique component names for create and rename.
- [x] Delete only unreferenced masters; reject any document or nested-component instance reference
      with an actionable owner/instance diagnostic and unchanged asset/history state.
- [x] Keep create, place, duplicate, rename, and delete as atomic Undo/Redo operations.
- [ ] Add allowed override indicators, per-field/reset-all controls, and Detach.

## Required context

- `docs/ui-editor-figma-development-plan.md` — Create and reuse a component, Milestone 6, and
  Definition of Done sections only.
- `docs/stage-handoff.md`
- `docs/handoffs/UI-M6-ROLL-05.md`
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx` — document-instance Inspector and Components
  collection integration points only.
- `packages/editor/src/ui/ui-authoring-session.ts` — existing override/reset/detach commands only.
- `packages/editor/src/ui/ui-component-authoring.ts` — existing sparse override/reset/detach
  transforms only.

## Decisions and invariants

- Component collection selection is editor-only React state. Selecting, duplicating, or renaming a
  collection item does not change master/document scope or the active layer selection.
- Component extraction remains document-scope only and requires exactly one non-root subtree.
- The component instance palette delegates placement to `UIAuthoringSession.placeComponent`
  without duplicating creation-target rules; component-scope placement therefore retains the
  existing direct/indirect cycle rejection.
- Component names are trimmed and unique within the collection. Duplicate naming is deterministic:
  `Card` becomes `Card 2`, then the first unused numeric suffix.
- Duplicate source element IDs are fresh against document and every master source ID. Root and child
  links plus theme style keys are remapped; nested component references and their override source
  keys continue to reference the existing nested master.
- Deletion checks document instances before nested component instances and reports the exact
  referencing instance and owning master. Reference failure precedes the active-master guard so the
  most actionable dangling-reference diagnostic wins. An unreferenced active master must be exited
  before deletion to preserve explicit scope and selection.
- All lifecycle candidates pass `UIDocumentSchema.parse` before one `ReplaceUIDocumentCommand`
  enters history. Failed name, ID, reference, cycle, or schema validation does not mutate the asset,
  selection, scope, or history state.

## Completed

- Added pure duplicate, rename, and delete transforms with deterministic naming, global source-ID
  remapping, theme-style remapping, strict name validation, and document/nested reference guards.
- Added atomic `UIAuthoringSession` duplicate, rename, and delete component commands.
- Added the compact Figma-like Components collection, explicit empty copy, selected-master row
  actions, create-from-selection, master open, and instance palette placement.
- Added focused pure/session/panel RED-to-GREEN coverage for empty, success, Undo/Redo, name
  validation, source-ID uniqueness, and referenced-delete failure paths.
- Kept override indicators/reset, Detach controls, browser workflow, and all M7 work outside this
  bounded slice.

## Files changed

- `packages/editor/src/ui/ui-component-authoring.ts`: strict duplicate/rename/delete transforms,
  deterministic naming, global source remap, theme remap, and reference diagnostics.
- `packages/editor/src/ui/ui-component-authoring.test.ts`: duplicate/name/delete invariant and
  failure-path coverage.
- `packages/editor/src/ui/ui-authoring-session.ts`: atomic component lifecycle commands and
  reference-first deletion diagnostics.
- `packages/editor/src/ui/ui-authoring-session.test.ts`: lifecycle history plus scope/selection and
  rejected-delete atomicity coverage.
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`: collection, creation, selection/open actions,
  instance palette, and lifecycle controls.
- `packages/editor/src/ui/ui-document-editor-panel.css`: compact collection/palette presentation.
- `packages/editor/src/ViewportTabsShell.test.tsx`: empty collection, extraction, placement,
  navigation, lifecycle, and surfaced diagnostic coverage.
- `docs/handoffs/UI-M6-ROLL-05.md`: this rollover record.

## Local commits

- `48aae4f` — `Add safe UI component lifecycle commands`
- `fabe4e3` — `Add UI Components collection and palette`
- The documentation commit containing this handoff follows the implementation commits.

## Verification evidence

- Initial focused RED: `pnpm exec vitest run packages/editor/src/ui/ui-component-authoring.test.ts
packages/editor/src/ui/ui-authoring-session.test.ts packages/editor/src/ViewportTabsShell.test.tsx
--reporter=dot` — 3 files failed, 8 tests failed / 96 passed: pure lifecycle transforms, session
  commands, and Components panel surface were missing.
- Pure/session focused GREEN: `pnpm exec vitest run
packages/editor/src/ui/ui-component-authoring.test.ts
packages/editor/src/ui/ui-authoring-session.test.ts --reporter=dot` — pass, 2 files / 37 tests.
- Complete focused GREEN: `pnpm exec vitest run
packages/editor/src/ui/ui-component-authoring.test.ts
packages/editor/src/ui/ui-authoring-session.test.ts packages/editor/src/ViewportTabsShell.test.tsx
--reporter=dot` — pass, 3 files / 104 tests.
- `pnpm --filter @haku/ui test` — pass, 5 files / 38 tests.
- `pnpm --filter @haku/ui typecheck` — pass.
- `pnpm --filter @haku/ui build` — pass.
- `pnpm --filter @haku/editor test` — pass, 54 files / 334 tests.
- `pnpm --filter @haku/editor typecheck` — pass.
- `pnpm --filter @haku/editor build` — pass.
- Targeted ESLint over all six TypeScript/TSX implementation and test files — pass. The separate CSS
  target is ignored by the current ESLint configuration with one warning and no error.
- `git diff --check` — pass.
- Targeted Prettier check over the touched implementation/test/CSS files — fail only for the known
  broad baseline mismatch in `UIDocumentEditorPanel.tsx`, `ViewportTabsShell.test.tsx`,
  `ui-component-authoring.ts`, `ui-component-authoring.test.ts`, and
  `ui-authoring-session.test.ts`; no unrelated formatter rewrite was applied.
- Browser check — intentionally not run because override/reset/detach and the complete M6 browser
  workflow remain outside this slice.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD before this documentation commit: `fabe4e3`
- Worktree before this handoff contained only protected user work outside commits:
  `M apps/bounce-run/tsconfig.json`, `M apps/playground/haku.project.json`,
  `?? apps/bounce-run/.haku/`, and `?? apps/playground/public/assets/ui/`.

## Remaining work

- Show allowed override indicators for a selected document instance/source field.
- Add per-field reset and Reset all controls through the strict session override commands.
- Add Detach for document instances, preserving effective appearance, nested materialization, global
  ID freshness, selection, and one-step Undo/Redo.
- Complete the remaining component-aware master Inspector adapters noted in rollover 04.
- Run the complete M6 browser workflow only after override/reset/detach is green. M6 remains
  incomplete.

## Risks and open defects

- The panel can author and manage masters and place instances, but it does not yet expose sparse
  override state, reset controls, or Detach.
- An unreferenced component cannot be deleted while it is the active master; return to document
  first so editor scope/selection cannot point at a removed tree.
- The current panel still chooses the first top-level document instance for component-source runtime
  locator display; nested/multiple-instance navigation needs the remaining M6 navigation work.
- Current Prettier configuration would reformat substantial pre-existing content in the touched
  large source/test files; keep that unrelated rewrite outside the next semantic commit.

## Exact next action

Write a failing panel/session test for selecting a document component instance, identifying which
source fields are overridden, resetting one field and then all fields as separate atomic Undo/Redo
commands, and detaching the selected instance into a visually equivalent concrete subtree with
globally fresh IDs while preserving selection. Then implement only the allowed override indicators,
per-field/reset-all controls, and Detach entry needed to make that test green. Do not start the
complete browser workflow, override master structure, or begin M7 in the same increment.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- `apps/bounce-run/tsconfig.json`
- `apps/bounce-run/.haku/**`
- M7 Bounce Run dogfood, M8 graph wiring, M9 stabilization, scene/engine/physics/audio systems, and
  unrelated editor panels.
