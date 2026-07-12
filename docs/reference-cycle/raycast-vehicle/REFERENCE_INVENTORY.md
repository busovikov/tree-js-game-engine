# Reference Inventory — raycast-vehicle

**Reference repo:** `~/work/reference-raycast-vehicle` (read-only, **external** — not part of @haku)  
**Live demo:** https://raycast-rc-car.netlify.app/  
**Analyzed:** 2026-07-11 · Iteration 1

> Sections below describe the **external reference game** only. @haku uses **Rapier** (`@haku/physics-rapier`) and a custom raycast vehicle solver — see §11.

---

## 1. Project summary

| Field | Value |
| ----- | ----- |
| **Name** | `vehicle-controller` (package.json) / “Raycast RC Car” (README) |
| **Type** | Single-scene interactive arcade driving demo |
| **Language** | JavaScript (ES modules) — no TypeScript |
| **Bundler** | Vite 8 |
| **Entry** | `index.html` → `src/main.js` |
| **Lines of code** | ~3 files, ~2,600 LOC total |

### Dependencies

| Package | Version | Role |
| ------- | ------- | ---- |
| `three` | ^0.185.1 | Rendering, loaders, post-processing addons |
| `cannon-es` | ^0.20.0 | **Reference repo only** — physics world, raycast vehicle, trimesh colliders |
| `lil-gui` | ^0.21.0 | Live tuning panel (100+ sliders) |
| `vite` | ^8.1.3 | Dev server + build |

---

## 2. Repository structure

```
reference-raycast-vehicle/
├── index.html              # HUD markup, mobile controls, CSS (~400 lines)
├── package.json
├── README.md
├── public/
│   └── og-image.jpg        # Social preview (52 KB)
└── src/
    ├── main.js             # Renderer, camera, post-FX, GUI, input, game loop (~1,400 LOC)
    ├── World.js            # Level load, trimesh colliders, lights (~200 LOC)
    ├── Vehicle.js          # RaycastVehicle physics, controls, visuals, tire marks (~1,200 LOC)
    └── assets/
        ├── rc-level.glb    # Stunt track — visual + physics (188 KB)
        ├── base.glb        # Car body mesh (6.6 MB)
        ├── front-left.glb  # Wheel mesh (3.2 MB)
        ├── front-right.glb # Wheel mesh (3.3 MB)
        ├── back-left.glb   # Wheel mesh (3.5 MB)
        ├── back-right.glb  # Wheel mesh (3.2 MB)
        ├── reflection.jpg  # Equirectangular env for glass (24 KB)
        └── demo.jpg        # README screenshot (52 KB)
```

**Total GLB payload:** ~20 MB (heavy per-wheel models; level is lightweight).

---

## 3. Scenes & world content

There is **one implicit scene** — no scene files, no multi-level flow.

| Element | Source | Notes |
| ------- | ------ | ----- |
| **Driving level** | `rc-level.glb` | Scaled ×3 (`ENVIRONMENT_SCALE`); Y offset via `offsetY` (default 2) |
| **Level collider** | Same GLB, mesh → trimesh | One static body; all meshes become trimesh shapes |
| **Car spawn** | Hardcoded `(0, 10, 0)` | Auto-respawn if `y < -20` |
| **Transporter A→B** | Procedural torus rings in `main.js` | Default A `(-37.7, 15.6, 103.7)` ↔ B `(-25, 39.1, 111.5)` |
| **Sky / background** | Procedural `CubeTexture` gradient | Not from HDR/GLB |
| **Glass reflections** | `reflection.jpg` PMREM on level glass materials | Separate from car env map |

### Lighting

| Light | Type | Defaults |
| ----- | ---- | -------- |
| Hemisphere | `THREE.HemisphereLight` | sky `#bfd9ff`, ground `#4a4a3a`, intensity 2 |
| Sun | `THREE.DirectionalLight` | `#fff2d9`, intensity 2.52, PCF shadows |
| Shadow map | 2048 (mobile) / 4096 (desktop) | Follows car; texel-snapped to reduce shimmer |

