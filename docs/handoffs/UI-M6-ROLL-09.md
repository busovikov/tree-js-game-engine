# Handoff: UI-M6 final Chrome acceptance rollover 09

## Objective

Finish Milestone 6 in the user's Chrome after replacing both browser-blocking native component
prompts, while preserving protected playground and Bounce Run files and keeping M7 out of scope.

## Scope and acceptance criteria

- [x] Create a card/button master through an accessible dialog and place two instances.
- [x] Capture the exact second owning instance path and master provenance.
- [x] Exercise allowed overrides, indicators, reset-one/reset-all, and exact Undo/Redo.
- [x] Exercise complete master Inspector edits, type-valid runtime state preservation, and rejection
      of an invalidating edit without history.
- [x] Place a nested instance and capture full slash-separated runtime locator/source evidence.
- [x] Detach the overridden instance with fresh IDs and exact selection through Undo/Redo.
- [x] Reproduce and replace the browser-blocking component rename prompt with a tested accessible
      dialog.
- [ ] Recheck rename in fresh Chrome, finish delete/cycle safeguards, capture wide/narrow screenshots
      and clean console evidence, discard scratch, and run the final quality matrix.

## Required context

- `docs/ui-editor-figma-development-plan.md` — Create and reuse a component, Milestone 6, and
  Definition of Done sections only.
- `docs/stage-handoff.md`
- `docs/handoffs/UI-M6-ROLL-09.md`
- `docs/handoffs/evidence/UI-M6-ROLL-09-browser-evidence.md`
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx` and
  `packages/editor/src/ViewportTabsShell.test.tsx` only if a fresh Chrome recheck exposes a defect.

## Decisions and invariants

- Component create and rename now both use accessible in-editor dialogs. Validation remains
  authoritative in the authoring session; rejection does not close the dialog or add history.
- The Runtime HUD built-in has no compatible declared events. Browser evidence records exact nested
  runtime instance paths and source IDs; event binding and payload behavior rely on the focused M6
  tests rather than JSON edits.
- Image coverage may continue to rely on focused Inspector tests because Chrome file upload lacks
  file-URL permission and the built-in declares no texture assets.
- The protected paths were never read, touched, staged, formatted, saved, or reset:
  `apps/playground/haku.project.json`, `apps/playground/public/assets/ui/**`,
  `apps/bounce-run/tsconfig.json`, and `apps/bounce-run/.haku/**`.

## Completed

- Started a fresh editor server at `http://localhost:5176/`, opened a fresh controllable user-Chrome
  tab, loaded Runtime HUD, confirmed Save disabled, and completed all browser checks detailed in the
  evidence record through detach.
- Verified second owner path `218d4703-4e36-450c-b630-47cb5923367f`, nested path
  `218d4703-4e36-450c-b630-47cb5923367f/314e980f-f229-4ed6-8bbd-a9ca7efca8c4`,
  nested source `0d058a4b-ea2b-4481-9fbb-a094e1ff12ac`, and detach identity/history.
- Reproduced the native component rename blocker, added a focused RED test, replaced it with the
  accessible dialog, and committed the verified fix.
- Stopped the editor server. No viewport override was applied.

## Files changed

- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`: accessible component rename dialog and strict
  submit/error/cancel flow.
- `packages/editor/src/ViewportTabsShell.test.tsx`: rename dialog validation, cancellation,
  native-prompt exclusion, and atomic Undo/Redo coverage.
- `docs/handoffs/evidence/UI-M6-ROLL-09-browser-evidence.md`: exact Chrome evidence.
- `docs/handoffs/UI-M6-ROLL-09.md`: this rollover record.

## Local commits

- `9b2c2c9` — `Replace component rename prompt with accessible dialog`
- The documentation/evidence commit containing this handoff follows.

## Verification evidence

- RED: `pnpm exec vitest run packages/editor/src/ViewportTabsShell.test.tsx -t "renames components
  through an accessible validated dialog" --reporter=dot` — failed in the native prompt handler.
- GREEN: `pnpm exec vitest run packages/editor/src/ViewportTabsShell.test.tsx -t "accessible
  validated dialog|strict lifecycle controls" --reporter=dot` — pass, 3 tests / 70 skipped.
- `pnpm exec vitest run packages/editor/src/ui/ui-authoring-session.test.ts
  packages/editor/src/ViewportTabsShell.test.tsx --reporter=dot` — pass, 2 files / 102 tests.
- `pnpm --filter @haku/editor typecheck` — pass.
- `pnpm --filter @haku/editor build` — pass.
- `pnpm exec eslint packages/editor/src/ui/UIDocumentEditorPanel.tsx
  packages/editor/src/ViewportTabsShell.test.tsx` — pass.
- `git diff --check` — pass before the implementation commit.
- Browser check — all recorded workflow steps through detach passed. Rename's old native prompt left
  Chrome modal before the source fix could be reloaded; screenshots and console evidence remain.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD before the documentation commit: `9b2c2c9`
- Worktree before the documentation commit contains only the four protected user paths plus this
  handoff and evidence file.
- The fresh editor server on port 5176 is stopped.

## Remaining work

- Manually dismiss or close the stale native `Component name` prompt/tab in Chrome.
- Start the editor, open a fresh Chrome tab, reload the built-in in-memory scratch, and quickly
  recheck accessible rename success plus empty/duplicate rejection, Escape/Cancel, and Undo/Redo.
- Verify component delete safeguards and direct/indirect nested-cycle rejection without history;
  verify a successful unreferenced delete is atomic if the browser setup permits it.
- Capture current wide and narrow `UI-M6-*.jpg` screenshots, computed/locator evidence, and zero
  unexpected console errors. Reset the viewport override afterward (none is currently set).
- Discard the in-memory scratch, close controllable created Chrome tabs, and stop the server.
- Run final UI/editor quality checks with UI build first, then typecheck/build/lint/diff/Prettier
  baseline awareness. Only then mark M6 complete, update `UI-M6-01`, and remove obsolete
  `UI-M6-ROLL-01.md` through `UI-M6-ROLL-09.md` in a documentation/evidence commit.

## Risks and open defects

- The pre-fix native rename prompt remains modal in the user's Chrome. The documented prompt accept
  and recovery API both stalled; do not kill/restart Chrome or switch to the in-app browser.
- The accessible rename fix is fully test-verified but not yet rechecked in Chrome because the stale
  old-build prompt blocks that tab.
- Browser event binding cannot be authored in this built-in because it has no compatible declared
  events; do not mutate JSON to manufacture the precondition.
- The large panel and shell test retain known whole-file Prettier baseline differences. New sections
  were formatted without unrelated whole-file reformatting.

## Exact next action

Have the user dismiss or close the stale native component-name prompt in Chrome, then start a fresh
agent at this handoff and recheck the accessible rename dialog before the remaining safeguards and
screenshot/console pass.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- `apps/bounce-run/tsconfig.json`
- `apps/bounce-run/.haku/**`
- M7 Bounce Run dogfood, M8 graph wiring, M9 stabilization, scene/engine/physics/audio systems, and
  unrelated editor panels.
