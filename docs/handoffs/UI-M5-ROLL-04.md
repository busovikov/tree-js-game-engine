# Handoff: UI-M5 lossless style Inspector rollover

## Objective

Continue Milestone 5 from the verified Frame layout, sizing, placement, and style Inspector
surface. Add the complete Accessibility Inspector slice next, then continue widget value/option and
event-binding fields plus the remaining cohesive canvas overlays without entering M6.

## Scope and acceptance criteria

- [x] Expose strict Frame layout, sizing, bounds, constraints, and Flow/Absolute placement.
- [x] Expose lossless typography, fill, stroke, per-corner radius, finite opacity, and Image fit.
- [x] Parse every style candidate as a complete strict document before mutation.
- [x] Reject empty, non-finite, and out-of-range numeric style drafts without mutation or history.
- [x] Restore discrete style edits with one exact Undo and group each scrub under one fresh Undo.
- [ ] Expose every serialized accessibility field and required accessible-name/decorative coupling.
- [ ] Expose widget-specific values/options and compatible event bindings.
- [ ] Add remaining cohesive padding, gap, insertion, and overflow canvas overlays.
- [ ] Run final user-Chrome acceptance only after the complete Inspector surface.

## Required context

- `docs/ui-editor-figma-development-plan.md` — serialized model, M5, and DoD sections only.
- `docs/handoffs/UI-M5-ROLL-04.md`
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx` — `UIInspector` and Inspector section components.
- `packages/editor/src/ui/ui-inspector-model.ts`
- `packages/editor/src/ui/ui-inspector-model.test.ts`
- `packages/editor/src/ViewportTabsShell.test.tsx` — current UI Inspector tests only.
- `packages/ui/src/schema.ts` — accessibility fields and `validateElementSemantics` only.
- `packages/ui/src/schema.test.ts` only if a shared accessibility invariant changes.

## Decisions and invariants

- `updateUIElementStyle` merges or intentionally removes optional properties, then delegates to the
  existing whole-document strict update. Failed style candidates leave the source asset unchanged.
- Typography is shown only for text-bearing element kinds; Image fit is shown only for Images.
  Fill, stroke, radius, and opacity remain available wherever the shared base style schema applies.
- Optional numeric style properties retain serialized absence through explicit Default/Custom
  controls. Custom mode starts from a meaningful finite value; it does not mutate on render.
- Text and paint strings remain local drafts until blur or Enter. Escape restores the serialized
  value. Empty blur intentionally removes the optional property as one command.
- Scalar radius is displayed losslessly as four equal corners. Editing a corner expands it to the
  four-corner object while preserving the other three values.
- Style numeric inputs use `NumberField` with `clampOnBlur={false}` so out-of-range drafts restore
  the prior value rather than being silently clamped into a different valid style.
- Every numeric scrub starts a fresh `ui-style-*` history group; all strict intermediate documents
  in one scrub merge into exactly one Undo operation.
- Protected user paths remain outside reads, formatting, staging, and commits.

## Completed

- Added RED then GREEN pure coverage for lossless typography/paint/stroke/opacity/Image-fit edits,
  optional reset semantics, type applicability, strict invalid-number rejection, and scalar radius
  expansion.
- Added RED then GREEN panel coverage for every requested style control, meaningful optional
  defaults, inapplicable typography/Image-fit absence, invalid draft/no-history behavior, strict
  output, exact discrete Undo, and one grouped Undo per scrub.
- Added a memoized Style Inspector section using existing field conventions and strict asset
  replacement.
- Extended `NumberField` with opt-in no-clamp blur behavior while preserving its existing default.

## Files changed

- `packages/editor/src/ui/ui-inspector-model.ts`: strict style merge/reset, per-corner radius, and
  semantic section applicability helpers.
- `packages/editor/src/ui/ui-inspector-model.test.ts`: pure lossless/invalid/applicability proof.
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`: memoized Style section and optional draft
  controls.
