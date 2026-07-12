# Reference Interpretation — raycast-vehicle

**Task:** P0 — Reference analysis  
**Mode:** REFERENCE_ANALYSIS · Iteration 1  
**Status:** Draft — awaiting user confirmation

> Describes the **external reference game** (`~/work/reference-raycast-vehicle`). @haku uses **Rapier** + custom `stepRaycastVehicle` — see AD-02 in [DECISIONS_LOG.md](./DECISIONS_LOG.md).
>
> **Tuning rule:** Match reference **player experience** (arcade RWD, jump, boost, camera). Do **not** copy reference physics constants — they target a different runtime; tune `Vehicle` fields for Rapier in Play mode.

---

## 1. What this project is

An **arcade RC car playground**: one stunt-track level, one drivable car, polished **game-feel** (boost, jump, drift tire marks, chase camera, post-FX) with a **raycast-wheel vehicle** and a bundled JS physics engine. The reference is a **self-contained Vite demo**, not a general engine — all logic lives in three JS modules wired directly to Three.js and that physics runtime.

**Design lineage:** Bruno Simon portfolio + swift502/Sketchbook — raycast wheels on a box chassis, GLB level baked to trimesh colliders for ramps/loops without hand-placed collision boxes.

**Player experience:** Drive an RC car on a colorful stunt course; boost on straights; jump gaps; optionally teleport between two ring markers; tune handling live via a hidden GUI panel.

---

## 2. Core mechanics (interpreted)

### Must-have for “feels like the reference”

| # | Mechanic | Reference behavior |
| - | -------- | ------------------ |
| M1 | **Raycast vehicle** | 4-wheel suspension rays; rear-wheel drive; no wheel rigid bodies |
| M2 | **GLB level collision** | Level mesh → static trimesh collider(s); car drives on ramps/loops |
| M3 | **Drive + steer + brake** | WASD / stick; smoothed steering; coast brake; reverse |
| M4 | **Boost** | Shift / button; higher speed cap + FOV/post-FX feedback |
| M5 | **Jump** | Space / A button; grounded check; cooldown + input buffer |
| M6 | **Chase camera** | Follow behind car; mouse orbit; airborne lift |
| M7 | **Visual sync** | GLB body + 4 wheel meshes synced from physics each frame |
| M8 | **Respawn** | R / reset button / fall-off-world |

### High-value polish (reference ships these)

| # | Feature | Notes |
| - | ------- | ----- |
| P1 | Arcade stability assists | Anti-wheelie, upright, wall slide, landing grip, corner-lift damping |
| P2 | Tire marks | Procedural streaks when turning at speed |
| P3 | Post-processing | Color grade, vignette, chromatic aberration; wind lines on boost |
| P4 | Dynamic shadows | Sun shadows follow car; texel snapping |
| P5 | Transporter rings | Two-way teleport between course sections |
| P6 | Mobile + gamepad input | Touch joystick; Gamepad API |
| P7 | Speed HUD | km/h readout |
| P8 | Live tuning GUI | lil-gui — 100+ params (reference-only dev tool) |

### Likely out of scope for v1 target (unless user says otherwise)

- Full lil-gui parity in shipped game (editor inspector tuning is the @haku equivalent)
- GTAO (off by default in reference anyway)
- Fullscreen / help panel chrome
- Procedural sky cubemap (could use solid color + hemisphere light in editor)

---

## 3. Content authoring model (reference vs @haku)

| Concern | Reference | @haku target build |
| ------- | --------- | ------------------- |
| Level placement | Hardcoded GLB load + Y offset slider | Editor: import `rc-level.glb`, place Transform, mark static |
| Car | Code-spawned `Vehicle` class | Prefab or scene entity with **Vehicle component** (does not exist today) |
| Colliders | Runtime trimesh bake from GLB | **No collider pipeline** — platform gap |
| Transporter | Hardcoded coordinates in `main.js` | Scene entities + trigger script/component |
| Lighting | Code in `World._createLights()` | Editor: Hemisphere + Directional entities + RenderSettings shadows |
| Post-FX | Hardcoded composer stack | Partial — `RenderSettings.postProcessing` (bloom, vignette); custom passes missing |
| Input / HUD | DOM + window listeners in `main.js` | **No in-game UI or input system** — platform gap |

**Reference-driven rule:** target content should be authored **through the editor** where possible. The reference’s code-first wiring defines *behavior*, not the authoring workflow.

---

## 4. Gap analysis — reference vs @haku platform

Legend: ✅ exists · 🟡 partial · ❌ missing

### Engine / simulation