---

## 4. Vehicle entity

### Physics (`Vehicle.js`)

| Subsystem | Implementation |
| --------- | -------------- |
| Chassis | Box `(0.9, 0.3, 1.55)` half-extents + 4 corner spheres (trimesh contact workaround) |
| Wheels | Raycast vehicle — 4 wheels, raycast suspension (no wheel rigid bodies) |
| Drive | Rear-wheel drive; engine force on wheels 2 & 3 |
| Steering | Front wheels 0 & 1; smoothed steer |
| Jump | Upward impulse when grounded + input buffer |
| Assists | Anti-wheelie, upright assist, wall slide, corner-lift damping, landing grip fade, airborne gravity scale, tilt clamp |

**Tunable params (reference repo):** ~30 physics values in `DEFAULT_PARAMS` — **not ported to @haku**; use as UX checklist only when validating Play mode.

### Visuals

| Part | Fallback | GLB |
| ---- | -------- | --- |
| Body | Procedural boxes (red cabin) | `base.glb` — auto-fit to chassis length |
| Wheels | Cylinder placeholders | 4 separate wheel GLBs — auto-fit to `WHEEL_RADIUS` |
| Tire marks | Procedural ribbon meshes | Canvas alpha texture; streak system per wheel |

Wheel order: **FL, FR, BL, BR** (matches physics connection points).

---

## 5. Game loop & systems

Fixed timestep physics (`1/60`), variable render:

```
tick():
  physicsWorld.step(FIXED_STEP, delta, 3)
  updateGamepadControls()
  vehicle.update(delta)      // controls, assists, tire marks, visual sync
  world.update()             // dynamic pairs (unused today)
  updateCamera(delta)          // chase + orbit + airborne blend
  updateTransporter(delta)     // A↔B teleport
  physicsDebug.update()
  shadow follow + texel snap
  post-FX boost blending
  composer.render() | renderer.render()
```

### Camera

- Chase offset behind car; exponential damping (frame-rate independent)
- Mouse drag orbit (disabled while accelerating)
- Scroll zoom; boost FOV widen + dolly-out
- Airborne camera lift when wheels off ground

### Post-processing

| Pass | Status |
| ---- | ------ |
| `RenderPass` | Always |
| `GTAOPass` | Optional (`aoEnabled`, off by default) |
| Custom color-grade `ShaderPass` | Vignette, contrast, saturation, brightness, chromatic aberration, film noise |
| Wind streaks | Boost + speed threshold shader effect |
| `OutputPass` | Color space output |
| MSAA | 4× on composer render targets |

### Input channels

| Channel | Actions |
| ------- | ------- |
| **Keyboard** | WASD/arrows drive; Shift boost; Space jump/handbrake; R respawn; `.` toggle GUI |
| **Mouse** | Drag orbit; wheel zoom |
| **Touch** | Virtual joystick, boost button, reset (GUI hidden on coarse pointer) |
| **Gamepad** | Sticks/D-pad steer; RT gas / LT brake; A jump; B/RB boost |

### HUD (DOM)

- Speed readout (km/h)
- Help panel (keyboard / touch hints)
- Fullscreen toggle
- Mobile overlay controls (CSS `@media (pointer: coarse)`)

### Debug

- lil-gui “Vehicle Tuning” panel — Vehicle, Camera, World, Effects, Models, Debug folders
- Physics collider wireframes + suspension ray lines

---

## 6. Assets inventory

| Asset | Size | Used for |
| ----- | ---- | -------- |
| `rc-level.glb` | 188 KB | Level mesh + trimesh collider |
| `base.glb` | 6.6 MB | Car body visual |
| `front-left.glb` | 3.2 MB | Front-left wheel |
| `front-right.glb` | 3.3 MB | Front-right wheel |
| `back-left.glb` | 3.5 MB | Rear-left wheel |
| `back-right.glb` | 3.2 MB | Rear-right wheel |
| `reflection.jpg` | 24 KB | Level glass env map |
| `demo.jpg` / `og-image.jpg` | 52 KB each | Marketing / social |

