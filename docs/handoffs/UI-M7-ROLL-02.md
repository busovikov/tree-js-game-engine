# Handoff: UI-M7 Bounce Run HUD dogfood roll 02

## Objective

Preserve the first editor-authored and editor-saved Bounce Run HUD increment as a verified local
savepoint. M7 remains intentionally incomplete: this roll validates the score/status/progress
slice and records the exact remaining editor work without starting M8.

## Scope and acceptance criteria

- [x] Preserve all existing HUD element IDs, event definitions, and event bindings.
- [x] Name the programmatic runtime targets `Session status`, `Score`, `Best score`, and
      `Route progress` with the required Text/Text/Text/Progress types.
- [x] Add a nested horizontal score Frame and a Fill-width, fixed-height route Progress element.
- [x] Save only through the Chrome editor and verify strict schema/manifest loading.
- [x] Reload the editor route, reopen the asset, and confirm the saved hierarchy survives with
      Save disabled and no new warning/error console entries.
- [ ] Complete the remaining M7 component, Image, input-widget, Play, and viewport proof below.

## Required context

- `docs/ui-editor-figma-development-plan.md` — Milestone 7 and Definition of Done only
- `docs/handoffs/UI-M7-ROLL-01.md`
- `apps/bounce-run/public/assets/ui/hud.ui.json`
- `apps/bounce-run/src/ui-gameplay-adapter.ts`
- `apps/bounce-run/src/ui-document.ts`

## Decisions and invariants

- All future UI document or manifest corrections must be made in the Chrome editor and persisted
  with Save. Reading the saved files is allowed only for verification.
- The protected playground manifest and UI paths remain unread, untouched, unstaged, and
  uncommitted.
- `apps/bounce-run/tsconfig.json` and `apps/bounce-run/.haku/**` remain user-owned unstaged
  baselines. Generated declarations may change only through the editor Code tooling.
- Editor serializer expansion of strict defaults and formatting is accepted. A normalized schema
  comparison found no unintended semantic changes beyond names, authored spacing/alignment, the
  score reparent, and the new progress element.
- Existing UI event definitions and bindings are preserved exactly. Programmatic HUD writes remain
  separate from user-event paths.

## Completed

- Named all 21 existing elements through the editor, including the four runtime lookup targets.
- Added `Score card row`, a horizontal Frame using Fill width, Hug height, 14 px padding,
  space-between distribution, and centered alignment. Existing Score and Best score IDs were
  reparented into it.
- Added `Route progress`, a Progress element with Fill width, fixed 10 px height, `min: 0`,
  `max: 1`, `value: 0`, and an accessible label.
- Increased the existing vertical/horizontal auto-layout gaps and padding for the start, session,
  pause, game-over, and audio areas.
- Saved the document in the editor. The save refreshed manifest metadata, adding empty metadata to
  existing entries and `name: Bounce Run HUD` to the UI asset entry.
- Proved the changed asset assertion RED against the committed 21-element HUD, then GREEN against
  the editor-saved 23-element HUD.
- Reloaded `http://127.0.0.1:5174/?hakuOpenTarget=1`, reopened
  `public/assets/ui/hud.ui.json`, observed breadcrumb `Bounce Run HUD`, the persisted top-level
  hierarchy and route progressbar, disabled Save, and no warning/error entries created during the
  fresh reload/reopen interval.

## Files changed

- `apps/bounce-run/public/assets/ui/hud.ui.json`: editor-saved score/status/progress layout slice.
- `apps/bounce-run/haku.project.json`: editor-refreshed strict manifest metadata.
- `apps/bounce-run/src/assets.test.ts`: strict saved-asset target/type/progress assertions.
- `docs/handoffs/evidence/UI-M7-baseline.jpg`: pre-authoring Chrome evidence; bytes were already
  JPEG and the misleading `.png` suffix was corrected.
- `docs/handoffs/evidence/UI-M7-saved-slice.jpg`: editor-saved slice Chrome evidence; bytes were
  already JPEG and the misleading `.png` suffix was corrected.
- `docs/handoffs/UI-M7-ROLL-02.md`: this recovery record.

## Local commits

- `19011ad` — Author Bounce Run score and progress HUD slice

## Verification evidence

- One-off strict assertion using the changed expectations against `HEAD`'s committed HUD — expected
  RED, `21 !== 23`.
- `pnpm exec vitest run apps/bounce-run/src/assets.test.ts` — pass, 1 file / 1 test.
- `pnpm exec vitest run apps/bounce-run/src/assets.test.ts apps/bounce-run/src/ui-gameplay-adapter.test.ts apps/bounce-run/src/session-runtime.test.ts apps/bounce-run/src/audio-composition.integration.test.ts`
  — pass, 4 files / 11 tests.
