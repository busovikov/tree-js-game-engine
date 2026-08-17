# Handoff: UI-M5 event bindings Inspector rollover

## Objective

Continue Milestone 5 from the verified complete Inspector field surface. Add the remaining
editor-only padding, gap, insertion, and overflow canvas overlays without entering M6, then run
the deferred final M5 browser acceptance only after that overlay slice is complete.

## Scope and acceptance criteria

- [x] Expose strict Frame layout, sizing, bounds, constraints, and Flow/Absolute placement.
- [x] Expose lossless style, accessibility, widget value/options, and per-kind event bindings.
- [x] Filter every event slot to document declarations with the exact required payload.
- [x] Preserve exact event IDs and validate every binding candidate as one strict document.
- [x] Reject unknown, incompatible, and unsupported bindings atomically without history.
- [x] Restore every discrete bind and clear control with one exact Undo.
- [ ] Reflect padding, row/column gap, insertion positions, and overflow boundaries on canvas.
- [ ] Run final user-Chrome acceptance only after the complete overlay surface.

## Required context

- `docs/ui-editor-figma-development-plan.md` — M5 and DoD sections only.
- `docs/handoffs/UI-M5-ROLL-07.md`
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx` — measured bounds, drag/insertion state, and
  existing editor overlay markup only.
- `packages/editor/src/ui/ui-document-editor-panel.css` — existing overlay styles only.
- `packages/editor/src/ViewportTabsShell.test.tsx` — current canvas overlay tests only.
- `packages/editor/src/ui/ui-gesture-transaction.ts` and its test only if a pure overlay geometry
  helper belongs beside the existing rectangle/guide model.

## Decisions and invariants

- Event slots are exactly: Frame `focus`/`blur`; Button `activate`; Text Input
  `input`/`change`/`submit`/`focus`/`blur`; Text Area `input`/`change`/`focus`/`blur`;
  Checkbox, Radio, Switch, and Select `change`; Slider `input`/`change`; no slots for every other
  kind.
- A slot lists None followed only by document-declared events whose payload exactly matches the
  slot. Event definition names are labels only; option values preserve the exact serialized IDs.
- When a slot has no compatible declaration, its None-only control is disabled and explains the
  missing payload declaration. This slice does not create or edit declarations.
- `updateUIElementEventBinding` copies the selected element's event record, binds or deletes one
  slot, and parses the complete candidate through `UIDocumentSchema`. The shared schema remains
  authoritative for UUID, missing declaration, payload mismatch, and whole-document semantics.
- The Events section is memoized and omitted entirely for kinds with no supported slots.
- Every event edit is discrete. No history group is used; each bind or clear is one command and
  one exact Undo.
- The remaining overlays must be editor-only DOM derived from serialized layout plus measured
  bounds. They must never enter `UIDocument`, the production renderer, or runtime state.
- Protected user paths remain outside reads, formatting, staging, and commits.

## Completed

- Added RED then GREEN pure-model coverage for all nine event-bearing kinds and all nine no-slot
  kinds, exact payload filtering and ID preservation, bind/clear, and atomic invalid candidates.
- Added RED then GREEN panel coverage for every supported slot, compatible-only option lists,
  omitted no-slot sections, disabled/empty explanation, hidden invalid candidates with no history,
  and exact single-step Undo for every bind and clear control.
- Added the separate memoized Events Inspector section without declaration authoring or shared
  schema changes.

## Files changed

- `packages/editor/src/ui/ui-inspector-model.ts`: derive strict per-kind slots and build complete
  binding candidates.
- `packages/editor/src/ui/ui-inspector-model.test.ts`: cover slot/payload matrices, filtering,
  exact IDs, clearing, and atomic rejection.
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`: render the memoized compatible-only Events
  section with explicit empty explanations.
- `packages/editor/src/ViewportTabsShell.test.tsx`: cover all panel slots, no-slot states,
  strict failures, and exact Undo.

## Local commits

- `d4c2a55` — `Expose strict UI event bindings`
- The documentation-only commit containing this rollover follows it.

## Verification evidence

- RED focused run — 2 files, 116 tests: 31 expected failures and 85 prior tests passed. Failures
  comprised 20 missing pure adapter cases and 11 absent panel/error/history surfaces.
- `pnpm exec vitest run packages/editor/src/ui/ui-inspector-model.test.ts
packages/editor/src/ViewportTabsShell.test.tsx --reporter=dot` — 2 files, 117 tests passed.
- `pnpm --filter @haku/editor test` — 52 files, 301 tests passed.
- `pnpm --filter @haku/ui test` — 4 files, 33 tests passed.
- `pnpm --filter @haku/editor typecheck` and `pnpm --filter @haku/ui typecheck` — passed.
- `pnpm --filter @haku/editor build` and `pnpm --filter @haku/ui build` — passed.
- `pnpm exec eslint` on all four changed TypeScript/TSX files — passed.
- `pnpm exec prettier --check` on all four changed TypeScript/TSX files — passed.
- Browser check — intentionally deferred until the complete M5 overlay surface.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD before this documentation commit: `d4c2a55`
- Editor event scope is clean after the implementation commit. Known protected user work remains
  outside reads and commands: `M apps/playground/haku.project.json` and
  `?? apps/playground/public/assets/ui/`.

## Remaining work

- Add the cohesive editor-only padding, row/column gap, insertion, and overflow boundary overlay
  surface.
- Run user-Chrome acceptance, screenshots/computed bounds, console checks, reset/finalization, and
  the final M5 handoff only after the overlays are complete.
- M5 remains incomplete. Do not mark its acceptance criteria or DoD complete yet.

## Risks and open defects

- Padding, gap, insertion, and overflow data are authored and rendered, but still lack the required
  intentional editor-canvas visualization.
- The overlay geometry must share the existing measured-bounds/canvas transform and must not
  duplicate layout computation or leak editor state into serialized UI.
- No final browser acceptance has started.

## Exact next action

Write RED pure geometry tests and panel tests for the existing edit-mode overlay surface before
changing production code. For a selected measured Frame, derive four padding inset edges from its
serialized sides; derive row/column gap markers only for applicable auto/grid layout and measured
adjacent children; derive the exact canvas insertion marker from the already resolved drag/create
target and insertion index; and show distinct X/Y overflow boundaries from the selected container's
serialized overflow policies. Prove every overlay uses document-space measured bounds under the
existing canvas transform, is absent in Preview mode and when selection/bounds/layout do not make
it applicable, and never changes the asset or command history. Then implement the smallest pure
overlay model plus editor-only markup/styles in the existing overlay layer. Do not start browser
acceptance, M6, declaration editing, runtime renderer work, or compatibility code.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- Event declaration authoring, runtime event APIs, M6 components/instances, M7 dogfood, browser
  acceptance, and unrelated scene/engine subsystems.
