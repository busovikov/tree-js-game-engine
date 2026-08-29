# Handoff: UI-M6 component-master Inspector adapters rollover 07

## Objective

Finish Milestone 6 from the now-complete component-master Inspector adapter surface through the
final user-Chrome component workflow, without entering M7 or changing protected playground and
Bounce Run user files.

## Scope and acceptance criteria

- [x] Route Frame layout-mode conversion through the active component tree and active bounds.
- [x] Route nested free/absolute placement and constraints through the correct component parent.
- [x] Route the complete shared Style surface through component scope, including typography,
      per-corner radius, and Image fit.
- [x] Route the complete shared Accessibility surface through component scope, including role,
      live region, tab order, and Image alt/decorative behavior.
- [x] Route compatible Events through document declarations while preserving strict invalid-candidate
      and instance-override diagnostics.
- [x] Preserve one atomic strict whole-document command for every accepted Inspector candidate and no
      history for rejected candidates.
- [x] Keep explicit instance ownership for multiple and nested master navigation paths.
- [ ] Complete the final M6 Chrome workflow.

## Required context

- `docs/ui-editor-figma-development-plan.md` — Create and reuse a component, Milestone 6, and
  Definition of Done sections only.
- `docs/stage-handoff.md`
- `docs/handoffs/UI-M6-ROLL-07.md`
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx` — component locator and Inspector rendering only.
- `packages/editor/src/ui/ui-authoring-session.ts` — `inspectionInstancePath` behavior only if the
  Chrome workflow exposes a locator defect.
- `packages/editor/src/ViewportTabsShell.test.tsx` — component-master adapter tests only.

## Decisions and invariants

- The Inspector uses one synthetic strict edit-tree document: the active root/elements replace the
  document tree, document event/theme declarations remain available, and the active component is
  omitted from the synthetic Components collection to preserve global ID uniqueness. The existing M5
  control surface is reused unchanged rather than duplicated for masters.
- Inspector helpers may validate the synthetic tree, but accepted candidates commit only through
  `UIAuthoringSession.replaceEditTreeElements`. That seam reconstructs the real document at the active
  scope, performs full `UIDocumentSchema` validation plus component override-invalidation diagnostics,
  then emits one `ReplaceUIDocumentCommand`.
- Rejected candidates fail before command creation. Asset, selection, edit scope, and history remain
  unchanged.
- Widget fields retain their established scoped `session.updateElement` path. Document Widget behavior
  remains unchanged.
- Active Inspector bounds start with a complete active-tree fallback and overlay measured bounds for
  matching source IDs. Component runtime measurement resolves the explicit
  `UIDocumentInstance.getInstanceElement({ instancePath, sourceElementId })` locator.
- Entering a master through a selected instance records that exact instance. Entering a nested master
  through a selected nested source instance appends it to the outer runtime path. Exiting restores the
  prior path and selection. Collection-open without an explicitly selected matching instance retains
  the existing first top-level owner fallback for compatibility.
- The selected document-instance override Inspector remains intentionally compact. Structural and
  complete style/accessibility editing belongs to the shared master Inspector.

## Completed

- Added a strict active edit-tree replacement seam to the authoring session.
- Added explicit direct and nested runtime instance-path tracking across master enter/exit and invalid
  scope reconciliation.
- Reused the complete Frame layout, sizing, placement, Widget, Events, Style, and Accessibility
  Inspector against the active master tree.
- Made layout conversion and nested placement/constraints consume active-tree fallback/measured bounds.
- Made master preview measurement resolve source DOM through the explicit owning instance path.
- Added component-master panel coverage for a second top-level owner, Frame auto/free conversion,
  Absolute placement, nested free constraints, typography, corner radius, Image fit, ARIA role/live/
  tab order, Image purpose/alt, compatible Events, invalid event candidates, Undo, and strict parsing.
- Added session coverage for nested owner paths and an override-invalidating whole-tree candidate with
  unchanged history.

## Files changed

- `packages/editor/src/ui/ui-authoring-session.ts`: strict active-tree replacement seam and explicit
  direct/nested inspection instance paths.
- `packages/editor/src/ui/ui-authoring-session.test.ts`: nested owner restoration and invalid
  edit-tree atomicity coverage.
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`: shared active-tree Inspector document, bounds,
  helper commits, diagnostics, runtime locator measurement, and locator presentation.
