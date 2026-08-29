# Handoff: UI-M6 component-master panel entry and preview state rollover 04

## Objective

Continue Milestone 6 from the completed component-master panel entry and atomic mounted-preview
refresh slice into the Components collection, instance palette, and lifecycle safeguards without
entering M7 or changing protected playground and Bounce Run user files.

## Scope and acceptance criteria

- [x] Consume `UIAuthoringSession.editScope` and `hierarchy()` in the panel.
- [x] Show an instance badge, structural-edit guidance, master entry action, scope breadcrumb, and
      Back to document action.
- [x] Scope Layers and Inspector selection to component source elements and show the runtime source
      locator for the owning document instance.
- [x] Route component widget Inspector patches through `session.updateElement` and surface strict
      override-invalidation diagnostics without mutating the asset.
- [x] Keep edit scope and selection out of saved UI JSON and restore the owning instance on exit.
- [x] Add atomic `UIDocumentInstance.updateDocument`, retain only compatible typed runtime values,
      restore focus, refresh DOM/locators/event bindings, and leave the mounted instance unchanged
      when candidate validation or rendering fails.
- [x] Refresh same-asset panel previews with `updateDocument`; destroy only on asset switch or panel
      unmount.
- [ ] Build the Components collection, component-instance palette, and component lifecycle
      safeguards.

## Required context

- `docs/ui-editor-figma-development-plan.md` — Create and reuse a component, Milestone 6, and
  Definition of Done sections only.
- `docs/stage-handoff.md`
- `docs/handoffs/UI-M6-ROLL-04.md`
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx` — Components collection/palette insertion
  regions only.
- `packages/editor/src/ui/ui-authoring-session.ts` — existing create/place plus the missing
  duplicate/rename/delete component collection commands only.
- `packages/editor/src/ui/ui-component-authoring.ts` — component transforms and safeguards only.

## Decisions and invariants

- The authoring preview remains a document preview while component source Layers and Inspector use
  the explicit component edit tree. Source inspection identifies the owning document instance and
  source element with a runtime locator.
- Instance descendants are structurally edited only in master scope. Document instance rows give
  actionable enter-master guidance and never synthesize structural overrides.
- Document-scope Widget edits retain the established inspector-model helper semantics; component
  Widget edits go through strict `session.updateElement` validation.
- `UIDocumentInstance.updateDocument` parses before mutation, stages a complete replacement DOM,
  and commits maps/DOM together. Runtime values survive only for the same runtime key and element
  kind when the candidate value contract still accepts the value.
- Mounted focus follows the staged runtime entry, including wrapper-free component-root aliases.
  An invalid authored candidate preserves the old document object, DOM node identity, runtime
  value, locator, and focus.
- Panel preview cleanup is keyed by authored asset path. Same-path authoring replacements update the
  mounted instance; theme and viewport changes do not destroy it.

## Completed

- Adopted the existing uncommitted RED tests without discarding or weakening them.
- Added atomic in-place runtime document refresh with compatible typed state and focus retention.
- Added component-aware panel tree/root/selection derivation, breadcrumb navigation, owning-instance
  locator, instance badge/action, and structural-edit guidance.
- Routed component Widget Inspector edits through strict session commands and visibly reported
  override-invalidating edits while preserving the candidate asset boundary.
- Split preview lifecycle mounting from same-asset authored refresh and retained event subscription
  across refreshes.
- Kept the broader Components collection, component palette, override controls, detach, and browser
  workflow outside this bounded entry slice.

## Files changed

- `packages/ui/src/ui-document-instance.ts`: atomic mounted document replacement, typed runtime-value
  compatibility filtering, locator/DOM/event refresh, and focus restoration.
- `packages/ui/src/ui-document-instance.test.ts`: mounted refresh, state/focus preservation, and
  invalid-candidate atomicity coverage.
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`: component edit-scope panel entry, scoped tree and
  Inspector, locator/guidance, diagnostics, and in-place preview refresh lifecycle.
- `packages/editor/src/ViewportTabsShell.test.tsx`: component navigation/save exclusion and focused
  runtime draft preservation coverage.
