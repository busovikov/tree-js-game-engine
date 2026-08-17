# Handoff: UI-M6 component authoring foundation rollover 01

## Objective

Continue Milestone 6 from the verified pure/runtime-semantics and atomic session-command
foundation to the complete component master/instance editor workflow, without entering M7 or
touching the protected playground project and UI assets.

## Scope and acceptance criteria

- [x] Centralize sparse effective override resolution and deterministic runtime locator keys in
      `@haku/ui` without weakening the version 2 schema.
- [x] Extract one valid document subtree into a named component master, remap its parent to a new
      instance, and reject root/unknown/collision failures before mutation.
- [x] Place an instance at the deterministic document creation target with strict parent layout
      placement.
- [x] Set and reset schema-allowed sparse overrides; reject an incompatible override before it
      enters history.
- [x] Recursively detach an instance into concrete elements with globally fresh IDs.
- [x] Make create, place, override, reset, and detach one strict full-document history command each.
- [ ] Prove extraction and detach preserve actual rendered appearance, including component-root
      layout, instance wrapper semantics, themes, and nested instances.
- [ ] Deliver the complete Components collection, palette, master navigation/edit scope,
      safeguards, badges, indicators, descendant inspection, and browser acceptance workflow.

## Required context

- `docs/ui-editor-figma-development-plan.md` — document structure, strict validation, architecture,
  Milestone 6, and Definition of Done sections only.
