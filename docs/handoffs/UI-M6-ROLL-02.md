# Handoff: UI-M6 runtime appearance and nested detach rollover 02

## Objective

Continue Milestone 6 from the wrapper-free runtime and theme-preserving detach savepoint into an
explicit component-master edit scope, without entering panel/browser work or M7 and without
touching protected playground or Bounce Run user files.

## Scope and acceptance criteria

- [x] Render a component instance on its effective component root DOM node with no additional
      layout, sizing, style, accessibility, enabled, visible, focus, or event wrapper appearance.
- [x] Preserve top-level `getElement(instanceId)`, root and nested instance locators, diagnostic
      data attributes, runtime entries, focus, values, and event source paths.
- [x] Recursively detach nested/repeated component definitions with globally fresh concrete IDs,
      root overrides, free/flow placement, and equivalent theme appearance.
- [x] Reject direct and indirect component-scope insertion cycles before consuming a generated ID
      or constructing a candidate document, with the complete dependency chain in the diagnostic.
- [ ] Add explicit component-master edit scope and complete the remaining Components authoring UI.

## Required context

- `docs/ui-editor-figma-development-plan.md` — component model, runtime semantics, Milestone 6,
  architecture boundaries, and Definition of Done sections only.
- `docs/stage-handoff.md`
- `docs/handoffs/UI-M6-ROLL-01.md`
- `packages/editor/src/ui/ui-authoring-session.ts` — selection state, `apply`, `executeReplacement`,
  component methods, and selection reconciliation only.
- `packages/editor/src/ui/ui-authoring-session.test.ts` — component command and selection tests only.
- `packages/editor/src/ui/ui-component-authoring.ts` — component-scope placement contract only.
- `packages/ui/src/ui-document-instance.ts` — instance alias/composed appearance code only if a
  regression requires it; the runtime slice is otherwise complete.

## Decisions and invariants

- One physical DOM node represents an instance and its effective component root. Runtime entries
  alias that node, while source-root values/events remain keyed by the deterministic instance
  locator and outer/source visible and enabled state compose conjunctively.
- Root layout comes from the component source. The outermost instance owns placement and sizing;
  source theme/style and each nested instance style/theme layer apply in inner-to-outer order.
- The physical node exposes the deepest rendered source/path diagnostic attributes and keeps the
  top-level document instance ID in `data-haku-ui-id`. Nested instance locator aliases can resolve
  to the same node without adding DOM.
- Detach copies every source theme record to each fresh concrete copy. At each materialized root it
  folds nested/outer instance base style and theme style in runtime precedence, and removes only
  the deleted document instance's now-invalid theme key.
- Component insertion resolves its globally unique parent ID in document or component scope. For
  a component parent, preflight searches from the inserted component back to the owner and rejects
  `owner -> inserted -> ... -> owner` before UUID generation.
- `UIDocumentSchema` remains the sole mutation gate. No compatibility paths or structural
  overrides were added.
- The next slice must keep document selection distinct from component-master selection. Do not
  make the current document-only reconciliation accept arbitrary component IDs without a
  discriminated edit scope.

## Completed

- Added a RED concrete-versus-extracted Frame/card DOM contract. The old renderer failed because
  `getElement(instanceId)` returned an extra wrapper rather than the component root.
- Replaced physical instance wrappers with runtime aliases composed onto the effective root,
  including nested instances, theme changes, accessibility, sizing/placement, visibility,
  enabled state, focus, and event source paths.
- Added a RED nested/theme detach case. The old transform failed strict parsing because the deleted
  instance remained a theme target and fresh concrete IDs received no theme styles.
- Materialized theme styles for repeated nested definitions and composed instance theme layers on
  each detached root while preserving free/flow placement and overrides.
- Extended pure placement to component-owned containers and added direct/indirect cycle preflight
  with deterministic diagnostic chains.
- Removed formatter churn outside the semantic hunks before the implementation commit.
- Ran no browser or UI-panel work in this slice.

## Files changed

- `packages/ui/src/ui-document-instance.ts`: wrapper-free root rendering, runtime aliases, and
  composed instance appearance/state.
- `packages/ui/src/ui-document-instance.test.ts`: concrete/extracted DOM equivalence, outer state,
  nested aliases, focus, and event locator coverage.
- `packages/editor/src/ui/ui-component-authoring.ts`: nested placement cycle preflight and
  theme-preserving recursive detach.
