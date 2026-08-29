# Handoff: UI-M6 final Chrome acceptance rollover 08

## Objective

Finish Milestone 6 in the user's Chrome after replacing the native component-creation prompt that
blocked the required browser workflow, while preserving the protected playground and Bounce Run
files and keeping M7 out of scope.

## Scope and acceptance criteria

- [x] Reproduce the browser-blocking component creation path.
- [x] Replace native component creation prompting with an accessible in-editor dialog.
- [x] Prove empty and duplicate names are rejected without history and successful creation is one
      atomic undoable command.
- [ ] Complete the final M6 user-Chrome workflow from component extraction through nested runtime
      locator evidence, detach, safeguards, wide/narrow screenshots, and a clean console.

## Required context

- `docs/ui-editor-figma-development-plan.md` — Create and reuse a component, Milestone 6, and
  Definition of Done sections only.
- `docs/stage-handoff.md`
- `docs/handoffs/UI-M6-ROLL-08.md`
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx` — component dialog and M6 Inspector only if a
  fresh Chrome retry exposes another defect.
- `packages/editor/src/ViewportTabsShell.test.tsx` — M6 component-panel tests only.

## Decisions and invariants

- Component creation now uses a local, accessible dialog rather than `window.prompt`. The dialog
  captures the selected document root ID and a local name draft, supports Enter/form submission,
  Escape/Cancel, `aria-invalid` plus an associated alert, and leaves the document/history unchanged
  for empty, duplicate, or cancelled candidates.
- Validation remains authoritative in `extractUIComponent`; the dialog only presents its errors.
  A successful candidate still commits through the existing single `replaceAsset` command.
- Component rename continues to use its existing prompt. It was not broadened into this fix because
  the acceptance blocker was component creation and the task required a narrow change.
- Image browser coverage may rely on the existing focused Inspector tests in this run: the selected
  built-in demo declares no texture assets, and Chrome file upload is unavailable until the ChatGPT
  browser extension is granted file-URL access. No project or UI JSON was edited to bypass that
  limitation.
- The protected paths remain excluded and were never read, touched, staged, formatted, saved, or
  reset: `apps/playground/haku.project.json`, `apps/playground/public/assets/ui/**`,
  `apps/bounce-run/tsconfig.json`, and `apps/bounce-run/.haku/**`.

## Completed

- Started a fresh editor dev server at `http://localhost:5175/` because port 5174 was already in use.
- Opened a fresh user-Chrome tab, loaded the in-memory `Runtime HUD` built-in, confirmed Save was
  disabled, and created a `Card Source` Frame with `Card Label` and `Card Action` children entirely
  through Layers, palette, and Inspector controls without JSON editing.
- Confirmed Add Image presents the explicit no-texture state. A temporary non-project screenshot
  asset was offered through the real Import file chooser, but Chrome rejected `setFiles` because the
  extension lacks file-URL permission; the scratch file was not imported or saved.
- Reproduced the component creation blocker: `Create component` opened `window.prompt`, after which
  Chrome's documented dialog API and direct keyboard control both stalled. Added a focused failing
  test before implementation.
- Replaced component creation prompting with an accessible in-editor dialog and expanded the panel
  test to cover native-prompt exclusion, local draft, empty and unique validation, Cancel, Enter/form
  submit, atomic Undo, and unchanged history on rejection.
- Captured the last controllable pre-prompt wide Chrome state at
  `docs/handoffs/evidence/UI-M6-card-source-before-native-prompt.jpg`.

## Files changed

- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`: accessible component-creation dialog and strict
  submit/error/cancel flow.
- `packages/editor/src/ui/ui-document-editor-panel.css`: narrow dialog layout using existing editor
  colors and spacing.
- `packages/editor/src/ViewportTabsShell.test.tsx`: RED/GREEN dialog, validation, history, and
  no-native-prompt coverage.
- `docs/handoffs/evidence/UI-M6-card-source-before-native-prompt.jpg`: user-Chrome evidence before the
  native prompt locked the browser-control session.
- `docs/handoffs/UI-M6-ROLL-08.md`: this rollover record.

## Local commits

- `58af585` — `Replace component creation prompt with accessible dialog`
- The documentation/evidence commit containing this handoff follows.

## Verification evidence

- RED: `pnpm exec vitest run packages/editor/src/ViewportTabsShell.test.tsx -t "accessible validated
dialog" --reporter=dot` — failed because no accessible `Create component` dialog existed.
- GREEN: the same focused command — pass, 1 test / 71 skipped.
- `pnpm exec vitest run packages/editor/src/ViewportTabsShell.test.tsx -t "creates a
component|accessible validated dialog" --reporter=dot` — pass, 2 tests / 70 skipped.
- `pnpm exec vitest run packages/editor/src/ui/ui-authoring-session.test.ts
packages/editor/src/ViewportTabsShell.test.tsx --reporter=dot` — pass, 2 files / 101 tests.
- `pnpm --filter @haku/editor typecheck` — pass.
- `pnpm --filter @haku/editor build` — pass.
- `pnpm exec eslint packages/editor/src/ui/UIDocumentEditorPanel.tsx
packages/editor/src/ViewportTabsShell.test.tsx` — pass.
- `git diff --check` — pass before the implementation commit.
- Browser check — partial. The pre-prompt authoring path was visually verified in user Chrome. The
  old native prompt remained browser-modal after the source fix and blocked control of both that tab
  and newly requested tabs, so the post-fix Chrome workflow could not safely continue in this stage.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD before this documentation commit: `58af585`
- Worktree before the documentation/evidence commit contained only protected user work plus the new
  handoff and JPG evidence.
- The editor server launched by this stage was stopped before handoff.

## Remaining work

- In Chrome, manually dismiss or close the stale native `Component name` prompt/tab left by the old
  build so the browser extension can control fresh tabs again.
- Start the editor, open a fresh Chrome tab, and repeat creation through the new in-editor dialog.
- Create a card/button master, place at least two instances contextually, select the second instance,
  and record its exact owning instance path before entering the master.
- Apply allowed text/style/accessibility/event/widget overrides with indicators; reset one and all
  with Undo/Redo.
- Edit the master through layout conversion, nested placement/constraint, typography, corners,
  Image fit/accessibility where safely available, and a compatible event binding. Prove both
  instances refresh while type-valid runtime value and focus persist; prove an invalidating edit is
  rejected without history.
- Add a nested instance and verify the runtime event source contains the complete slash-separated
  outer/nested instance path and source element ID.
- Detach the overridden instance, verify equivalent concrete output with fresh IDs and exact
  selection across one Undo/Redo, then verify duplicate/rename/delete safeguards and atomic history.
- Capture wide and narrow `UI-M6-*.jpg` screenshots, locator/computed evidence, and zero unexpected
  console errors. Reset the viewport, discard the in-memory scratch, close all controllable created
  Chrome tabs, and stop the server.
- Only after that workflow and the final quality matrix are green may M6 be marked complete and
  obsolete `UI-M6-ROLL-01.md` through `UI-M6-ROLL-08.md` be consolidated.

## Risks and open defects

- A JavaScript prompt opened by the pre-fix tab remained modal at the Chrome-browser level. The
  browser control surface could neither accept nor close it, and it prevented fresh-tab control. This
  is stale runtime state, not evidence that the new in-editor dialog fails.
- Image upload cannot be automated in the current Chrome extension configuration until file-URL
  access is enabled. Do not bypass this by touching protected project/UI JSON.
- The large panel and shell test retain known whole-file Prettier baseline differences. New sections
  were formatted manually without unrelated whole-file reformatting.

## Exact next action

Have the user dismiss or close the stale native component-name prompt in Chrome. Then start a fresh
agent at this handoff, launch the editor, open a new Chrome tab, create the component through the new
accessible dialog, and immediately verify two instances plus the exact second-owner path before
continuing the remaining workflow.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- `apps/bounce-run/tsconfig.json`
- `apps/bounce-run/.haku/**`
- M7 Bounce Run dogfood, M8 graph wiring, M9 stabilization, scene/engine/physics/audio systems, and
  unrelated editor panels.
