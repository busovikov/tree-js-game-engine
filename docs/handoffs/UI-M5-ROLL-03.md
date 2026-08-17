# Handoff: UI-M5 placement constraints rollover

## Objective

Continue Milestone 5 from the verified Frame layout, sizing, and placement surface. Finish the
remaining style, accessibility, widget value/option, and event-binding Inspector fields plus the
remaining cohesive canvas overlays, then complete final browser acceptance without entering M6.

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
- [x] Expose visual free-child horizontal/vertical constraints and explicit Flow/Absolute placement
      for auto-layout children.
- [x] Convert constraints and Flow/Absolute placement from finite measured bounds, reject invalid
      candidates atomically, and restore each discrete edit with one exact Undo.
- [x] Reject Fill sizing for absolute-positioned auto-layout children in the shared strict schema.
- [x] Add the cohesive selected-child constraint-anchor overlay.
- [ ] Expose all remaining style, accessibility, widget option/value, and event-binding fields.
- [ ] Add remaining cohesive padding, gap, insertion, and overflow canvas overlays.
- [ ] Run final user-Chrome acceptance only after the complete Inspector surface.

## Required context

- `docs/ui-editor-figma-development-plan.md` — serialized model, M5, and DoD sections only.
- `docs/handoffs/UI-M5-ROLL-03.md`
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx` — Inspector sections only at first.
- `packages/editor/src/ui/ui-inspector-model.ts`
- `packages/editor/src/ui/ui-inspector-model.test.ts`
- `packages/editor/src/ViewportTabsShell.test.tsx` — current UI Inspector tests only.
- `packages/ui/src/schema.ts` — style/accessibility/widget/event definitions only.
- `packages/ui/src/schema.test.ts` and `packages/ui/src/ui-runtime.behavior.test.ts` only if a strict
  shared invariant changes.

## Decisions and invariants

- Constraint editing is available only for a free-positioned child of a Free layout owner. A
  constraint edit requires measured parent and child rectangles, preserves measured child-relative
  `x/y`, and refreshes the finite positive parent reference dimensions before strict parsing.
- Flow/Absolute controls are available only for children of Horizontal, Vertical, or Grid owners.
  Flow-to-Absolute requires finite measured parent/child rectangles and stores measured `left/top`;
  Absolute-to-Flow strips offsets. Each conversion is one whole-document command.
- Absolute positioning cannot consume auto-layout Fill space. The Inspector disables Absolute with
  an explanation when either sizing axis is Fill, and `UIDocumentSchema` rejects such documents.
- Absolute numeric drafts remain local until blur. Empty/non-finite drafts restore the prior value
  and create no command; scrub updates share one fresh placement history group.
- The selected free child renders horizontal and vertical constraint-anchor lines from existing
  measured bounds. Other padding/gap/insertion/overflow overlays remain deferred.
- Every Inspector candidate is parsed as a complete strict document before `replaceAsset`; failed
  adapters do not mutate the asset or command history.
- Protected user paths remain outside reads, formatting, staging, and commits.

## Completed

- Added RED then GREEN pure coverage for horizontal/vertical constraint editing, missing/non-finite
  measured reference reasons, strict Flow-to-Absolute and Absolute-to-Flow conversions, invalid
  offsets, atomic rejection, and strict document parsing.
- Added RED then GREEN panel coverage for visual constraint choices, measured reference updates,
  constraint-anchor state, Flow/Absolute conversion, invalid draft/no-history behavior, disabled
  Fill explanations, and exact one-step Undo in both placement branches.
- Added a memoized Placement Inspector section with visual constraint buttons, legal Flow/Absolute
  controls, present-side absolute offset fields, disabled reasons, and grouped numeric scrubs.
- Added selected-child horizontal/vertical constraint-anchor overlays without starting the other M5
  overlay families.
- Tightened the shared schema so absolute auto-layout children cannot use Fill sizing.

## Files changed

- `packages/editor/src/ui/ui-inspector-model.ts`: measured constraint and placement adapters,
  explanations, strict conversions, and absolute offset updates.
- `packages/editor/src/ui/ui-inspector-model.test.ts`: pure placement conversion and failure proof.
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`: memoized Placement section and constraint
  overlay.