| Capability | @haku today | Gap severity |
| ---------- | ----------- | ------------ |
| Three.js rendering | ✅ `@haku/engine` | — |
| glTF / ModelGeometry | ✅ load + render sync | Level + car models can be placed in editor |
| Component scene graph | ✅ Transform, MeshRenderer, Light, Camera, Static, PrefabInstance, ScriptRef | Vehicle physics not a component |
| **Physics engine** | ❌ none in monorepo | **Blocker** — entire driving sim |
| **RaycastVehicle** | ❌ | **Blocker** |
| **Trimesh collider from mesh** | ❌ | **Blocker** for accurate level collision |
| ISystem / game loop hooks | ✅ playground can add systems | Vehicle system needs new package or engine module |
| ScriptRef runtime | 🟡 schema only | Behavior likely needs `VehicleController` system |

### Rendering / FX

| Capability | @haku today | Gap severity |
| ---------- | ----------- | ------------ |
| Shadows + follow anchor | 🟡 `ShadowSettings.followCamera` | May need gameplay-target follow (car entity) |
| Tone mapping (ACES) | ✅ RenderSettings | — |
| Post-processing | 🟡 bloom, vignette flags | Missing: GTAO, chromatic aberration, custom wind streaks, color grade stack |
| Tire mark decals | ❌ | Medium — procedural mesh system or defer |
| Environment / cubemap background | 🟡 color background only | Low — hemisphere + solid color may suffice |

### Editor

| Capability | @haku today | Gap severity |
| ---------- | ----------- | ------------ |
| Place GLB models | ✅ Asset browser → ModelGeometry | Level + car visuals |
| Lights / camera | ✅ | Match reference lighting |
| Render settings UI | ✅ shadows, post FX toggles | Custom FX need schema + UI |
| Prefabs | ✅ create / place | Car could be prefab once Vehicle component exists |
| **Physics / collider authoring** | ❌ | **Blocker** — trimesh generation, vehicle params |
| **In-game HUD authoring** | ❌ | Medium — DOM overlay vs scene UI (AD needed) |
| **Playwright (agent workflow)** | ❌ not in monorepo | **Agent tool** for TARGET_BUILD — not platform epic (AD-08) |

### Input

| Capability | @haku today | Gap severity |
| ---------- | ----------- | ------------ |
| Keyboard / mouse | ❌ no runtime input package | **Blocker** for play mode |
| Touch / gamepad | ❌ | Medium if mobile parity required |

### Target project

| Item | Status |
| ---- | ------ |
| `~/work/tmp-js-game-project` | **Not created** |
| `@haku/create` scaffold | Ready when cycle proceeds |

---

## 5. Proposed epic stubs (for Phase 1 — not scheduled yet)

| Epic | Scope sketch |
| ---- | ------------ |
| **E-Physics** | Rapier backend + custom raycast vehicle on abstract layer; static colliders; vehicle component + system |
| **E-Input** | Runtime input manager (keyboard, pointer, gamepad, touch) |
| **E-Gameplay** | Chase camera rig, transporter triggers, respawn, assists tuning via inspector |
| **E-Render-FX** | Boost-linked post-FX, optional tire marks |
| **E-UI** | Speed HUD + mobile controls overlay |
| **E-Target-Content** | Scaffold project; import assets; assemble scene via editor (Playwright agent workflow) |

---

## 6. Platform risks & constraints

1. **Editor-only target build** — vehicle spawn, physics world, and input cannot remain hardcoded in `main.ts`; they need scene-driven or project-config hooks without violating package boundaries.
2. **Trimesh collision fidelity** — reference bakes GLB meshes to one trimesh body; @haku uses editor-placed box colliders (AD-03). Ramps may differ until trimesh authoring lands.
3. **Heavy GLB assets (~20 MB)** — acceptable for demo; may need optimization pass for web deploy.
4. **Playwright (agent workflow)** — subagents drive editor via `.agents/tools/editor-playwright/`; not a platform deliverable (AD-08).
5. **ScriptRef immaturity** — much reference logic may initially live in target `scripts/` or a dedicated `@haku/engine` system until script runtime matures.

---

## 7. Recommended scope tiers (for user decision)

| Tier | Includes | Excludes |
| ---- | -------- | -------- |
| **MVP** | M1–M8, static level in editor, keyboard drive, basic shadows | Tire marks, transporter, mobile/gamepad, custom post-FX |
| **Parity** | MVP + P1–P7 | lil-gui in shipped build |
| **Full clone** | Parity + P8 dev tuning panel equivalent | — |

Default recommendation pending user answer: **Parity** gameplay, **editor** replaces lil-gui for tuning.
