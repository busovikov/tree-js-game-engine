# Handoff: UI-M4 Layers hierarchy and palette (rollover 2)

## Objective

Finish the remaining Milestone 4 browser acceptance, final quality matrix, plan update, and final
`UI-M4-01.md` without starting M5. This continuation begins after a Chrome-proven empty-Frame
pointer-drop defect was fixed and committed.

## Scope and acceptance criteria

- [x] Layers/canvas selection parity; inline rename; visibility; editor-only lock; multi-select;
      duplicate/delete/Undo were verified in user Chrome.
- [x] Pointer sibling reorder, pointer nested reparent, auto-layout sibling reorder, and keyboard
      reparent were verified in user Chrome.
- [x] Empty Frame center-drop defect has focused RED→GREEN coverage and a Chrome recheck.
- [x] Project-backed Image chooser explicit empty state was verified without a UUID prompt.
- [ ] Finish invalid cycle/root/locked-drop feedback browser proof, keyboard navigation/reorder/
      reparent matrix, palette search/all-kind creation, canvas palette drop, narrow layout,
      auto-scroll if feasible, and console inspection.
- [ ] Run final focused/full quality checks, preserve both M5 `it.fails`, update the M4 plan, and
      create final `docs/handoffs/UI-M4-01.md`.

## Required context

- `docs/stage-handoff.md`
- `docs/handoffs/UI-M4-ROLL-01.md`
- This handoff.
- `docs/ui-editor-figma-development-plan.md` — Creation rule, Reorder/reparent, M4, relevant DoD.
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`
- `packages/editor/src/ViewportTabsShell.test.tsx`

## Decisions and invariants

- Use only the user Chrome through `chrome:control-chrome`; never the in-app browser or a
  standalone Playwright browser.
- Protected user paths remain excluded: `apps/playground/haku.project.json` and
  `apps/playground/public/assets/ui/**` must not be read, changed, staged, or formatted.
- Explicit-path staging only; never `git add .` or `git add -A`.
- Empty Frame center thirds are valid `inside` targets. Before commit `07e1338`, pointer nesting
  into an empty Frame was impossible because `dropPosition` tested `children.length` instead of
  the target kind.
- The built-in demo manifest has no texture entries. Its explicit empty chooser is accepted
  browser evidence; the existing component test covers a real typed project texture choice.

## Completed

- Confirmed rollover commits and protected worktree state.
- Verified wide Chrome row/canvas operations and structural ordering.
- Created a Frame, nested free children into its default auto layout, and reordered its siblings.
- Browser-discovered the empty-Frame pointer-drop defect, added a failing focused component test,
  changed the center-zone rule to use `item.type === 'frame'`, and reverified it in Chrome.
- Captured required JPEG evidence for nested DnD and Image empty state.

## Files changed

- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`: empty Frames now expose an inside drop zone.
- `packages/editor/src/ViewportTabsShell.test.tsx`: regression test for center-drop into an empty
  Frame with Undo cleanup.
- `docs/handoffs/evidence/UI-M4-wide-dnd.jpg`: wide hierarchy/canvas nested-reorder evidence.
- `docs/handoffs/evidence/UI-M4-image-empty.jpg`: explicit project texture empty-state evidence.
- `docs/handoffs/UI-M4-ROLL-02.md`: this continuation record.

## Local commits

- `8ed98a9` — `Add strict UI hierarchy editing commands`
- `48577de` — `Add Layers hierarchy and element palette workflows`
- `337776e` — `Record the UI M4 rollover state`
- `07e1338` — `Fix empty Frame pointer reparenting`

## Verification evidence

- RED: `pnpm exec vitest run packages/editor/src/ViewportTabsShell.test.tsx -t "reparents a
  layer into an empty Frame"` — failed because `Expand Frame` did not exist after the drop.
- GREEN: the same focused command — pass, 1 passed / 14 skipped.
- `pnpm exec vitest run packages/editor/src/ViewportTabsShell.test.tsx` — pass, 15 tests.
- User Chrome wide — selection parity, rename/visibility with Undo, editor-only lock without
  history, multi-select, duplicate/delete+Undo, pointer reorder/nested reparent, auto-layout
  reorder, keyboard nesting, empty-Frame fix recheck all passed.
- User Chrome Image — dialog showed `No texture assets in the project manifest.`, disabled
  `No textures available`, and status `No project texture assets are available`; no prompt.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD before the evidence/handoff docs commit: `07e1338`
- Protected user work remains present and untouched.
- The only intended uncommitted files before the docs commit are this handoff and two M4 JPEGs.

## Remaining work

- Start the editor server again and reopen the built-in UI workspace through `Try a demo` → `UI`.
- Palette attempt was interrupted after clearing the search because the left panel had retained a
  scroll/hover state and `Add Frame` was not visible to the locator. Reload first, then verify
  search and all 16 non-Image kinds in a clean fixture; Image empty-state is already proven.
- Exercise palette drag to canvas and verify selected-parent/pointer context plus Undo.
- Complete keyboard Arrow expand/collapse/navigation, Alt+Up/Down/Left/Right and F2/delete/
  duplicate alternatives.
- For invalid drops, use a non-empty Frame target for cycle detection and a separately locked
  sibling Frame. Verify explicit error status and prove no history by a single Undo reverting the
  last valid setup action. Root is non-draggable and root duplicate/delete are disabled.
- Test narrow viewport, Layers auto-scroll if feasible, inspect console logs, capture final JPEG.
- Reset viewport, finalize the Chrome tab, stop the server, then run focused tests, full editor
  test, typecheck, build, and affected lint.
- Confirm both M5 `it.fails`, mark M4 complete with evidence, create `UI-M4-01.md`, and remove
  obsolete rollover handoffs only in the final documentation commit if appropriate.

## Risks and open defects

- No known implementation defect remains after `07e1338`; the remaining items are acceptance and
  finalization work.
- Chrome synthetic DnD sometimes needs single selection and a multi-point drag path. Re-read row
  rectangles immediately before each drag and inspect order/status after every interaction.
- The demo project has no safe texture fixture. Do not create one unless final acceptance truly
  requires it; explicit empty-state browser evidence plus the typed chooser component test is the
  current safe proof.

## Exact next action

Read this handoff, inspect status without opening protected files, start the editor dev server,
reload a clean built-in UI fixture in user Chrome, and finish the palette/all-kind plus canvas-drop
checks before the invalid/keyboard/narrow matrix.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- M5 Inspector sizing/layout/style controls and its two expected failures.
- M6 components/instances, M7 Bounce Run dogfood, and unrelated engine/editor panels.
