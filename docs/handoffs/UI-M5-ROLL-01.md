# Handoff: UI-M5 Inspector foundation rollover

## Objective

Continue Milestone 5 from the verified lossless sizing, strict field-update, layout-conversion, and
continuous-history foundation. Complete every serialized v2 layout, sizing, constraint, style,
accessibility, widget value/option/event field in the Inspector and the corresponding canvas
guides, then perform the required user-Chrome viewport acceptance without entering M6.

## Scope and acceptance criteria

- [x] Turn the two existing Inspector sizing `it.fails` regressions into ordinary RED tests and
      make them pass without pixel coercion.
- [x] Add pure field-model sizing adapters, explicit mode legality/explanations, strict whole-
      document updates, measured layout conversion, and continuous command grouping foundations.
- [ ] Expose per-axis Hug/Fill/Fixed, px/%, min/max, and all legal-context explanations completely.
- [ ] Expose Frame Free/Horizontal/Vertical/Grid, wrap, columns, four-side padding, row/column gap,
      distribution, alignment, clipping, and overflow.
- [ ] Expose visual H/V constraints and explicit absolute positioning for auto-layout children.
- [ ] Expose every applicable typography, fill, stroke, corner radius, opacity, image-fit,
      accessibility, widget value/option, and event-binding field with meaningful defaults.
- [ ] Reflect padding, gap, insertion, constraint, and overflow boundaries on the canvas.
- [ ] Prove layout conversion preserves measured bounds as closely as possible and is one undo.
- [ ] Wire numeric scrub lifecycle to a unique history group per gesture and prove one Undo, with no
      NaN or transient invalid document.
- [ ] Run focused/full editor and affected UI runtime/schema checks, typecheck/build/lint, then the
      full browser acceptance and final M5 handoff/evidence.

## Required context

- `docs/ui-editor-figma-development-plan.md` — only serialized model, M5, and relevant DoD sections.
- `docs/handoffs/UI-M4-01.md`
- `docs/handoffs/UI-M5-ROLL-01.md`
- `packages/editor/src/ui/ui-inspector-model.ts`
- `packages/editor/src/ui/ui-inspector-model.test.ts`
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx` — `UIDimensionField`, `UIInspector`, and canvas
  overlay sections only.
- `packages/editor/src/ui/ui-authoring-session.ts`
- `packages/editor/src/ViewportTabsShell.test.tsx`
- `packages/ui/src/schema.ts` — narrow field definitions and `validateTree`/semantic refinements only.

## Decisions and invariants

- Version 2 forbids percentage sizing on the root because it has no host size. The stale M0
  regression row targeted root `...101`; M5 moved the `%` contract to non-root Score `...102` and
  authored that fixture at fixed `100%` instead of weakening strict schema.
- `formatUISize` preserves Fixed px, Fixed %, Hug (`auto` display), and Fill. `parseUISize` accepts
  those explicit forms and rejects non-finite, negative, root-percent, and illegal Fill values.
- `explainUISizeMode` is the shared source for disabled Fill UI and user-facing reasons. Fill remains
  illegal on root and on free-positioned axes.
- `updateUIElementStrict` builds and parses a whole candidate document before one replacement command;
  invalid candidates leave asset/history untouched.
- `convertFrameLayout` carries common layout fields, converts free children to flow for auto layout,
  and uses measured parent/child bounds when auto layout becomes free. Illegal Fill dimensions become
  measured Fixed px; all results pass `UIDocumentSchema` before return.
- Continuous command merging is opt-in by a unique `historyGroup`; commands merge only for the same
  session, path, and group, preserving the first before-state and latest after-state.
- Protected user paths remain outside all reads, formatting, staging, and commits.

## Completed

- Read all mandatory workflow, stage, M4 handoff, M5/model/DoD, TDD, git, Chrome, and edge-case
  instructions before code changes.
- Captured the original RED: `%` displayed as `1280` on the stale root row and Hug as `0`.
- Replaced both expected failures with normal passing rows; the valid `%` regression now targets
  Score and both `%` and `auto` values round-trip through the rendered Inspector input.
- Added five pure model tests covering lossless formatting/parsing, explicit legal/illegal mode
  conversion, measured auto-to-free conversion, strict parse, and atomic invalid rejection.
- Added a session regression proving three updates in one history group undo to the exact pre-edit
  document rather than the penultimate value.
- Integrated initial Width/Height mode/value fields with Hug/Fill/Fixed selects, explicit value text,
  local invalid draft handling, disabled illegal Fill, Escape cancel, and strict committed updates.

## Files changed

- `packages/editor/src/ui/ui-inspector-model.ts`: lossless sizing adapters, legality explanations,
  strict updater, and measured Frame layout conversion.
- `packages/editor/src/ui/ui-inspector-model.test.ts`: field, invalid-state, conversion, and atomicity
  contracts.
- `packages/editor/src/ui/ui-authoring-session.ts`: opt-in continuous history grouping and strict
  updater reuse.
- `packages/editor/src/ui/ui-authoring-session.test.ts`: one continuous edit equals one Undo.
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`: first lossless per-axis sizing controls.
- `packages/editor/src/ui/ui-editor-service.ts`: valid non-root `%` built-in authoring fixture.
- `packages/editor/src/ViewportTabsShell.test.tsx`: normal passing `%` and Hug regression rows.

