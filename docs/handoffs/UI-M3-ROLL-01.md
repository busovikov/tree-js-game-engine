# Handoff: UI-M3 canvas interaction continuation

## Objective

Finish Milestone 3 browser acceptance from a green implementation savepoint, address the one
remaining cursor-zoom evidence gap without entering M4 or M5, then publish the final M3 plan status
and `UI-M3-01.md` acceptance record.

## Scope and acceptance criteria

- [x] Renderer-backed hit targets and Layers use one editor-only multi-selection model.
- [x] Hidden and editor-locked nodes are not hittable; disabled native widgets remain selectable
      in Edit and receive native input in Preview.
- [x] Selection reconciles through strict asset replacement and restores across delete/undo/redo.
- [x] Bounded pan/zoom math, 100%, Fit root, and Fit selection are implemented and tested.
- [x] Free/absolute move and resize preview live DOM changes without replacing the asset per frame;
      pointerup commits one strict replacement and Escape restores exact inline styles.
- [x] Arrow nudge uses one command per key action; resize changes only deliberately edited axes to
      Fixed px.
- [x] Parent/peer edges, centers, padding, and equal gaps produce prioritized snap candidates;
      platform modifier bypass, parent bounds, and min/max clamping are pure-tested.
- [ ] Record cursor-anchored wheel zoom in user Chrome. The current Ctrl/Meta+wheel implementation
      is green in pure/component tests, but the Chrome CUA scroll call did not retain its modifier.
- [ ] Publish final `docs/handoffs/UI-M3-01.md` and mark only M3 complete in the plan after the final
      browser rerun.

## Required context

- `docs/ui-editor-figma-development-plan.md` — product canvas contract, M3, authoring DoD only.
- `docs/handoffs/UI-M3-ROLL-01.md`
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`
- `packages/editor/src/ui/ui-document-editor-panel.css`
- `packages/editor/src/ui/ui-canvas-transform.ts`
- `packages/editor/src/ui/ui-canvas-selection.ts`
- `packages/editor/src/ui/ui-gesture-transaction.ts`
- `packages/editor/src/ui/ui-authoring-session.ts`
- `packages/editor/src/ViewportTabsShell.test.tsx`

## Decisions and invariants

- Selection, locked IDs, gesture drafts, guides, preview mode, viewport, and canvas transform are
  editor-only and absent from serialized UI JSON.
- The primary selection is the last selected ID. Shift toggles only siblings with a common parent;
  an invalid cross-space toggle becomes a single selection.
- Runtime nodes are not remounted when selection alone changes, preserving native state and focus.
- Only `free` and `absolute` placement can start a move/resize gesture. Flow children remain
  selectable but show no misleading free-move behavior; auto-layout reorder remains M4.
- Pointer previews modify live runtime inline styles and editor overlays only. Pointerup calls one
  strict `replaceAsset`; cancel restores the exact captured style string without a command.
- Snap priority is parent edge, peer edge, center, parent padding, then equal gap. Ctrl/Meta bypasses
  snapping while a gesture is active.
- Resize handles explicitly convert only their edited axes to Fixed px. M5 Inspector field behavior
  and its two existing `it.fails` cases remain untouched.
- The built-in fixture is now a free-layout document with three positioned siblings so M3 move,
  resize, constraints, and browser evidence are real rather than synthetic.

## Completed

- Added pure hit ordering, overlap cycling, selection reducer, gesture transaction, snapping,
  clamping, sizing-intent, pan, coordinate conversion, and arbitrary-bounds fit helpers with RED→GREEN
  tests.
- Extended `UIAuthoringSession` with shared multi-selection, selection-aware strict commands,
  delete/undo/redo restoration, and editor-only lock state.
- Added editor-only hit targets, selection bounds, eight resize handles, guides, live move/resize,
  one-command commit, cancel, nudge, middle/Space pan routing, bounded wheel zoom routing, and
  100%/Fit shortcuts.
- Kept Preview free of editing overlays; a native widget receives focus and Escape returns to Edit.
- Captured and visually inspected wide and narrow Chrome evidence JPGs.

## Files changed

- `packages/editor/src/ui/ui-canvas-selection.ts`: pure hit order, overlap traversal, and selection.
- `packages/editor/src/ui/ui-gesture-transaction.ts`: pure transaction, snap, clamp, and sizing intent.
- `packages/editor/src/ui/ui-canvas-transform.ts`: pan, document coordinates, and selection fit.
- `packages/editor/src/ui/ui-authoring-session.ts`: shared selection and editor-only lock state.
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`: navigation, hit layer, gestures, overlays, keys.
- `packages/editor/src/ui/ui-document-editor-panel.css`: canvas content, overlays, handles, guides.
- `packages/editor/src/ui/ui-editor-service.ts`: free-layout browser acceptance fixture.
- `packages/editor/src/ViewportTabsShell.test.tsx`: direct selection, input routing, wheel, nudge/undo.
- `docs/handoffs/evidence/UI-M3-*.jpg`: wide and narrow user-Chrome screenshots.