- `packages/editor/src/ui/ui-component-authoring.test.ts`: repeated nested definitions, themes,
  root overrides, free/flow placement, collision, immutability, and cycle diagnostics.
- `docs/handoffs/UI-M6-ROLL-02.md`: this rollover record.

## Local commits

- `b35fc93` — `Preserve component appearance through runtime and detach`
- The documentation commit containing this handoff follows the implementation commit.

## Verification evidence

- RED: `pnpm exec vitest run packages/ui/src/ui-document-instance.test.ts --reporter=dot` failed
  because the instance and component root were different nodes and the wrapper was visible in the
  DOM diff.
- RED: `pnpm exec vitest run packages/editor/src/ui/ui-component-authoring.test.ts --reporter=dot`
  failed because detach retained the deleted instance theme target.
- RED: the same editor test failed component-scope placement before cycle preflight with
  `UI component parent must be a container`.
- Focused final: `pnpm exec vitest run packages/ui/src/ui-document-instance.test.ts
packages/editor/src/ui/ui-component-authoring.test.ts --reporter=dot` — pass, 2 files / 16 tests.
- `pnpm --filter @haku/ui test` — pass, 5 files / 37 tests.
- `pnpm --filter @haku/ui typecheck` — pass.
- `pnpm --filter @haku/ui build` — pass and ran before editor build.
- `pnpm --filter @haku/editor test` — pass, 54 files / 318 tests.
- `pnpm --filter @haku/editor typecheck` — pass.
- `pnpm --filter @haku/editor build` — pass.
- Targeted ESLint over all four implementation/test files — pass.
- Prettier check over the changed editor transform/test files — pass; legacy whole-file runtime
  formatting was deliberately not committed as unrelated churn.
- `git diff --check` over all four implementation/test files — pass.
- Browser check — intentionally not run; no UI panel or M7 work was in scope.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD before this documentation commit:
  `b35fc93aed3f4a38cdac24ab22253af86ee7e6e5`
- Worktree before this handoff: only protected user work remained outside commits:
  `M apps/bounce-run/tsconfig.json`, `M apps/playground/haku.project.json`,
  `?? apps/bounce-run/.haku/`, and `?? apps/playground/public/assets/ui/`.

## Remaining work

- Introduce a discriminated editor-only edit scope in `UIAuthoringSession`, for example document
  scope versus `{ type: 'component'; componentId }`, and reconcile selection only against the
  active scope's element array.
- Add RED session tests for enter master, exit to the owning/top-level instance, component-root and
  descendant selection, unknown component/source rejection, document selection isolation, and
  undo/redo selection reconciliation without serializing edit scope.
- Route component-scope structural and inspector edits through strict full-document replacement.
  Instance descendant structural edits must enter/redirect to the master; do not synthesize
  structural overrides.
- Add master edits that immediately refresh instances and reject changes that invalidate existing
  overrides until explicitly resolved.
- Then build the Components collection/palette, breadcrumb/navigation, badges, override indicators
  and resets, detach, duplicate/rename/delete safeguards, and panel tests.
- Run browser acceptance only after the complete M6 surface is green. M6 remains incomplete.

## Risks and open defects

- Instance and source-root aliases intentionally share one physical node. The deepest rendered
  source/path owns diagnostic data attributes, so a nested instance alias is discoverable through
  the runtime locator map rather than a second attribute set on another wrapper.
- `placeUIComponentInstance` can now mutate component scope by globally unique parent ID, but the
  session cannot safely expose that capability until explicit edit scope lands.
- Master mutations and invalidation of existing instance overrides remain unimplemented.
- No browser evidence exists for the full component authoring workflow yet.

## Exact next action

Write a failing `packages/editor/src/ui/ui-authoring-session.test.ts` case that creates a component,
enters its master, selects the master root and a descendant, and proves document selection remains
unchanged/unambiguous after exit and undo/redo. Then add an editor-only discriminated edit-scope
field plus `enterComponentMaster(componentId)` / `exitComponentMaster()` entrypoints in
`packages/editor/src/ui/ui-authoring-session.ts`; update `apply` and selection reconciliation to
validate against the active scope, without changing serialized `UIDocument` or opening
`UIDocumentEditorPanel.tsx` in this slice.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- `apps/bounce-run/tsconfig.json`
- `apps/bounce-run/.haku/**`
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx` and browser/UI-panel work for the next exact
  session-model slice.
- M7 Bounce Run dogfood, M8 graph wiring, M9 stabilization, scene/engine/physics/audio systems, and
  unrelated editor panels.
