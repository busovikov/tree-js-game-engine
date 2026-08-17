# Handoff: UI-M5 widget value/options Inspector rollover

## Objective

Continue Milestone 5 from the verified Frame, placement, style, accessibility, and widget
value/options Inspector surfaces. Add compatible serialized event-binding controls next, then the
remaining cohesive canvas overlays without entering M6.

## Scope and acceptance criteria

- [x] Expose strict Frame layout, sizing, bounds, constraints, and Flow/Absolute placement.
- [x] Expose lossless typography, fill, stroke, per-corner radius, finite opacity, and Image fit.
- [x] Expose strict accessibility fields and coupled Image purpose/alternative text.
- [x] Expose every serialized Text Input, Text Area, Checkbox, Radio, Switch, Select, Slider,
      Progress, Divider, and List value/option field through a separate memoized Widget section.
- [x] Keep string and Select-option edits in local drafts; reject invalid drafts without mutation
      or history.
- [x] Parse every widget candidate as a complete strict document before replacement.
- [x] Restore tested discrete widget edits with one exact Undo and group a numeric scrub into one
      Undo.
- [ ] Expose compatible event bindings filtered by element slot and declared payload.
- [ ] Add remaining cohesive padding, gap, insertion, and overflow canvas overlays.
- [ ] Run final user-Chrome acceptance only after the complete Inspector surface.

## Required context

- `docs/ui-editor-figma-development-plan.md` — runtime event API, M5, and DoD sections only.
- `docs/handoffs/UI-M5-ROLL-06.md`
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx` — `UIInspector` and memoized Inspector
  sections only.
- `packages/editor/src/ui/ui-inspector-model.ts`
- `packages/editor/src/ui/ui-inspector-model.test.ts`
- `packages/editor/src/ViewportTabsShell.test.tsx` — current UI Inspector tests only.
- `packages/ui/src/schema.ts` — event schemas, `EVENT_PAYLOADS`, and event semantic validation only.

## Decisions and invariants

- Widget string values, labels, groups, option values, placeholders, and Select option values/labels
  stay in local drafts until blur or Enter. Escape restores the serialized value without mutation.
- `updateUIElementWidget` creates one complete candidate and parses it through `UIDocumentSchema`;
  failures preserve the source asset and command history.
- Text Input and Text Area initial values may not exceed an authored `maxLength`. The shared schema
  now enforces the same relation already used by runtime instance overrides.
- Renaming a selected Radio option updates the shared group value atomically across every Radio in
  that group. Changing the selected Radio value also updates the group atomically.
- A selected Select option cannot be renamed or removed until another value or None is selected.
  The sole option cannot be removed. These disabled states explain the shared-schema membership and
  nonempty-option invariants.
- Slider range/value/step alignment, Progress range/value, Select membership/uniqueness, Radio group
  consistency, positive integer fields, and positive/finite numeric fields remain authoritative in
  the shared schema. The Inspector never clamps or persists an invalid transient candidate.
- Every widget numeric label uses a per-gesture history group; discrete controls remain independent
  commands.
- The Widget section renders only for the ten kinds with serialized value/option fields. Button and
  unrelated primitives do not receive an empty Widget section.
- Protected user paths remain outside reads, formatting, staging, and commits.

## Completed

- Added RED then GREEN shared-schema coverage for Text Input/Text Area `value` and `maxLength`
  coupling.
- Added RED then GREEN pure-model coverage for every serialized field across all ten applicable
  kinds, invalid atomic candidates, and Radio selected-option propagation.
- Added RED then GREEN panel coverage for local drafts/Escape, applicable-only controls, all Text
  Input modes, Text Area options, boolean and nullable values, Select option authoring and guards,
  invalid/no-history behavior, exact discrete Undo, and grouped numeric scrub Undo.
- Added the separate memoized Widget Inspector section using existing field and history conventions.

## Files changed

- `packages/ui/src/schema.ts`: enforce Text Input/Text Area initial value length against
  `maxLength`.
- `packages/ui/src/schema.test.ts`: prove the new coupled invariant for both text control kinds.
- `packages/editor/src/ui/ui-inspector-model.ts`: add strict widget candidate updates and atomic
  Radio group propagation.
- `packages/editor/src/ui/ui-inspector-model.test.ts`: cover every widget field and coupled invalid
  state.
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`: add local required drafts and the memoized
  Widget section with per-kind controls and Select option authoring.
- `packages/editor/src/ViewportTabsShell.test.tsx`: cover visible controls, local drafts, guards,
  strict state, history, and numeric grouping.

## Local commits

- `ec25795` — `Expose strict UI widget controls`
- The documentation-only commit containing this rollover follows it.

## Verification evidence

- RED focused run — 3 files, 97 tests: 24 expected failures and 73 prior tests passed. Failures
  comprised two shared-schema gaps, eleven missing pure widget-adapter cases, and eleven absent panel
  surfaces.
- `pnpm exec vitest run packages/ui/src/schema.test.ts
packages/editor/src/ui/ui-inspector-model.test.ts packages/editor/src/ViewportTabsShell.test.tsx
--reporter=dot` — 3 files, 99 tests passed.
- `pnpm --filter @haku/editor test` — 52 files, 265 tests passed.
- `pnpm --filter @haku/ui test` — 4 files, 33 tests passed.
- `pnpm --filter @haku/editor typecheck` and `pnpm --filter @haku/ui typecheck` — passed.
- `pnpm --filter @haku/editor build` and `pnpm --filter @haku/ui build` — passed.
- `pnpm exec eslint` on all six changed TypeScript/TSX files — passed.
- `pnpm exec prettier --check` on all six changed TypeScript/TSX files — passed.
- Browser check — intentionally deferred until the complete M5 Inspector and overlay surface.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD before this documentation commit: `ec25795`
- Editor/UI/schema scope was clean after the implementation commit. Known protected user work
  remains outside reads and commands: `M apps/playground/haku.project.json` and
  `?? apps/playground/public/assets/ui/`.

## Remaining work

- Add compatible per-slot event-binding controls filtered by declared event payload.
- Add editor-only padding/gap/insertion/overflow overlays after the complete Inspector fields can
  share the measured-bounds surface cleanly.
- Run user-Chrome acceptance, screenshots/computed bounds, console checks, reset/finalization, and
  final M5 handoff only after the whole Inspector and overlay surface is complete.

## Risks and open defects

- Event bindings still lack an intentional Inspector surface; M5 is not complete.
- Padding, gap, insertion, and overflow overlays remain intentionally deferred.
- No final browser acceptance has started, and the milestone status/DoD must not be marked complete.

## Exact next action

Write RED pure and panel tests for a separate memoized Events section. Derive only the slots valid
for the selected kind: Frame `focus`/`blur`; Button `activate`; Text Input
`input`/`change`/`submit` plus `focus`/`blur`; Text Area `input`/`change` plus `focus`/`blur`;
Checkbox, Radio, Switch, and Select `change`; Slider `input`/`change`; and no slots for all other
kinds. For each slot, show None plus only document-declared events whose payload matches the strict
slot payload (`none`, `string`, `number`, or `boolean`), preserve exact event IDs, and explain the
disabled/empty state when no compatible declaration exists. Build complete strict candidates,
reject unknown/incompatible bindings atomically with no history, and prove every discrete binding
or clearing edit restores with one exact Undo. Do not create or edit event declarations in this
slice. Do not start overlays, browser acceptance, M6, or any compatibility path.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- M6 components/instances, M7 dogfood, browser/overlays, and unrelated scene/engine subsystems.
