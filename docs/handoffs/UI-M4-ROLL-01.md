# Handoff: UI-M4 Layers hierarchy and palette (rollover 1)

## Objective

Finish Milestone 4 Layers DnD, searchable palette, context-aware creation, project-backed Image
selection, user-Chrome acceptance, evidence, plan status, and the final `UI-M4-01.md` handoff without
starting M5.

## Scope and acceptance criteria

- [x] Strict prevalidated reorder/reparent supports before/inside/after, stable multi-move,
      root/cycle/locked/cross-component rejection, and one exact Undo command.
- [x] Free→free preserves position in new parent coordinates; free→auto clears placement;
      auto→free creates deterministic placement; auto sibling reorder preserves flow placement.
- [x] Fresh-ID subtree duplicate, multi-delete, rename, visibility, and editor-only lock operations
      exist through `UIAuthoringSession`.
- [x] Layers rows expose expand/collapse, complete type icons, inline rename, visibility/lock,
      duplicate/delete, shared multi-selection, tree keyboard movement, keyboard structural moves,
      pointer DnD markers/valid target state, and edge auto-scroll.
- [x] Searchable palette exposes all 17 required non-instance M1 kinds. Palette clicks use the
      selected-context creation rule; palette drag to canvas uses pointer Frame, auto insertion
      index, and free parent-relative coordinates.
- [x] Image creation uses typed project manifest texture choices with an explicit empty state and
      never prompts for a UUID.
- [ ] Add any missing focused coverage found during browser acceptance, especially valid pointer
      DnD, expand/collapse tree keys, canvas palette drop, explicit empty chooser, and creation of
      every kind if browser inspection exposes a gap.
- [ ] Complete user Chrome acceptance, screenshots, final full quality rerun, M4 plan status, and
      final `docs/handoffs/UI-M4-01.md`.

## Required context

- `docs/ui-editor-figma-development-plan.md` — Creation rule, Reorder/reparent, M4, relevant DoD.
- `docs/handoffs/UI-M3-01.md`
- This handoff.
- `packages/editor/src/ui/ui-hierarchy-commands.ts`
- `packages/editor/src/ui/ui-authoring-session.ts`
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`
- `packages/editor/src/ui/ui-editor-service.ts`
- `packages/editor/src/ViewportTabsShell.test.tsx`

## Decisions and invariants

- All structural mutations build and parse a complete `UIDocument` before calling the one strict
  `replaceAsset` command. Invalid plans do not change dirty state or `CommandBus` state.
- The move planner operates within document or component scope and rejects cross-scope moves.
  Top-level selected roots are ordered by hierarchy traversal, so caller order cannot scramble a
  multi-move and selected descendants are not moved twice.
- Reparent into auto layout always uses flow placement. Reparent into free layout uses measured
  bounds when available, otherwise deterministic padding/index placement, left/top constraints,
  and finite parent reference size. Fill axes become measured fixed px when required by free layout.
- Layer lock remains editor-only and is neither serialized nor dirty/undo history. Visibility is a
  serialized strict replacement. Root rename/visibility/lock are allowed; root move, duplicate,
  and delete are rejected/disabled.
- Keyboard tree commands are Alt+Up/Down reorder, Alt+Right nest into the previous sibling,
  Alt+Left move out, F2 rename, Cmd/Ctrl+D duplicate, Delete/Backspace delete. Plain arrows navigate
  and expand/collapse. The global canvas nudge handler now ignores arrow events originating in a
  Layers tree item.
- Palette click is keyboard/palette creation after selected sibling or at selected Frame end.
  Palette drag to canvas uses pointer context. Image always opens `listTextureAssets()` choices.
- M5 Inspector sizing/layout/style controls and its two expected failures are untouched.

## Completed

- Added pure hierarchy planning/validation, coordinate/mode conversion, insertion math, fresh-ID
  duplication, and creation target resolution with RED→GREEN tests.
- Added session-level structural and property commands plus exact Undo and invalid-history tests.
- Added typed, sorted project texture listing plus an empty-manifest test.
- Replaced the minimal Layers list with full rows, contextual actions, DnD state/markers,
  auto-scroll, keyboard navigation/reparent alternatives, and shared selection.
- Added a searchable 17-kind palette, canvas drop context, and project texture chooser.
- Added component tests for palette completeness/search, rename/visibility/lock,
  duplicate/delete+Undo, keyboard reorder, invalid DnD feedback, and Image chooser without prompt.

## Files changed

- `packages/editor/src/ui/ui-hierarchy-commands.ts`: pure structural planner, validation,
  coordinate conversion, duplication, and creation target resolution.
- `packages/editor/src/ui/ui-hierarchy-commands.test.ts`: move matrix, insertion order,
  conversions, invalid cases, duplication, and target rule.
- `packages/editor/src/ui/ui-authoring-session.ts`: strict structural/session actions and
  context-aware element creation.
- `packages/editor/src/ui/ui-authoring-session.test.ts`: one-command Undo and invalid-history proof.
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`: Layers, DnD, keyboard tree, palette, canvas
  creation drop, and texture chooser.