- `docs/handoffs/UI-M5-01.md`
- `docs/stage-handoff.md`
- `packages/ui/src/component-instance.ts`
- `packages/ui/src/ui-document-instance.ts` — instance rendering and locator entrypoints only.
- `packages/ui/src/schema.ts` — component/instance schemas and validation only.
- `packages/editor/src/ui/ui-component-authoring.ts`
- `packages/editor/src/ui/ui-authoring-session.ts` — component methods and replacement command only.
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx` — load only the narrow Layers/palette/
  Inspector/render-locator integration regions needed by the next workflow slice.

## Decisions and invariants

- `UIDocumentSchema` remains the sole mutation gate. No compatibility reader, structural override,
  duplicate global element ID, or editor-only state enters serialized UI.
- Effective instance values use the public `applyUIInstanceOverride` helper shared by runtime and
  editor transforms. Nested style, accessibility, and event records merge sparsely.
- Runtime locator keys use a non-empty `instancePath` plus `sourceElementId`; empty paths fail
  explicitly instead of aliasing document elements.
- Extraction moves the selected source IDs into the component scope and generates a fresh instance
  ID. Parent child order is remapped in place; component and document element IDs remain globally
  unique.
- Placement reuses `resolveUICreationTarget`; auto-layout uses Flow and free layout uses explicit
  finite point/reference geometry.
- Detach recursively expands nested definitions and overrides. Every materialized concrete element
  receives a collision-checked fresh global ID, including the detached root.
- Session methods calculate a fully parsed candidate before `ReplaceUIDocumentCommand`, so invalid
  actions add no history and successful create/place/override/reset/detach actions are atomic.
- Component source elements are not currently selectable in `UIAuthoringSession`; selection still
  reconciles against document elements only. Add explicit edit scope rather than weakening this
  reconciliation implicitly.
- The runtime still renders an instance wrapper around the component root. Do not claim the
  no-appearance-change criterion until a RED runtime DOM/layout contract resolves that wrapper and
  Chrome confirms it.

## Completed

- Audited the M1 strict schema/runtime foundation: global IDs, strict component trees, sparse
  non-structural override validation, nested expansion, direct/indirect cycle rejection, and runtime
  locator attributes were already present.
- Added public React-free effective-value and locator-key semantics, then changed
  `UIDocumentInstance` to consume the shared helpers without changing its DOM structure.
- Added pure extraction, placement, override, reset, and recursive detach transforms with strict
  result parsing and explicit failure behavior.
- Added thin atomic `UIAuthoringSession` commands and selection results for the document-scope
  foundation.
- Recorded RED before each implementation step: missing semantics/transforms first, then missing
  session commands, then missing reset transform/session command.
- Ran no browser check, as required for this partial foundation slice.

## Files changed

- `packages/ui/src/component-instance.ts`: shared effective override and locator-key semantics.
- `packages/ui/src/component-instance.test.ts`: sparse merge and locator validation coverage.
- `packages/ui/src/index.ts`: public helper export.
- `packages/ui/src/ui-document-instance.ts`: use shared effective/locator helpers.
- `packages/editor/src/ui/ui-component-authoring.ts`: strict pure extraction, placement, override,
  reset, and detach transforms.
- `packages/editor/src/ui/ui-component-authoring.test.ts`: remap, effective detach, fresh-ID,
  placement, collision, reset, and non-mutation coverage.
- `packages/editor/src/ui/ui-authoring-session.ts`: atomic component command entrypoints.
- `packages/editor/src/ui/ui-authoring-session.test.ts`: create/place/detach/override/reset history
  and invalid-command coverage.
- `docs/handoffs/UI-M6-ROLL-01.md`: this rollover record.

## Local commits

- `27e8357` — `Add strict UI component authoring commands`
- The documentation commit containing this handoff follows the implementation commit.

## Verification evidence

- RED: focused helper/transform run failed with two missing `@haku/ui` functions and the missing
  `ui-component-authoring.js` module.
- RED: `ui-authoring-session.test.ts` failed two tests because `createComponent` did not exist.
- RED: focused editor run failed two tests because reset transform/session commands did not exist.
- `pnpm --filter @haku/ui test` — pass, 5 files / 35 tests.
- `pnpm --filter @haku/editor test` — pass, 54 files / 316 tests.
- `pnpm --filter @haku/ui typecheck` — pass.
- `pnpm --filter @haku/ui build` — pass. Run this before editor verification when a new public UI
  export is added because editor resolves the built workspace package types.
- `pnpm --filter @haku/editor typecheck` — pass.
- `pnpm --filter @haku/editor build` — pass.
- Targeted ESLint over all eight implementation/test files — pass.
- Targeted Prettier check over the new/otherwise formatted implementation/test files — pass.
- `pnpm exec vitest run packages/ui/src/component-instance.test.ts
packages/ui/src/ui-document-instance.test.ts --reporter=dot` after removing unrelated runtime
  formatting churn — pass, 2 files / 9 tests.
- Browser check — intentionally not run for this partial pure/session slice.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD before this documentation commit:
  `27e835774693cc504a8049a4a98e75f4b789548b`
- Worktree before this handoff: only protected user work remained outside commits:
  `M apps/playground/haku.project.json` and `?? apps/playground/public/assets/ui/`.

## Remaining work

- RED-first runtime appearance contract: decide and implement component-root/instance-wrapper DOM
  semantics so extraction does not add layout, sizing, style, accessibility, or event behavior.
  Preserve `getElement(instanceId)` plus descendant `{ instancePath, sourceElementId }` lookup and
  diagnostic data attributes.
- Extend detach tests through nested instances, source themes, root overrides, free/auto placement,
  and repeated source definitions. Remap or materialize theme styles for fresh detached IDs so
  themed appearance is not lost.
- Add explicit component edit scope to the session/view model. Component descendants must appear in
  Layers/canvas inspection with breadcrumb/master navigation while document selection remains
  unambiguous.
- Add component-scope structural commands. Redirect/enter master for instance descendant structural
  edits; never synthesize structural overrides.
- Add master element edits that immediately refresh instances, preserve runtime state that remains
  type-valid, and reject or explicitly resolve master deletion/type/options/range/event changes that
  invalidate existing overrides.
- Add nested component-instance insertion with direct and indirect cycle preflight before command
  execution, plus focused diagnostic chains.
- Build the Components collection and instance palette with create-at-pointer/selected-parent
  behavior, empty state, duplicate, rename, and delete safeguards (including referenced masters).
- Add instance/master badges, override indicators, per-field reset and reset-all, Detach, and clear
  disabled/error guidance.
- Add duplicate/rename/delete history tests, master edit/override invalidation tests, nested locator
  diagnostics, explicit reset-all tests, and atomic undo/redo across all required M6 actions.
- Wire `UIDocumentEditorPanel.tsx` and CSS with narrow selectors/memo boundaries; add panel tests
  before browser work.
- Only after the full surface is GREEN, run user-Chrome acceptance: create a button/card master,
  place multiple instances, override one, edit master, reset, detach, and verify event source paths
  with a clean console. Record evidence and then mark M6 complete. Do not enter M7.

## Risks and open defects

- The current runtime wrapper means the pure extraction transform alone does not yet prove effective
  rendered appearance. Wrapper/root sizing and placement may compose twice.
- Detach currently materializes source and instance override style/accessibility values, but theme
  records still target master source IDs. Fresh detached IDs need explicit theme handling.
- Nested detach is implemented recursively but lacks a dedicated nested regression test in this
  savepoint.
- `setUIInstanceOverride` sets one complete source override record; field-level UI adapters must
  merge the existing record deliberately before calling it.
- Component-scope instances can be updated by the pure override transform, but the current document-
  only session selection falls back to the document root. Explicit edit scope must solve this.

## Exact next action

Write a failing `packages/ui/src/ui-document-instance.test.ts` case that mounts an extracted
Frame/card instance and compares its root layout/sizing/style plus top-level and descendant locator
behavior with the original concrete subtree. Use that contract to resolve the extra wrapper without
losing nested paths or runtime entries, then add a nested/theme detach RED case before expanding the
editor edit-scope UI.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- M7 Bounce Run dogfood, M8 graph wiring, M9 stabilization, scene/engine/physics/audio systems, and
  unrelated editor panels.