## Local commits

- `34dcd8f` — `Add lossless UI Inspector sizing model`
- The documentation-only commit containing this rollover follows it.

## Verification evidence

- RED: `pnpm exec vitest run packages/editor/src/ViewportTabsShell.test.tsx -t 'round-trips'` — two
  ordinary failures: `1280` vs `100%` and `0` vs `auto`.
- RED: `pnpm exec vitest run packages/editor/src/ui/ui-inspector-model.test.ts` — missing model module.
- GREEN: same model command — 5 tests passed after the final parser case.
- RED: `pnpm exec vitest run packages/editor/src/ui/ui-authoring-session.test.ts -t 'groups one
  continuous'` — Undo stopped at opacity `0.8` instead of the original empty style.
- GREEN: same grouped-history command — 1 passed.
- `pnpm exec vitest run packages/editor/src/ui/ui-inspector-model.test.ts
  packages/editor/src/ui/ui-authoring-session.test.ts packages/editor/src/ViewportTabsShell.test.tsx
  -t 'round-trips|groups one continuous|UI Inspector field model'` — 3 files, 8 passed.
- `pnpm --filter @haku/editor test` — 52 files, 204 tests passed; no expected-failure sizing rows remain.
- `pnpm --filter @haku/editor typecheck` — passed.
- `pnpm exec eslint` on all seven changed editor files — passed.
- Browser check — intentionally not started for the partial foundation; required only after the full
  Inspector and canvas overlay acceptance surface is complete.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD before this documentation commit: `34dcd8f`
- Worktree before this documentation commit contains only protected user work:
  `M apps/playground/haku.project.json` and
  `?? apps/playground/public/assets/ui/hud.ui.json`.

## Remaining work

- Extend pure tests before each slice: bounds/min-max legality, all layout modes and conversions,
  placement constraints/absolute offsets, style/accessibility/widget adapters, event compatibility,
  and actual scrub lifecycle grouping.
- Split the current local `UIInspector` into small memoized field sections as it grows; keep narrow
  props/selectors and existing field conventions.
- Integrate every schema field listed in the acceptance checklist. Current initial UI handles only
  Name, visible/enabled, text/button content, Image alt, Width/Height mode/value, text/background
  color, and accessible label.
- Add the required editor-only canvas overlays using measured runtime bounds and layout metadata.
- Finish quality matrix, then start Vite and control only the user's Chrome for wide/desktop/narrow
  construction, screenshots, computed bounds, console check, reset/finalize, and server stop.

## Risks and open defects

- `convertFrameLayout` is pure and tested but is not yet called by the Inspector; integration must
  pass the current measured `elementBounds` and commit its returned whole document once.
- History grouping exists at the command boundary but the shared `NumberField`/scrub lifecycle has
  not yet been wired to generate and close per-gesture groups. Do not claim scrub acceptance yet.
- A Fixed value field currently accepts px/% textual syntax while a separate mode select provides
  explicit mode conversion; min/max fields and an explicit Fixed unit selector remain to implement.
- M5 is incomplete and the plan status, final handoff, and browser evidence must not be marked done.

## Exact next action

Write RED tests in `ui-inspector-model.test.ts` for min/max comparable-unit rejection and all four
layout-mode conversions, plus a panel test that changes HUD Root from Free to Horizontal and undoes
the exact document. Then wire `convertFrameLayout` into a Frame Layout section using
`elementBounds`, add wrap/grid/padding/gap/distribution/alignment/overflow controls, run focused
GREEN checks, and commit that layout slice before moving to constraints/style/widget sections.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- M6 components/instances, M7 dogfood, and unrelated scene/engine subsystems.