- `pnpm --filter @haku/bounce-run typecheck` — pass; the editor-generated declarations under
  `apps/bounce-run/.haku/generated/` were included by the existing TypeScript configuration.
- `pnpm --filter @haku/bounce-run build` — pass; Vite transformed 204 modules. The established
  chunk-size warning remains informational.
- `pnpm exec eslint apps/bounce-run/src/assets.test.ts` — pass.
- `git diff --check -- apps/bounce-run/haku.project.json apps/bounce-run/public/assets/ui/hud.ui.json apps/bounce-run/src/assets.test.ts`
  — pass before the asset commit.
- `UIDocumentSchema.parse` comparison of committed and saved HUDs — both strict-pass; 21 existing
  IDs retained, two IDs added, seven event definitions and every existing binding retained.
- Browser check — fresh full reload/reopen at 1280×720; correct target scene banner, HUD path and
  breadcrumb, top-level hierarchy, progressbar, disabled Save, and zero new warnings/errors.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- HEAD before the documentation commit: `19011ad7ab4f31efe70630d7191df38bf4bcf208`
- Worktree after the asset commit: only the protected/user-owned Bounce Run and playground
  baselines plus this handoff/evidence were uncommitted. The evidence and handoff are committed in
  the separate documentation savepoint that contains this file.
- Preserved SHA-256 values:
  - `apps/bounce-run/tsconfig.json`: `1c472c1017cec742ef2b578bdd1880131337f6bc7dd26d6221ff2ffb43f1c394`
  - `apps/bounce-run/.haku/editor.json`: `2a2fe31cfbb2ed59ccebc0b878b3a547435366c3cccf0cb5c57d48fed7ded4e1`
  - `apps/bounce-run/.haku/generated/engine.d.ts`: `320a5728012cfa22ea9da285c6a04b50ad64058c14e15d82a8a38a01abae4591`

## Remaining work

- In the Chrome UI editor, create at least one reusable component master and place at least two
  instances. Preserve a clear master/instance workflow in the final HUD/menu proof.
- Add at least three distinct input widgets across the HUD/menu, then declare and bind compatible
  documented events. The runtime boundary already accepts numeric volume and boolean mute events;
  use exact names from `UI-M7-ROLL-01.md` and confirm one effect per user gesture.
- Add an Image through the project asset picker. Current Bounce Run manifest has no texture asset,
  so the editor reports `No texture assets in the project manifest`; author/import/register an
  appropriate local texture through the editor before creating the Image. Do not patch the UI JSON
  or manifest by shell.
- Complete any missing interactive menu/overlay composition while keeping score/progress updates
  programmatic and event-free.
- Save again in the editor, reload, reopen the HUD, and verify component instances, widget values,
  bindings, Image dependency metadata, and disabled Save survived.
- Use Play to exercise Start, pause/resume, restart, audio toggles, and all three input widgets.
  Confirm one effect per gesture, no programmatic feedback events, correct route progress advance
  and reset, keyboard/game-input focus isolation, and no console/runtime/network errors.
- Capture and inspect final viewport evidence at 1280×720, 1440×900, 1920×1080, and one narrow
  custom viewport. Confirm legibility, no overlap/clipping/overflow, and responsive constraints plus
  Hug/Fill/Fixed behavior.
- Re-run strict asset/manifest loading, the focused/full Bounce Run tests, typecheck, build, and
  browser checks after the final Save.

## Risks and open defects

- M7 is incomplete: no component master/instances, Image, three input widgets/event bindings, final
  Play proof, or four-viewport matrix exists yet.
- All overlays are visible simultaneously in editor preview because runtime state normally controls
  visibility. Final Play evidence must prove the real session-state behavior.
- The saved slice screenshots show editor state only and do not satisfy the final viewport or Play
  acceptance evidence.
- The Image requirement is blocked on adding a local texture asset through an authorized editor
  workflow; the project currently exposes no texture choice.

## Exact next action

Reuse the marked Chrome editor tab and running isolated Bounce Run server if still available. Open
the HUD, select a suitable control subtree, create a reusable component master, place two instances,
and save through the editor before beginning the three input widgets. If the server stopped, restart
it with the exact command from `UI-M7-ROLL-01.md`.

## Context exclusions

- Do not start M8 accessibility work.
- Do not read or modify `apps/playground/haku.project.json` or
  `apps/playground/public/assets/ui/**`.
- Do not stage `apps/bounce-run/tsconfig.json` or any `apps/bounce-run/.haku/**` path.
- Do not revisit unrelated engine, graph, audio, storage, export, or scene subsystems unless a
  newly reproduced M7 blocker proves an owning-package defect.