- `docs/handoffs/UI-M6-ROLL-04.md`: this rollover record.

## Local commits

- `82bcc2f` — `Add atomic UI document instance refresh`
- `905ff9f` — `Expose component master edit scope in UI panel`
- The documentation commit containing this handoff follows the implementation commits.

## Verification evidence

- Initial focused RED: `pnpm exec vitest run packages/ui/src/ui-document-instance.test.ts
packages/editor/src/ViewportTabsShell.test.tsx --reporter=dot` — 2 files failed, 3 tests failed / 71
  passed: `updateDocument` missing and both master-entry controls absent.
- Runtime focused GREEN: `pnpm exec vitest run packages/ui/src/ui-document-instance.test.ts
--reporter=dot` — pass, 1 file / 10 tests.
- Panel focused GREEN: `pnpm exec vitest run packages/editor/src/ViewportTabsShell.test.tsx
--reporter=dot` — pass, 1 file / 64 tests.
- `pnpm --filter @haku/ui test` — pass, 5 files / 38 tests.
- `pnpm --filter @haku/ui typecheck` — pass.
- `pnpm --filter @haku/ui build` — pass and was run before editor checks.
- `pnpm --filter @haku/editor test` — pass, 54 files / 326 tests.
- `pnpm --filter @haku/editor typecheck` — pass.
- `pnpm --filter @haku/editor build` — pass.
- Targeted ESLint over all four implementation/test files — pass.
- `git diff --check` over all four implementation/test files — pass.
- Targeted Prettier check over all four touched implementation/test files — fail; each whole file was
  already not compliant with the current formatter, and applying it produced broad unrelated churn
  that was removed before either semantic commit.
- Browser check — not run because the next Components collection/palette/safeguards slice owns the
  complete M6 browser workflow.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD before this documentation commit: `905ff9f`
- Worktree before this handoff contained only protected user work outside commits:
  `M apps/bounce-run/tsconfig.json`, `M apps/playground/haku.project.json`,
  `?? apps/bounce-run/.haku/`, and `?? apps/playground/public/assets/ui/`.

## Remaining work

- Add a Components collection with explicit empty state and select/open controls.
- Add an instance palette that places a selected master through `session.placeComponent` at the
  normal context-aware creation target.
- Add component create-from-selection, duplicate, rename, and delete commands with atomic Undo/Redo.
- Disable or reject deleting a referenced master with actionable copy; never leave dangling
  instances or partially mutate history.
- Add component-name validation and deterministic duplicate naming without weakening global source
  ID uniqueness or nested-cycle checks.
- Add allowed override indicators, per-field/reset-all controls, and Detach in a later bounded slice
  after the collection safeguards are green.
- Run the complete M6 browser workflow only after the remaining panel surface is implemented. M6
  remains incomplete.

## Risks and open defects

- The current panel exposes master entry from document instance rows but has no Components collection
  or component-instance palette.
- Only the Widget subsection has a component-scope adapter in this slice. Layout mode conversion,
  placement conversion, style corner helpers, accessibility image helpers, and event helper paths
  still need component-aware adapters before claiming the complete master Inspector workflow.
- Owning-instance locator display currently chooses the first top-level document instance of the
  active master; nested and multiple-instance navigation needs the later component navigation slice.
- Current Prettier configuration would reformat substantial pre-existing content in all four touched
  source/test files; do not mix that unrelated rewrite into the next semantic commit.

## Exact next action

Write a failing panel/session test for an empty Components collection and a populated collection that
creates a component from a selected subtree, lists and selects the master, places a new instance from
the component palette, duplicates and renames the master, and rejects deletion while any document or
nested component instance references it without changing asset/history state. Then implement only the
Components collection/palette and the strict duplicate/rename/delete session transforms needed to make
that test green. Do not add override/reset/detach controls or begin the browser workflow in the same
increment.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- `apps/bounce-run/tsconfig.json`
- `apps/bounce-run/.haku/**`
- M7 Bounce Run dogfood, M8 graph wiring, M9 stabilization, scene/engine/physics/audio systems, and
  unrelated editor panels.