- `packages/editor/src/components/NumberField.tsx`: opt-in rejection instead of blur clamping.
- `packages/editor/src/ViewportTabsShell.test.tsx`: panel controls, strict state, applicability, and
  exact history regressions.

## Local commits

- `bacb3bb` — `Expose strict Frame layout controls`
- `a965b42` — `Add lossless sizing bounds and scrub history`
- `2fbb41a` — `Expose strict UI placement controls`
- `49599b1` — `Expose lossless UI style controls`
- The documentation-only commit containing this rollover follows them.

## Verification evidence

- RED focused run — three missing pure adapter tests and three missing Style-region panel tests
  failed while 35 prior focused tests remained green.
- Additional RED invalid-range run — zero font size was silently clamped before the no-clamp input
  contract; the focused regression passed after implementation.
- `pnpm exec vitest run packages/editor/src/ui/ui-inspector-model.test.ts
packages/editor/src/ViewportTabsShell.test.tsx` — 2 files, 41 tests passed.
- `pnpm --filter @haku/editor test` — 52 files, 225 tests passed.
- `pnpm --filter @haku/ui test` — 4 files, 26 tests passed.
- `pnpm --filter @haku/editor typecheck` and `pnpm --filter @haku/ui typecheck` — passed.
- `pnpm --filter @haku/editor build` and `pnpm --filter @haku/ui build` — passed.
- `pnpm exec eslint` on all five changed TypeScript/TSX files — passed.
- `pnpm exec prettier --check` on all five changed TypeScript/TSX files — passed.
- Browser check — intentionally deferred until the complete M5 Inspector and overlay surface.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD before this documentation commit: `49599b1`
- Editor/UI/handoff scope was clean after the implementation commit. Known protected user work from
  the preceding handoff remains outside reads and commands:
  `M apps/playground/haku.project.json` and `?? apps/playground/public/assets/ui/`.

## Remaining work

- Add a separate memoized Accessibility section for `label`, `description`, `role`, `live`, and
  `tabIndex`, plus Image `decorative`/`alt` coupling and required accessible names.
- Add per-kind memoized value/options sections for Text Input, Text Area, Checkbox, Radio, Switch,
  Select, Slider, Progress, Divider, and List without weakening coupled validations.
- Add compatible event-binding controls filtered by declared event payload and element slot.
- Add editor-only padding/gap/insertion/overflow overlays after their Inspector fields can share the
  current measured-bounds surface cleanly.
- Run user-Chrome acceptance, screenshots/computed bounds, console checks, reset/finalization, and
  final M5 handoff only after the whole Inspector and overlay surface is complete.

## Risks and open defects

- Accessibility, widget-specific values/options, and event bindings still lack complete intentional
  Inspector surfaces; M5 is not complete.
- Existing ad hoc Alt text and Accessible label inputs do not expose the complete strict
  accessibility contract and should be replaced, not duplicated, by the next section.
- Padding, gap, insertion, and overflow overlays remain intentionally deferred.
- No final browser acceptance has started, and the milestone status/DoD must not be marked complete.

## Exact next action

Write RED pure and panel tests for lossless Accessibility editing first: optional `label`,
`description`, `role`, `live`, and `tabIndex` (`0 | -1`), plus Image `decorative`/meaningful `alt`
coupling and required accessible names for Text Input, Text Area, Select, Slider, and Progress.
Require strict whole-document parsing, local text drafts, atomic rejection/no history for invalid
or coupled states, applicable controls with schema-aligned disabled explanations, and exact
one-step Undo for each discrete edit. Then replace the ad hoc Alt text/Accessible label inputs with
a separate memoized Accessibility Inspector section. Do not start widget values/options, events,
remaining overlays, browser acceptance, or M6 in that slice.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- M6 components/instances, M7 dogfood, and unrelated scene/engine subsystems.
