# UI-M7 roll handoff 01

## Scope and stop point

M7 is intentionally incomplete. This roll stops at the 70–75% context boundary after proving the isolated Bounce Run editor route, composing the typed gameplay adapter, and repairing declaration generation. The next agent must finish the HUD authoring and browser acceptance work in M7 only. Do not begin M8.

## Commits

- `c5684e8` — resolve target manifest paths from `INIT_CWD`, accepting either a project directory or `haku.project.json`.
- `47cac01` — resolve optional gameplay targets by unique authored names and forward document-scoped binding names.
- `4602a9f` — publish typed session HUD snapshots and route named UI events once through the existing session/audio composition.
- `9ea6548` — make generated engine declarations an external-module augmentation so they do not shadow `@haku/engine` exports.

## Verified editor route

Launch from the repository root:

```bash
HAKU_TARGET_PATH=apps/bounce-run/haku.project.json pnpm --filter @haku/editor-app dev --host 127.0.0.1
```

The current server was started on `http://127.0.0.1:5174/`; use `http://127.0.0.1:5174/?hakuOpenTarget=1` in the user's Chrome. The Chrome session was named `🎛️ Bounce Run UI M7`.

Observed service behavior after `c5684e8`:

- `GET /__haku/dev/info` reported target path `/Users/pavel/work/tree-js-projects/apps/bounce-run`.
- `GET /__haku/dev/project` returned the Bounce Run manifest with HTTP 200.
- `GET /__haku/dev/file?path=public/assets/ui/hud.ui.json` returned the Bounce Run HUD with HTTP 200.
- `GET /assets/ui/hud.ui.json` returned the editor SPA fallback, proving the target server did not expose playground public assets.
- `?hakuOpenTarget=1` opened `public/assets/scenes/main.scene.json`; UI asset picker opened `public/assets/ui/hud.ui.json`, breadcrumb `Bounce Run HUD`.
- Chrome warning/error console entries were empty.

A reversible root-name edit enabled Save; Undo restored the blank name and disabled Save. No asset save was issued, because even a semantic no-op save could refresh manifest metadata. The HUD and manifest hashes remained unchanged.

Opening the Code tab regenerated `.haku/generated/engine.d.ts` through editor tooling. It now starts with `export {}` and Bounce Run typecheck passes. Do not hand-edit generated declarations.

## Runtime contract ready for authoring

`createBounceRunUIGameplayAdapter` resolves these optional, unique top-level authored element names:

- `Session status` — Text
- `Score` — Text
- `Best score` — Text
- `Route progress` — Progress

The existing three legacy text IDs remain fallback targets until the saved document supplies those names. Programmatic `updateHud` writes status, score, best score, and normalized route progress directly through `UIService`; these writes emit no user events.

The adapter maps document binding IDs to authored event-definition names. The audio/session boundary recognizes:

- `start-session`, `pause-session`, `resume-session`, `restart-session`
- `toggle-master-audio`, `toggle-music-audio`, `toggle-sfx-audio`, `toggle-ui-audio`
- `set-master-volume`, `set-music-volume`, `set-sfx-volume`, `set-ui-volume` with numeric values
- `set-master-muted`, `set-music-muted`, `set-sfx-muted`, `set-ui-muted` with boolean values

Each user event is subscribed once; disposal removes the subscription and disposes the adapter. `main.ts` uses route index 33 as the progress goal.

## Exact next Chrome authoring sequence

All UI JSON changes must be made in the editor UI and persisted with its Save button. Never edit `hud.ui.json` or `haku.project.json` from the shell.

1. Reuse or open the URL above in the user's Chrome. Confirm the banner says `public/assets/scenes/main.scene.json · edit`.
2. Select the UI tab. If the HUD is not already open, use the asset picker: open `ui`, then double-click `hud.ui.json`. Confirm breadcrumb `Bounce Run HUD`.
3. Before structural work, take a Chrome screenshot and inspect the hierarchy/inspector snapshot. Work from the existing authored controls; preserve IDs and binding definitions when reorganizing them.
4. Author the HUD as nested frames using real layout controls: horizontal/vertical auto layout, Hug/Fill/Fixed sizing, spacing/padding, alignment, and constraints. Include Image, Text, Button, and Progress elements plus three distinct input widgets required by the M7 plan.
5. Set unique top-level names exactly `Session status`, `Score`, `Best score`, and `Route progress`. The first three must remain Text and the last must be Progress. Do not introduce runtime ID constants for these targets.
6. Bind control events by the exact names listed in the runtime contract. Use activation for buttons, input/change semantics for the three input widgets, and do not connect programmatic display values to event-emitting paths.
7. Save in the editor. Confirm Save becomes disabled, reload the page, reopen `hud.ui.json`, and verify the hierarchy and bindings survived.
8. Use Play and exercise Start, pause/resume, restart, audio toggles, and all three input widgets. Confirm each gesture produces one effect, HUD programmatic changes do not feed back as user events, and route progress advances/reset correctly.
9. Capture/inspect viewport evidence at 1280×720, 1440×900, 1920×1080, and a narrow viewport. Verify no clipping/overflow and that constraints plus Hug/Fill behave as authored.
10. After Save, validate through normal repository tests/schema loaders; reading the asset for verification is allowed, but any correction must return to Chrome editor UI and Save.

## Verification evidence

- Editor target plugin focused tests: 7 passed.
- Full `@haku/editor` tests before the generator slice: 54 files / 345 tests passed.
- `@haku/editor` typecheck passed.
- Generator RED observed, then focused generator test passed.
- Adapter/session/audio focused tests: 3 files / 10 tests passed.
- Bounce Run typecheck passed after editor-driven regeneration.
- Bounce Run build passed; production bundle warning remains informational.
- Full Bounce Run run: 23 files passed and one bundle-budget file failed only because three production tests concurrently removed the same `dist/assets` directory. Re-running that file alone passed, as did a subsequent standalone build. This is test-runner output-directory contention, not a product failure.
- Focused ESLint and `git diff --check` passed. Bounce Run package has no `lint` script.

## Preserved dirty state and protections

The user-owned Bounce baseline remains unstaged:

- `apps/bounce-run/tsconfig.json` unchanged, SHA-256 `1c472c1017cec742ef2b578bdd1880131337f6bc7dd26d6221ff2ffb43f1c394`
- `.haku/editor.json` unchanged, SHA-256 `2a2fe31cfbb2ed59ccebc0b878b3a547435366c3cccf0cb5c57d48fed7ded4e1`
- generated node SDK and project declarations unchanged
- generated engine declaration changed only via opening the editor Code workspace; SHA-256 is now `320a5728012cfa22ea9da285c6a04b50ad64058c14e15d82a8a38a01abae4591`
- HUD unchanged, SHA-256 `006425193d44df3782345cc9dd080626fb6141de9fb290d946f8c7725d2a9b62`
- manifest unchanged, SHA-256 `d52c51ca40b752682c99a6c4c34bca053cabcec0ffccf31ce1f9e23b69e72f2b`

Protected playground paths remain user-owned, unstaged, unread, and untouched:

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`

Continue using explicit `git add` paths only.