- `packages/editor/src/ui/ui-document-editor-panel.css`: Layers markers/actions/palette/chooser.
- `packages/editor/src/services/project-service.ts`: typed texture asset listing.
- `packages/editor/src/services/project-service.test.ts`: texture list and empty state.
- `packages/editor/src/ViewportTabsShell.test.tsx`: component workflow coverage; two M5
  `it.fails` cases remain unchanged.

## Local commits

- `8ed98a9` — `Add strict UI hierarchy editing commands`
- `48577de` — `Add Layers hierarchy and element palette workflows`

## Verification evidence

- RED: focused pure test failed because `ui-hierarchy-commands.js` did not exist and project
  service test failed because `listTextureAssets` did not exist.
- RED: `ViewportTabsShell.test.tsx` failed four new Layers/palette workflows before the UI work.
- `pnpm exec vitest run packages/editor/src/ui/ui-hierarchy-commands.test.ts
  packages/editor/src/ui/ui-authoring-session.test.ts
  packages/editor/src/services/project-service.test.ts` — pass, 3 files / 42 tests.
- `pnpm exec vitest run packages/editor/src/ViewportTabsShell.test.tsx` — pass, 1 file / 14 tests.
- `pnpm --filter @haku/editor test` — pass, 51 files / 197 tests.
- `pnpm --filter @haku/editor typecheck` — pass.
- `pnpm --filter @haku/editor build` — pass.
- Affected TypeScript ESLint command covering the eight structural/service/panel test and source
  files — pass.
- Browser acceptance has not started in this rollover.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD: `48577de`
- Worktree before this handoff commit contains only the pre-existing protected user work and this
  handoff file.
- Protected user work remains `M apps/playground/haku.project.json` and
  `?? apps/playground/public/assets/ui/`; neither path was read, edited, staged, or committed.

## Remaining work

- Use only the user Chrome through `chrome:control-chrome`; do not use in-app or standalone browser.
- Start the editor dev server, then verify reorder, nested reparent, auto-layout sibling reorder,
  invalid cycle feedback/no history, Image creation via a real project texture choice, Undo, and
  keyboard reorder/reparent.
- Verify wide and narrow layouts, Layers auto-scroll if feasible, canvas/layer selection/order
  parity after create/move/duplicate/delete/Undo, and zero unexpected console errors.
- If the current built-in fixture is too shallow, create Frames through the palette (new Frames
  default to vertical auto layout) or minimally extend only `ui-editor-service.ts`; do not read or
  change protected Bounce Run files.
- Save browser screenshots as `docs/handoffs/evidence/UI-M4-*.jpg`, reset any viewport override,
  finalize the Chrome tab, and stop the local server.
- Run final focused/full editor tests, typecheck/build, affected lint, and start/end status.
- Only after all acceptance is green, mark M4 complete/evidence in the plan and create the final
  `docs/handoffs/UI-M4-01.md`. Do not start M5.

## Risks and open defects

- Browser behavior is not yet verified. Native DnD data transfer and pointer thirds need real
  Chrome acceptance even though pure planning and component routing are green.
- The built-in fixture has a free root and three leaf children. It can create a vertical Frame via
  the palette for auto-layout testing, but browser setup may be faster with a narrowly extended
  unprotected fixture.
- Project texture choices depend on the open manifest. The chooser correctly shows an explicit
  empty state when none exist; browser Image acceptance requires a real texture entry exposed by
  the currently open project or a safe unprotected fixture path.

## Exact next action

Start a fresh continuation agent with this handoff, read the Chrome skill completely, inspect
`git status --short --branch`, then run the user-Chrome M4 workflow. Fix only browser-proven M4
gaps with RED tests, commit browser fixes/evidence, and finish the plan plus `UI-M4-01.md`.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- M5 Inspector sizing/layout/style controls and its two expected failures.
- M6 components/instances, M7 Bounce Run dogfood, and unrelated editor/engine panels.