- `packages/editor/src/ui/ui-document-editor-panel.css`: compact visual controls and overlay lines.
- `packages/editor/src/ViewportTabsShell.test.tsx`: panel, Undo, disabled-state, invalid-draft, and
  overlay regressions.
- `packages/ui/src/schema.ts`: absolute-plus-Fill tree invariant.
- `packages/ui/src/schema.test.ts`: strict rejection regression.

## Local commits

- `bacb3bb` — `Expose strict Frame layout controls`
- `a965b42` — `Add lossless sizing bounds and scrub history`
- `2fbb41a` — `Expose strict UI placement controls`
- The documentation-only commit containing this rollover follows them.

## Verification evidence

- RED editor focused run — four missing pure adapters and two missing Placement regions failed while
  the previous 212 tests remained green.
- RED `pnpm exec vitest run packages/ui/src/schema.test.ts` — absolute-plus-Fill document was
  incorrectly accepted before the schema invariant.
- `pnpm exec vitest run packages/editor/src/ui/ui-inspector-model.test.ts
packages/editor/src/ViewportTabsShell.test.tsx packages/ui/src/schema.test.ts
packages/ui/src/ui-runtime.behavior.test.ts` — 4 files, 50 tests passed before the final disabled
  panel regression; the final focused editor/schema run passed 3 files, 46 tests.
- `pnpm --filter @haku/editor test` — 52 files, 219 tests passed.
- `pnpm --filter @haku/ui test` — 4 files, 26 tests passed.
- `pnpm --filter @haku/editor typecheck` and `pnpm --filter @haku/ui typecheck` — passed.
- `pnpm --filter @haku/editor build` and `pnpm --filter @haku/ui build` — passed.
- `pnpm exec eslint` on all changed TypeScript/TSX files — passed.
- `pnpm exec prettier --check` on all seven changed source/test/style files — passed.
- Browser check — intentionally deferred until the complete M5 Inspector and overlay surface exists.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD before this documentation commit: `2fbb41a`
- Worktree before this documentation commit contains only protected user work:
  `M apps/playground/haku.project.json` and `?? apps/playground/public/assets/ui/`.

## Remaining work

- RED first for lossless style field adapters and panel controls covering typography, fill, stroke,
  per-corner radius, opacity, and image fit; invalid numeric/style drafts must remain atomic and
  grouped scrubs must keep exact Undo.
- Add a separate memoized Accessibility section for every serialized accessibility property and
  required accessible-name/decorative combinations, with schema-aligned disabled explanations.
- Add per-kind memoized value/options sections for Text Input, Text Area, Checkbox, Radio, Switch,
  Select, Slider, Progress, Divider, and List without weakening existing coupled validations.
- Add compatible event-binding controls filtered by declared event payload and element slot; missing
  and incompatible bindings must not be committable.
- Add editor-only padding/gap/insertion/overflow overlays only after their Inspector fields can share
  the current measured-bounds surface cleanly.
- Only after the whole surface is complete, run the user-Chrome wide/desktop/narrow construction,
  screenshots/computed bounds, console check, reset/finalization, and final M5 handoff.

## Risks and open defects

- Typography, full paint/stroke/radius/opacity/image-fit, full accessibility, widget-specific values
  and options, and event bindings still lack complete intentional Inspector surfaces; M5 is not
  complete.
- Only constraint anchors were added on canvas. Padding, gap, insertion, and overflow overlays remain
  intentionally deferred.
- No final browser acceptance has started, and the milestone status/DoD must not be marked complete.

## Exact next action

Write RED pure and panel tests for lossless style editing first: typography (`fontFamily`, finite
`fontSize`, `fontWeight`, `fontStyle`, finite `lineHeight`/`letterSpacing`, text alignment), fill,
stroke, per-corner radius, finite opacity, and Image fit. Require strict whole-document parsing,
atomic rejection/no history for invalid numeric drafts, and exact one-step Undo for discrete edits
plus one grouped Undo per scrub. Then add a small memoized Style Inspector section using the existing
field conventions; do not start Accessibility, widget values/options, events, remaining overlays, or
browser acceptance until that style slice is committed and handed off.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- M6 components/instances, M7 dogfood, and unrelated scene/engine subsystems.
