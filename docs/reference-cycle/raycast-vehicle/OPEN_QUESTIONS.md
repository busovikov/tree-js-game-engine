# Open Questions — raycast-vehicle

**Phase:** 0 — Reference analysis  
**Iteration:** 1  
**Blocking Phase 1 (MASTER_PLAN):** yes — answers needed before AD-xx and epic ordering

---

## Priority questions for user (max 8)

These are copied to the subagent handoff as `QUESTIONS_FOR_USER`.

### Q1 — Scope tier

Which target scope do you want for the first playable milestone?

- **A)** MVP — drive/steer/jump/boost on the level, keyboard + chase camera only  
- **B)** Parity — MVP + tire marks, transporter, mobile + gamepad, boost post-FX, speed HUD (no lil-gui in game)  
- **C)** Full clone — everything in the reference including an in-game tuning panel  
- **D)** Custom — describe what to cut or add

### Q2 — Physics backend (architectural) — **Resolved: Rapier (AD-02)**

**Decision:** `@haku/physics-rapier` + custom `stepRaycastVehicle` on the abstract `@haku/physics` layer (Isaac Mason sketchbook-style solver). No third-party JS physics engine in the Haku stack.

The external reference game uses its own physics runtime. **Do not port its physics constants** — tune for Rapier + our solver in Play mode. Reuse reference only for **player-facing goals** (arcade drive, jump, camera, HUD flow).

### Q3 — Level collision authoring

Reference bakes **every mesh** in `rc-level.glb` into one static trimesh body at runtime. In @haku:

- **A)** Automatic — import GLB, generate trimesh collider in engine (editor toggle on mesh)  
- **B)** Manual — simplified box/primitive colliders placed in editor (ramps may be inaccurate)  
- **C)** Pre-baked — ship a separate collision mesh asset authored offline  
- **D)** Match reference exactly — runtime bake, no editor collider UI for v1

### Q4 — In-game UI / HUD

Reference uses **DOM overlay** (speed, mobile controls, help). For the target project:

- **A)** DOM overlay in target app shell (outside editor scene format)  
- **B)** Scene entities + future UI component (canvas/world space)  
- **C)** Minimal — speed text only; skip mobile overlay initially  
- **D)** Match reference DOM HUD including touch controls from day one

### Q5 — Vehicle tuning surface

Reference exposes 100+ params via **lil-gui** at runtime. For @haku:

- **A)** Editor inspector only — tune Vehicle component in edit mode, fixed at play  
- **B)** Editor + limited in-game debug menu (subset of params)  
- **C)** Port lil-gui into target dev build only (not production)  
- **D)** Hardcode reference defaults — no tuning UI

### Q6 — Post-processing parity

Which post-FX are required for “done”?

- **A)** Minimal — ACES tone mapping + shadows only  
- **B)** Standard — + vignette + boost chromatic aberration (extend existing post stack)  
- **C)** Reference match — + custom color grade shader + wind streaks (+ optional GTAO)  
- **D)** Defer all post-FX until driving feels correct

### Q7 — Input platforms

Which input methods must work in the first shippable target build?

- **A)** Keyboard + mouse camera only  
- **B)** + Gamepad  
- **C)** + Touch / mobile (joystick + boost) — full reference parity  
- **D)** All of the above

### Q8 — Playwright editor automation

You requested **Playwright** for editor interaction during TARGET_BUILD. What is the minimum automated flow for v1?

- **A)** Scaffold target → open editor → import GLBs → save scene (smoke test)  
- **B)** A + place level entity, lights, camera, vehicle prefab, verify play mode loads  
- **C)** B + drive smoke test (keyboard input simulation in play mode)  
- **D)** Full scene assembly matching reference layout with screenshot diff

---

## Non-blocking notes (no answer required now)

- Target path `~/work/tmp-js-game-project` will be created via `@haku/create` when execution starts.
- Car GLB assets are ~20 MB total — confirm acceptable for repo/deploy.
- `ScriptRef` runtime maturity may affect where vehicle logic lives initially.
- Transporter ring **positions** are hardcoded to the reference level layout — reuse as-is or reposition in editor?

---

## Answer log

| Q | Answer | Date | By |
| - | ------ | ---- | -- |
| Q1 | **C** — Full clone (in-game tuning panel included) | 2026-07-11 | User |
| Q2 | **B** — Rapier behind abstract swappable physics API; box3D later | 2026-07-11 | User |
| Q3 | **A+B+C all on platform**; this project uses **B** (manual primitives) | 2026-07-11 | User |
| Q4 | **B** — Separate UI system (not scene entities); binds to scene + scripts | 2026-07-11 | User |
| Q5 | **A** — Editor inspector + custom editor/viewer for prefabs/entities | 2026-07-11 | User |
| Q6 | **C target, D order** — reference-match FX deferred until driving works | 2026-07-11 | User |
| Q7 | **A** — Keyboard + mouse camera only (v1) | 2026-07-11 | User |
| Q8 | **All (A–D)** — agent workflow via Playwright (not platform epic) | 2026-07-11 | User |

See `DECISIONS_LOG.md` for AD-01 … AD-08.