## Local commits

- `3e16347` — `Add the pure UI canvas interaction model`
- `2b6d3eb` — `Add direct UI canvas gestures and overlays`
- `fd6c703` — `Record UI canvas interaction evidence`

## Verification evidence

- RED: four pure/session suites failed on absent modules/APIs; three component tests failed on absent
  hit targets and shortcut routing.
- `pnpm exec vitest run packages/editor/src/ViewportTabsShell.test.tsx
  packages/editor/src/ui/ui-canvas-selection.test.ts
  packages/editor/src/ui/ui-gesture-transaction.test.ts
  packages/editor/src/ui/ui-canvas-transform.test.ts
  packages/editor/src/ui/ui-authoring-session.test.ts` — pass, 5 files / 39 tests.
- `pnpm --filter @haku/editor test` — pass, 50 files / 178 tests.
- `pnpm --filter @haku/editor typecheck` — pass.
- `pnpm --filter @haku/editor build` — pass.
- `pnpm exec eslint` on affected TypeScript/TSX files — pass. CSS is outside the ESLint config.
- User Chrome 1440 × 1000: direct Score selection matched Layers, showed one bound and eight handles
  at 56.16% Fit. A pointer drag committed once; Undo restored top from 291.23 px to exactly 220 px.
  Southeast resize produced 216.02 × 110.93 Fixed px; Undo restored Hug intent. ArrowRight moved the
  centered button exactly 1 px and Undo restored it. `1`, `Shift+1`, and `Shift+2` produced 100%,
  56.17% Fit root, and 608.92% Fit selection. Screenshot: `evidence/UI-M3-wide-selection.jpg`.
- User Chrome Preview: editing hit targets dropped from four to zero; native Continue received focus
  while selection stayed unchanged; Escape restored Edit and all four hit targets.
- User Chrome 900 × 700: Fit root was 32.5%, toolbar overflow was zero, selection/handles remained
  visible. Screenshot: `evidence/UI-M3-narrow-interaction.jpg`.
- User Chrome console: zero warnings/errors. Temporary viewport reset, test tab finalized, local Vite
  server stopped.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- HEAD before this handoff commit: `fd6c703`
- Worktree: only the pre-existing protected user changes remain after committing this handoff:
  `M apps/playground/haku.project.json` and `?? apps/playground/public/assets/ui/`.

## Remaining work

- Prefer changing plain wheel to cursor-anchored zoom (the product contract requires pointer/trackpad
  zoom and reserves middle/Space drag for pan), update the component test to cover an unmodified
  wheel, then rerun focused/typecheck/lint.
- In a fresh Chrome session, verify a plain wheel changes scale while the document point under the
  cursor remains stable. Recheck Space-drag or middle-drag if the fresh browser API exposes a usable
  held-key/button path; otherwise retain the pure/component evidence and state the tool limitation.
- Commit any browser-discovered fix separately, refresh evidence only if appearance changes, run the
  final editor quality matrix, then write `UI-M3-01.md` and mark M3 complete in the plan.

## Risks and open defects

- The Chrome CUA `scroll({ keypress: [...] })` calls produced normal pan for `CTRL`, `Control`, and
  `META`; they did not expose a held modifier to the page. Cursor-anchor math and Ctrl/Meta wheel
  routing are green in pure/component tests, but direct browser evidence is incomplete.
- The browser API exposes complete drag but no separate pointer-down/pointer-up, so Escape during an
  active pointer drag could not be driven directly. Exact cancel is covered by the pure transaction
  test and live DOM style restoration code; Preview Escape was verified in Chrome.

## Exact next action

Change the wheel route in `UIDocumentEditorPanel.tsx` to make ordinary wheel cursor-anchored zoom,
adjust the existing component test to dispatch an unmodified wheel, run its focused suite, and make
a browser-fix commit before opening a fresh user-Chrome acceptance session.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- M4 Layers DnD, palette, rename, visibility/lock UI, create/reparent/reorder.
- M5 Inspector sizing/layout/style fields and its two expected failures.
- Scene/graph/editor panels outside the listed entrypoints and all M6+ work.
