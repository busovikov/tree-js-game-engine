# Handoff: UI-M5 accessibility Inspector rollover

## Objective

Continue Milestone 5 from the verified Frame layout, sizing, placement, style, and Accessibility
Inspector surfaces. Add the complete widget value/option Inspector slice next, then compatible event
bindings and the remaining cohesive canvas overlays without entering M6.

## Scope and acceptance criteria

- [x] Expose strict Frame layout, sizing, bounds, constraints, and Flow/Absolute placement.
- [x] Expose lossless typography, fill, stroke, per-corner radius, finite opacity, and Image fit.
- [x] Expose optional accessibility label, description, role, live region, and `tabIndex` `0 | -1`.
- [x] Enforce required accessible names for Text Input, Text Area, Select, Slider, and Progress.
- [x] Couple Image decorative purpose and meaningful alternative text without invalid intermediate
      documents.
- [x] Parse every accessibility candidate as a complete strict document before mutation.
- [x] Keep text edits in local drafts; reject invalid/coupled drafts without mutation or history.
- [x] Restore every tested discrete accessibility edit with one exact Undo.
- [ ] Expose widget-specific values/options and compatible event bindings.
- [ ] Add remaining cohesive padding, gap, insertion, and overflow canvas overlays.
- [ ] Run final user-Chrome acceptance only after the complete Inspector surface.

## Required context

- `docs/ui-editor-figma-development-plan.md` — serialized model, M5, and DoD sections only.
- `docs/handoffs/UI-M5-ROLL-05.md`
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx` — `UIInspector` and Inspector section components.
- `packages/editor/src/ui/ui-inspector-model.ts`
- `packages/editor/src/ui/ui-inspector-model.test.ts`
- `packages/editor/src/ViewportTabsShell.test.tsx` — current UI Inspector tests only.
- `packages/ui/src/schema.ts` — widget fields and `validateElementSemantics` only.
- `packages/ui/src/schema.test.ts` only if a shared widget invariant changes.

## Decisions and invariants

- Accessibility text stays in local drafts until blur or Enter. Escape restores the serialized
  value without mutation. Optional empty text intentionally removes the property only when the
  complete document remains valid.
- `updateUIElementAccessibility` merges or intentionally removes optional properties, then uses
  `updateUIElementStrict`; failed candidates leave the source asset and history unchanged.
- Accessibility labels preserve authored leading/trailing whitespace when they contain meaningful
  text, but the shared schema rejects whitespace-only labels. This closes the required-name gap
  without a lossy trim transform.
- Text Input, Text Area, Select, Slider, and Progress expose `aria-required` plus the shared-schema
  reason that their accessible label cannot be removed.
- Choosing Decorative clears Image alt text in the same strict command. Committing nonempty alt
  text makes the Image meaningful in the same strict command. Blank meaningful alt text and direct
  Decorative-to-Meaningful conversion without alt are rejected atomically.
- The disabled Meaningful Image-purpose option explains that meaningful alternative text must be
  entered first; the enabled alternative-text draft is the path back to a meaningful Image.
- The separate memoized Accessibility section is the sole surface for accessibility fields. The
  prior ad hoc Alt text and Accessible label inputs were removed.
- Protected user paths remain outside reads, formatting, staging, and commits.

## Completed

- Added RED then GREEN shared-schema coverage for whitespace-only required accessible names across
  all five applicable native controls.
- Added RED then GREEN pure coverage for lossless optional field merge/removal, required-name
  rejection, Image coupling, type applicability, and atomic source preservation.
- Added RED then GREEN panel coverage for local drafts, Escape restoration, all serialized enum
  values, required-name explanations, invalid/no-history behavior, strict state, Image coupling,
  removal of duplicate surfaces, and exact one-step Undo.
- Added the memoized Accessibility Inspector section using existing field conventions and strict
  asset replacement.

## Files changed

- `packages/ui/src/schema.ts`: reject whitespace-only accessibility labels without coercion.
- `packages/ui/src/schema.test.ts`: prove required-name rejection for all five control kinds.
- `packages/editor/src/ui/ui-inspector-model.ts`: strict accessibility merge, Image coupling, and
  applicability explanations.
- `packages/editor/src/ui/ui-inspector-model.test.ts`: pure lossless, invalid, and coupled-state
  coverage.
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`: local draft field reuse and memoized
  Accessibility section replacing both ad hoc fields.
