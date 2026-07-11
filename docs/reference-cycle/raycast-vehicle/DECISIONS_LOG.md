# Architectural Decisions — raycast-vehicle cycle

**Confirmed:** 2026-07-11 (user Phase 0 answers)

---

## AD-01 — Scope tier

**Decision:** **Full clone (C)** — parity gameplay + in-game tuning panel equivalent to reference lil-gui.

**Notes:** Editor replaces lil-gui for production tuning where possible; in-game tuning panel still required per scope.

---

## AD-02 — Physics backend (abstract, swappable)

**Decision:** **Rapier** as first implementation behind an **abstract physics API** — implementation details hidden; backends swappable without rewriting gameplay.

| Requirement | Detail |
| ----------- | ------ |
| Current backend | Rapier (WASM) |
| Future backend | box3D integration must be possible without breaking scene/gameplay code |
| Raycast vehicle | Reimplement sketchbook-style on abstract layer (not cannon-es coupling) |
| Gameplay / systems | Depend only on `@haku/physics` (or equivalent) interfaces — never Rapier types in core/engine components |

**Rejected:** cannon-es direct coupling, hybrid cannon-only, defer physics entirely.

---

## AD-03 — Level collision authoring (platform + this project)

**Decision:** Platform implements **all three** collision modes; **this target project uses B (manual primitives)**.

| Mode | Platform | This project |
| ---- | -------- | ------------ |
| **A** Auto trimesh from GLB | ✅ implement | — |
| **B** Manual box/primitive colliders in editor | ✅ implement | **✅ used** |
| **C** Pre-baked collision mesh asset | ✅ implement | — |

Level ramps may be less accurate than reference trimesh until A/C used on other projects.

---

## AD-04 — In-game UI system

**Decision:** **Separate UI system (B)** — UI is **not** scene entities.

| Requirement | Detail |
| ----------- | ------ |
| Architecture | Standalone UI layer (DOM or dedicated UI runtime) outside scene graph |
| Binding | Can bind to scene elements, components, and scripts |
| Control | Programmatically controllable (show/hide, data binding, events) |
| Not | World-space canvas entities as primary HUD model |

---

## AD-05 — Vehicle tuning & custom inspector

**Decision:** **Editor inspector (A)** + **custom editor/viewer support for prefabs and entities**.

| Requirement | Detail |
| ----------- | ------ |
| Primary tuning | Vehicle component fields in inspector at edit time |
| Extension | Editor must support registering **custom inspector panels / viewers** per prefab type or entity archetype |
| In-game | Full clone scope includes in-game tuning panel (AD-01); editor custom views are the authoring path |

---

## AD-06 — Post-processing (target + order)

**Decision:** **Final target = reference match (C)**; **implementation order = defer (D)** until driving feel is correct.

Ship order: physics + drive + camera first → then color grade, vignette, chromatic aberration, wind streaks, optional GTAO.

---

## AD-07 — Input platforms

**Decision:** **Keyboard + mouse camera only (A)** for first shippable target build.

Mobile, gamepad, touch deferred to later milestone (not blocking full-clone tuning/HUD scope for other features).

**Implementation (T01.17):** `@haku/engine` `InputManager` — WASD/arrows → throttle/steer; Shift boost; Space jump + handbrake; R respawn; mouse drag orbit + wheel zoom. Play-mode `enable`/`disable`; vehicle binding in T01.18 (`InputBindingSystem` + `startVehiclePlayMode`).

---

## AD-08 — Playwright as agent workflow tool

**Decision:** Playwright is **agent workflow tooling** — the mechanism subagents use to drive the editor during `TARGET_BUILD`. It is **not** a platform epic or product feature to implement on the Iterative dev board.

| Requirement | Detail |
| ----------- | ------ |
| Role | Subagents assemble levels, import assets, save scenes, enter play mode via Playwright |
| Location | `.agents/tools/editor-playwright/` (dev deps + scripts) — see `docs/reference-cycle/AGENT_EDITOR_WORKFLOW.md` |
| Flows | Full scope A+B+C+D — agent capability, not milestone deliverable |
| Platform | No `@haku/editor` Playwright API; no E09 tasks |
| Bootstrap | First TARGET_BUILD pass scaffolds tooling if missing (same commit as content OK) |

**Rejected:** E09 Playwright epic, Playwright harness as engine/editor feature, Playwright tiers as board tasks T01.32–T01.36.

**Updated:** 2026-07-11 — user clarified Playwright is workflow tool, not platform work.

---

## AD-09 — Target-only content (cycle verification)

**Decision:** All reference-cycle **scene, asset, and level content changes** live in the **target project** only. The monorepo playground demo scene is never modified for cycle verification.

| Rule | Detail |
| ---- | ------ |
| Scene/assets/config | **Only** in `~/work/tmp-js-game-project` (`TARGET_PATH`) |
| Monorepo playground | **Never** modify `apps/playground` scenes for cycle verification |
| Editor verification | **File → Open Project** → target path, or dev `?hakuOpenTarget=1` |
| Playwright | Open target via `openTargetProject()` + `HAKU_TARGET_PATH` dev plugin — **no** Demo Scene asset interception |

**Rejected:** `routeTargetAssetsForDemoScene`, mapping `menu.scene.json` → target scene in Playwright helpers.

**Updated:** 2026-07-11 — user feedback iteration 3 (T01.12 rework).

---

## Session constants

| Key | Value |
| --- | ----- |
| REFERENCE_PATH | `~/work/reference-raycast-vehicle` |
| TARGET_PATH | `~/work/tmp-js-game-project` |
| PLATFORM_BRANCH | `feat/reference-raycast-vehicle` |
