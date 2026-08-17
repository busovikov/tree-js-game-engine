# Handoff: UI-M5 layout and sizing rollover

## Objective

Continue Milestone 5 from the verified Frame layout, lossless sizing-bound, and numeric gesture
history surface. Finish placement constraints, style/accessibility/widget/event fields, cohesive
canvas layout overlays, and final browser acceptance without entering M6.

## Scope and acceptance criteria

- [x] Reject inverted comparable min/max bounds and non-finite bounds before mutation.
- [x] Cover conversions to Free, Horizontal, Vertical, and Grid with strict documents.
- [x] Convert Frame layout from the Inspector with current measured bounds as one exact Undo.
- [x] Expose Free/Horizontal/Vertical/Grid, wrap, columns, four-side padding, row/column gap,
      distribution, alignment, and per-axis Clip/overflow controls.
- [x] Expose per-axis Hug/Fill/Fixed, explicit px/% conversion, min/max, disabled reasons, and
      strict invalid-state handling.
- [x] Group each continuous numeric scrub under a fresh history group and prove exact Undo, finite
      values, and valid intermediate documents.
- [ ] Expose visual H/V constraints and explicit absolute positioning for auto-layout children.
- [ ] Expose all remaining style, accessibility, widget option/value, and event-binding fields.
- [ ] Add cohesive padding, gap, insertion, constraint, and overflow canvas overlays.
- [ ] Run final full quality and user-Chrome acceptance only after the complete Inspector surface.

## Required context

- `docs/ui-editor-figma-development-plan.md` — serialized model, M5, and DoD sections only.
- `docs/handoffs/UI-M5-ROLL-02.md`
- `packages/editor/src/ui/ui-inspector-model.ts`
- `packages/editor/src/ui/ui-inspector-model.test.ts`
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx` — Inspector and canvas overlay areas only.
- `packages/editor/src/components/NumberField.tsx`
- `packages/editor/src/components/DraggableNumberLabel.tsx`
- `packages/editor/src/components/use-number-scrub.ts`
- `packages/ui/src/schema.ts` — placement/style/accessibility/widget/event definitions only.

## Decisions and invariants

- A layout-mode change calls `convertFrameLayout(asset, id, mode, elementBounds)` and submits its
  already parsed whole document through exactly one `replaceAsset` command.
- Free-to-auto conversion makes non-absolute children flow. Auto-to-free requires measured parent
  and child bounds, stores finite free placement, and materializes illegal Fill axes as measured px.
- `updateUISizingBound` compares min/max only when units match. Unlike px/% bounds remain valid
  because no host-independent comparison exists; same-unit inversions and non-finite values fail.
- Fixed unit conversion is explicit and measured: `% -> px` uses current element bounds; `px -> %`
  uses element/parent bounds and is unavailable for the root or without a positive parent measure.
- Root percentage size/bounds and Fill remain disabled with explanations. Hug is the schema's legal
  Auto/intrinsic mode; no implicit numeric coercion is used.
- `NumberField` now has optional scrub start/end callbacks. UI fields create a new UUID history group
  on pointer down, reuse it through pointer moves, and close it on pointer up/cancel. Typed input is
  local until blur, so it creates one strict command and never serializes NaN or an invalid draft.
- Hidden overflow is labeled `Clip`; X and Y remain independently authored serialized values.
- Protected user paths remain outside reads, formatting, staging, and commits.

## Completed

- Added RED then GREEN pure coverage for comparable bounds, four layout targets, measured Fixed unit
  conversion, invalid root/parent conversion, and strict schema results.
- Added RED then GREEN panel coverage for Free-to-Horizontal conversion plus exact whole-document
  Undo, explicit unit conversion, atomic invalid bounds, and two distinct multi-move scrub gestures.
- Added a memoized Frame layout Inspector section shared by Frame, Scroll Container, and List.
- Replaced the lossy dimension text draft with explicit mode/unit and reusable numeric controls;
  added optional per-axis min/max unit/value controls and visible Fill-disabled explanations.
- Extended the existing scrub component lifecycle without changing existing callers.
- Isolated the UI workspace fixture per panel test so command history and selection cannot leak.

## Files changed

- `packages/editor/src/ui/ui-inspector-model.ts`: strict bound updates and measured Fixed-unit conversion.
- `packages/editor/src/ui/ui-inspector-model.test.ts`: bounds, unit, and all layout-target regressions.
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`: memoized layout section and complete sizing controls.
- `packages/editor/src/ViewportTabsShell.test.tsx`: exact panel conversion, bounds, and scrub Undo proof.
- `packages/editor/src/components/NumberField.tsx`: optional input label and scrub lifecycle surface.
- `packages/editor/src/components/DraggableNumberLabel.tsx`: forwards scrub lifecycle callbacks.
- `packages/editor/src/components/use-number-scrub.ts`: start/end lifecycle on pointer gesture.

## Local commits

- `bacb3bb` — `Expose strict Frame layout controls`
- `a965b42` — `Add lossless sizing bounds and scrub history`
- The documentation-only commit containing this rollover follows them.

## Verification evidence

- RED focused model/panel run — missing bound adapter/Layout mode; both expected failures observed.
- GREEN focused layout run — 2 files, 5 relevant tests passed.
- RED fixed-unit/scrub run — missing unit converter and one Undo stopped at padding `26`, proving
  ungrouped intermediate commands.
- GREEN sizing/layout aggregate run — 2 files, 10 relevant tests passed.
- `pnpm --filter @haku/editor test` — 52 files, 212 tests passed.
- `pnpm --filter @haku/editor typecheck` — passed.
- `pnpm exec eslint` on all seven changed editor files — passed.
- Browser check — intentionally deferred until the complete M5 Inspector and overlay surface exists.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD before this documentation commit: `a965b42`
- Worktree before this documentation commit contains only protected user work:
  `M apps/playground/haku.project.json` and `?? apps/playground/public/assets/ui/`.

## Remaining work

- RED first for free-child H/V constraints, finite reference-size reasons, auto-layout absolute
  positioning and offsets, strict conversion in both directions, and exact Undo.
- Split additional memoized Inspector sections for typography/fill/stroke/radius/opacity/image-fit,
  accessibility, per-kind values/options, and compatible event bindings.
- Add editor-only canvas overlays for selected container padding/gaps, auto insertion positions,
  constraint anchors, and clipped/scroll overflow boundaries if they can share current measured
  bounds cleanly; otherwise keep each overlay as a separately tested continuation increment.
- Run affected `@haku/ui` schema/runtime checks in addition to editor checks once these fields land.
- Only after the whole surface is complete, run the user-Chrome wide/desktop/narrow construction,
  screenshots/computed bounds, console check, reset/finalization, and final M5 handoff.

## Risks and open defects

- Constraint, absolute-placement, style, accessibility, widget, and event surfaces are still absent;
  M5 is not complete.
- Canvas layout overlays were intentionally not mixed into this cohesive Inspector/history slice.
- Layout controls have strict panel/unit coverage, but full runtime comparisons across every preview
  size remain part of final M5 browser acceptance.
- No browser acceptance has started, and the milestone status/DoD must not be marked complete.

## Exact next action

Write RED pure and panel tests for free-child horizontal/vertical constraint editing and auto-layout
Flow-to-Absolute conversion with measured offsets, explicit disabled reasons when reference bounds
are unavailable, strict atomic rejection, and exact one-step Undo. Then add a small memoized
Placement section before starting style/accessibility/widget/event fields.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- M6 components/instances, M7 dogfood, and unrelated scene/engine subsystems.