- `packages/editor/src/ViewportTabsShell.test.tsx`: panel controls, strict state, invalid history,
  coupling, applicability, and exact Undo regressions.

## Local commits

- `9e76306` — `Expose strict UI accessibility controls`
- The documentation-only commit containing this rollover follows it.

## Verification evidence

- RED schema/pure run — 13 expected failures: five whitespace-label schema gaps and eight missing
  accessibility helper behaviors; 28 prior tests remained green.
- RED panel run — seven expected Accessibility-region failures while 24 prior panel tests remained
  green.
- `pnpm exec vitest run packages/ui/src/schema.test.ts
packages/editor/src/ui/ui-inspector-model.test.ts packages/editor/src/ViewportTabsShell.test.tsx`
  — 3 files, 72 tests passed.
- `pnpm --filter @haku/editor test` — 52 files, 240 tests passed.
- `pnpm --filter @haku/ui test` — 4 files, 31 tests passed.
- `pnpm --filter @haku/editor typecheck` and `pnpm --filter @haku/ui typecheck` — passed.
- `pnpm --filter @haku/editor build` and `pnpm --filter @haku/ui build` — passed.
- `pnpm exec eslint` on all six changed TypeScript/TSX files — passed.
- `pnpm exec prettier --check` on all six changed TypeScript/TSX files — passed.
- Browser check — intentionally deferred until the complete M5 Inspector and overlay surface.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD before this documentation commit: `9e76306`
- Editor/UI/schema scope was clean after the implementation commit. Known protected user work from
  the preceding handoff remains outside reads and commands:
  `M apps/playground/haku.project.json` and `?? apps/playground/public/assets/ui/`.

## Remaining work

- Add per-kind memoized value/options sections for Text Input, Text Area, Checkbox, Radio, Switch,
  Select, Slider, Progress, Divider, and List without weakening coupled validations.
- Add compatible event-binding controls filtered by declared event payload and element slot.
- Add editor-only padding/gap/insertion/overflow overlays after their Inspector fields can share the
  current measured-bounds surface cleanly.
- Run user-Chrome acceptance, screenshots/computed bounds, console checks, reset/finalization, and
  final M5 handoff only after the whole Inspector and overlay surface is complete.

## Risks and open defects

- Widget-specific values/options and event bindings still lack complete intentional Inspector
  surfaces; M5 is not complete.
- Coupled Select uniqueness/value membership, Slider step/range/value, Progress range/value, Radio
  grouping/value, and positive integer/finite fields require whole-document adapters rather than
  independent field patches.
- Padding, gap, insertion, and overflow overlays remain intentionally deferred.
- No final browser acceptance has started, and the milestone status/DoD must not be marked complete.

## Exact next action

Write RED pure and panel tests for a separate memoized Widget section, starting with all serialized
fields for Text Input and Text Area (`value`, optional `placeholder`, `required`, `readOnly`,
optional positive-integer `maxLength`, plus `inputMode` or positive-integer `rows`/`resize`), then
cover Checkbox (`value`, nonempty `label`), Radio (`group`, `optionValue`, nullable `value`, nonempty
`label`), Switch (`value`, nonempty `label`), Select (nullable `value`, optional `placeholder`, and
ordered nonempty unique-value options with label/disabled), Slider (finite `min/max/value`, positive
finite `step`, aligned in-range value), Progress (finite `min/max`, nullable in-range `value`),
Divider (`orientation`, positive finite `thickness`), and List (`ordered`). Require local string and
option drafts, strict whole-document candidates, applicable controls only, schema-aligned disabled
explanations for coupled states, atomic invalid/no-history behavior, and exact one-step Undo for
each discrete edit or one grouped Undo for numeric scrubs. Do not start event bindings, remaining
overlays, browser acceptance, or M6 in that slice.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- M6 components/instances, M7 dogfood, browser/events/overlays, and unrelated scene/engine
  subsystems.