- `packages/editor/src/ViewportTabsShell.test.tsx`: multi-owner component-master adapter fixture and
  panel coverage.
- `docs/handoffs/UI-M6-ROLL-07.md`: this rollover record.

## Local commits

- `74cabd1` — `Record M6 instance authoring rollover`
- `f013c9a` — `Add strict UI edit-tree replacement seam`
- `fa7923d` — `Adapt UI Inspector to component edit trees`
- The documentation commit containing this handoff follows the implementation commits.

## Verification evidence

- Focused RED after correcting master entry through the UI: `pnpm exec vitest run
packages/editor/src/ViewportTabsShell.test.tsx -t "selected owning instance|complete Style|filters
master Events" --reporter=dot` — 3 failed / 68 skipped: locator chose the first owner, Style helpers
  reported an unknown document element, and Events did not mutate the master.
- Focused GREEN: `pnpm exec vitest run packages/editor/src/ui/ui-authoring-session.test.ts
packages/editor/src/ViewportTabsShell.test.tsx --reporter=dot` — pass, 2 files / 100 tests.
- `pnpm --filter @haku/ui test` — pass, 5 files / 38 tests.
- `pnpm --filter @haku/ui typecheck` — pass.
- `pnpm --filter @haku/ui build` — pass.
- `pnpm --filter @haku/editor test` — pass, 54 files / 341 tests.
- `pnpm --filter @haku/editor typecheck` — pass.
- `pnpm --filter @haku/editor build` — pass.
- Targeted ESLint over all four changed TypeScript/TSX files — pass.
- `git diff --check` — pass.
- Targeted Prettier check — both session files pass; the large panel and shell test retain their known
  whole-file baseline mismatches. New sections were manually aligned without unrelated reformatting.
- Browser check — intentionally not run; this handoff is the exact fresh Chrome entry and M6 remains
  incomplete until the workflow below is recorded.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD before this documentation commit: `fa7923d`
- Worktree before this handoff contained only protected user work outside commits:
  `M apps/bounce-run/tsconfig.json`, `M apps/playground/haku.project.json`,
  `?? apps/bounce-run/.haku/`, and `?? apps/playground/public/assets/ui/`.

## Remaining work

- Run the complete M6 Chrome workflow in a fresh browser agent: create a button/card master, place at
  least two instances, override one, edit the master through the complete Inspector, reset one field
  and all fields, detach, and Undo/Redo every atomic action.
- Include a nested component instance and verify the emitted runtime event source locator contains the
  complete outer/nested instance path and source element ID.
- Verify master layout conversion, a nested placement/constraint edit, typography/corner/Image-fit,
  Image accessibility, and a compatible event binding visibly survive preview and Undo/Redo.
- Record zero unexpected console errors. If Chrome exposes a defect, return only to the narrow files
  listed above, add RED coverage, implement a verified fix, and repeat the affected browser step.
- Do not mark M6 complete or start M7 until this browser evidence is captured.

## Risks and open defects

- Opening a component from the collection while no matching instance is explicitly selected retains
  the historical first top-level owner fallback. Instance-origin navigation is exact, including
  multiple and nested owners; prefer it for locator verification.
- Component canvas hit targets and direct manipulation outside the Inspector were not expanded in
  this slice. The final Chrome workflow should use Layers for deterministic master source selection.
- Current Prettier configuration would reformat substantial pre-existing content in the large panel
  and test files; do not mix that cleanup into M6 evidence or a browser defect fix.

## Exact next action

Start the editor in a fresh Chrome-capable agent without reading or changing protected paths. Open or
create a writable non-protected UI asset, create a button/card component with nested content, place two
instances, and begin recording the complete workflow above. Select the second instance before entering
its master, confirm `data-haku-ui-instance-path` identifies that exact owner, then add a nested instance
and verify the slash-separated runtime path during event emission. Capture Undo/Redo and console
evidence, write the final M6 handoff, and keep M7 out of scope.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- `apps/bounce-run/tsconfig.json`
- `apps/bounce-run/.haku/**`
- M7 Bounce Run dogfood, M8 graph wiring, M9 stabilization, scene/engine/physics/audio systems, and
  unrelated editor panels.