**No audio, no textures beyond reflection, no prefabs, no scene JSON.**

---

## 7. Reference physics gotchas (documented in reference README)

> External reference repo only — not applicable to @haku (Rapier + custom solver).

1. Reference trimesh colliders only interact reliably with **spheres and planes** — chassis uses embedded corner spheres.
2. Raycasts in the reference fail against rotated planes — ground uses boxes/trimeshes instead.
3. Static body AABB must be refreshed via `body.updateAABB()` after `position.set()`.
4. Trimesh indices stored as **Int16** — meshes >32k vertices skipped.

---

## 8. What is NOT in the reference

- Multiplayer / networking
- Save/load beyond browser session
- Menu flow or multiple levels
- AI / NPCs
- Audio
- Editor or data-driven scene format
- Script hot-reload / component architecture
- Automated tests
- CI/CD

---

## 9. Target project status

| Artifact | Path | Status |
| -------- | ---- | ------ |
| **Target project** | `~/work/tmp-js-game-project` | Scaffolded (T01.37) |
| **Platform branch** | `feat/reference-raycast-vehicle` in `tree-js-projects` | Exists |
| **Assets dir** | `public/assets/` (`haku.project.json` → `assetsDir`) | Populated (T01.38) |

---

## 10. Target asset paths (T01.38)

Imported from `~/work/reference-raycast-vehicle/src/assets/` into `~/work/tmp-js-game-project/public/assets/`.

| Reference asset | Target path | Size | Notes |
| --------------- | ----------- | ---- | ----- |
| `rc-level.glb` | `public/assets/models/rc-level.glb` | 186 KB | Stunt track — visual + trimesh collider source (T01.39) |
| `base.glb` | `public/assets/models/base.glb` | 6.6 MB | Car body mesh |
| `front-left.glb` | `public/assets/models/front-left.glb` | 3.2 MB | Wheel FL |
| `front-right.glb` | `public/assets/models/front-right.glb` | 3.3 MB | Wheel FR |
| `back-left.glb` | `public/assets/models/back-left.glb` | 3.3 MB | Wheel BL |
| `back-right.glb` | `public/assets/models/back-right.glb` | 3.2 MB | Wheel BR |
| `reflection.jpg` | `public/assets/textures/reflection.jpg` | 23 KB | Equirectangular env for level glass (PMREM) |

**Total GLB payload in target:** ~20 MB.

**Scene JSON paths for T01.39** (relative to project root, served from `public/`):

```
assets/models/rc-level.glb
assets/models/base.glb
assets/models/front-left.glb
assets/models/front-right.glb
assets/models/back-left.glb
assets/models/back-right.glb
assets/textures/reflection.jpg
```

**Not imported:** `demo.jpg`, `og-image.jpg` (marketing only).

---

## 11. Rapier / custom raycast vehicle references (Haku stack)

> **Not in the reference repo** — use when implementing or debugging `@haku/physics-rapier` + `stepRaycastVehicle`.  
> Canonical list: [`docs/links.md`](../../../links.md) § Rapier.

| Resource | URL | Role |
| -------- | --- | ---- |
| Rapier documentation | https://rapier.rs/docs/ | WASM API, forces/impulses, raycasts, colliders |
| Three.js Rapier vehicle controller | https://threejs.org/examples/physics_rapier_vehicle_controller.html | Official Three.js + Rapier vehicle example |
| Isaac Mason custom raycast vehicle | https://sketches.isaacmason.com/sketch/rapier/custom-raycast-vehicle | **Ideal reference** for custom raycast vehicle on Rapier (sketchbook-style) |

**Distinction:** `reference-raycast-vehicle` is an **external demo** — use for **gameplay goals and UX patterns** only. Haku vehicles run on **Rapier + abstract `@haku/physics`**; physics numbers are tuned against Isaac Mason / Rapier docs, not copied from the reference.
