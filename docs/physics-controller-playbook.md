# Physics Controller Playbook

**Read this before adding or refactoring any physics controller** (vehicle, character, etc.). It
distils hard-won lessons — most of them from the `revolute-joint-vehicle` rework (see
`revolute-joint-vehicle-handoff.md` for that case study). The goal: don't rediscover these the hard way.

Controllers live in `packages/engine/src/controllers/builtin/*` (plugins) with the physics logic in
`packages/engine/src/systems/physics-controller-runtime.ts`, orchestrated by
`packages/engine/src/systems/physics-controller-system.ts`. Current families: `custom-raycast`,
`dynamic-raycast`, `arcade-vehicle`, `revolute-joint-vehicle`, `kinematic-character`, `character-body`,
`pointer-controls`.

---

## 0. Orientation — how a controller is actually wired

Know these before touching anything; several bugs came from *not* knowing them.

- **A controller is a `ControllerPlugin`**: `bootstrap(ctx)`, `update(ctx, dt)`, `resetEntity(ctx, id)`,
  `dispose(physicsWorld)`, `trackedIds()`. `ctx` (`ControllerRuntimeContext`) gives you `world`,
  `physicsWorld` (`IPhysicsWorld`, by body handle), `physicsSystem` (`PhysicsWorldSystem`, by entity
  id), and `inputs`.
- **Auto-bootstrap on first update.** `PhysicsControllerSystem.update` calls `bootstrap()` itself on the
  first frame if not already bootstrapped. **The editor never calls `bootstrap()` explicitly** — it
  just adds systems and ticks them (`Engine.tick` → `system.update`). So *the real entry path is
  auto-bootstrap mid-loop*, not the explicit `bootstrap()` your unit test probably calls.
- **Ownership boundary (important):** the **chassis / character body is created by the collider system
  / body-plan** (`physics-body-plan.ts`, `resolveColliderDescriptor` → implicit-controller collider
  from `controller.chassis`), NOT by the controller. The controller only creates *extra* runtime-only
  sub-bodies (wheels, hubs, knuckles) via `createBodyWithShape` on `physicsWorld`. These sub-bodies are
  **not ECS entities** — nothing else knows about them.
- **Respawn** (`respawn-system.ts`) does `physicsSystem.resetBodyState(id, spawn)` (resets *only* the
  chassis body: teleport + zero velocity) then `controllerSystem.resetControllerState` →
  `plugin.resetEntity`. Your sub-bodies are *your* responsibility to reset.

---

## 1. Definition of done (checklist)

A controller change is not done until:

- [ ] It works through the **auto-bootstrap path**, not just an explicit-`bootstrap()` test (see §2).
- [ ] It produces the **intended positive behaviour** (moves the right way, turns the right way, stops),
      asserted — not merely "doesn't throw / no NaN".
- [ ] **Direction conventions** (forward axis, steer/turn sign) are correct and covered by an assertion.
- [ ] It is **stable independent of scene contents** (add unrelated bodies → same behaviour, no blow-up).
- [ ] **Respawn** leaves it standing still and upright at spawn — including after driving/moving around
      first (it re-seats every runtime sub-body, §4).
- [ ] Stable across timesteps (e.g. 1/60 and 1/120).
- [ ] `disposeRevolute…`-style teardown removes every joint and body it created (no leaks).
- [ ] Full suite + `pnpm -r run build` + lint clean.

---

## 2. The controller test template (this would have caught almost everything)

Write tests that exercise the **real path** and assert **positive behaviour**. Model:
`packages/engine/src/systems/revolute-vehicle.test.ts` (programmatic) and `revolute-scene.test.ts`
(loads the shipped scene JSON and runs the full editor system set with **auto-bootstrap**, i.e. no
explicit `bootstrap()` — just `collider.update / controller.update / physics.update` each frame).

Cover, per controller:

1. **Settle / idle** — no input: stays upright, finite, bounded, doesn't sink or wander.
2. **Drive / move** — asserts it travels a meaningful distance the intended way (not just "finite").
3. **Reverse / opposite** — opposite sign to forward.
4. **Turn** — steering actually changes heading, and **L vs R are symmetric / correct sign**.
5. **Scene independence** — same run with a dozen unrelated dynamic bodies added: still finite/upright,
   trajectory within tolerance of the bare run.
6. **Respawn** — drive/turn to build momentum, reset via `physicsSystem.resetBodyState` +
   `controller.resetControllerState`, then coast: must stand still, upright, at spawn.
7. **Timestep** — repeat drive at dt=1/120; still stable and comparable.

Traps to avoid in the tests themselves:
- **Don't `bootstrap()` explicitly if the editor doesn't** — you'll test a different, healthier code
  path than production. Use the auto-bootstrap-in-loop form for at least one end-to-end test.
- **Measure in the right frame.** A "wheel wobble" turned out to be world-frame yaw contaminated by the
  chassis yaw; the chassis-relative angle was fine. Subtract the parent frame before judging.
- **Assert behaviour, not internals.** "No NaN" hid a car that settled fine but never drove (jammed
  wheels) and never turned (weak steer). Assert displacement and heading change.

---

## 3. Footguns (symptom → cause → fix)

| Symptom | Likely cause | Fix / check |
|---|---|---|
| Crashes/`unreachable` only with a busy scene; chaotic pass/fail vs params | Marginal solver island (stiff constraints on light bodies) — the scene is a *fuzzer*, not the cause | Fix **conditioning**, don't tune per-scene: mass ratios, add a compliant DOF, sane contact shape (§4). Criterion = scene-independent. |
| Works in a unit test, dead/broken in the editor | Test used explicit `bootstrap()`; editor uses auto-bootstrap mid-loop; or init-order differs | Add an auto-bootstrap end-to-end test (§2). |
| Settles fine but won't move; a sub-body won't spin though its motor is set | A sub-body collider **overlaps another part of the same object** (e.g. wheel into chassis) and jams | Guarantee parts don't collide: geometric clearance (cap the DOF so it can't overlap) or collision-group filtering. |
| Body flung above/away; velocity explodes on ~frame 1 | A **hard joint limit fighting the ground reaction**, or a `dt=0` step with a stiff motor configured | Loosen the limit (bound only the side that must not pass a geometric line); never let a stiff-motor body see a `dt=0` step (`prepareSceneQueries` does one). |
| Car/character veers with no input; L/R steer asymmetric | Free/low-damped part injects a **parasitic force** the controller can't cancel gently | Kill the source (e.g. low friction on the free part) and/or *author* the DOF (§4 assist), don't nudge it. |
| A position motor won't hold its target (overshoots/diverges) | Position motor gain too low **for a moving/perturbed** part; or the part's inertia is too small | Position motors need far higher gain than you expect, and enough inertia to hold; or don't hold it with a motor at all — author it. |
| Respawn spins/launches instead of standing still | Only the chassis was reset; **runtime sub-bodies kept their pose/momentum** and the joints yank | Reset must dispose+rebuild (or re-seat + zero-velocity) every sub-body against the fresh chassis (§4). |
| Reset clean after short moves, jolts after a long/fast run | Rapier island/broad-phase state survives a large teleport | Known Rapier-level limitation; body-level fixes don't clear it. Prefer keeping the body near origin, or a physics-world-level reset. |
| Turning slides/skates; back-then-forward doesn't return | No lateral grip — momentum keeps the old direction when heading changes | Bleed the sideways velocity component each frame (§4 lateral grip). |
| Wheels/car turn opposite to the key | Sign convention mismatch between input and the authored DOF/forward axis | Negate at one place; add a directional assertion so it can't regress. |

---

## 4. Design principles & reusable patterns

**Conditioning beats iterations.** Solver stability comes from: healthy **mass ratios** (heavy body ≫
light sub-bodies), a **compliant DOF** (a spring is an energy sink that absorbs impulse spikes), and a
**good contact shape** (a disc/cylinder gives a wider, flatter patch than a line-contact capsule).
`additionalSolverIterations` on the island is a *safety margin*, not the sole stabiliser.

**Author the DOF you can't stabilise (the "assist" pattern).** Pure physics for propulsion/steering can
be intractable on marginal rigs. The robust, convergent pattern (arcade, raycast, and now revolute all
land here): drive the chassis **yaw-rate** = `steer · gain · signedForwardSpeed` (flips correctly in
reverse) and **bleed lateral velocity** (`lateral grip`) so it tracks where it points; keep the physical
parts as rolling/visual. Set velocities via `physicsSystem.setBodyAngularVelocity/​setBodyLinearVelocity`.
This logic currently lives in `updateRevoluteVehicle` and (similarly) `updateArcadeVehicle` — **it wants
to be a shared helper**; reuse it rather than re-deriving.

**Parts of one object must not self-collide.** Wheels/limbs must not collide with their own chassis.
Filtering is awkward here because the chassis collider is owned by the collider system, not the
controller (ownership boundary, §0) — so a **geometric guarantee** (cap the DOF so the part can't reach
the body) was the pragmatic fix. Prefer real collision-group filtering if you can reach both colliders.

**Reset is part of the contract for multi-body controllers.** If `bootstrap` creates runtime-only
sub-bodies, `resetEntity` MUST bring them back to a clean standstill. **Dispose + rebuild** (identical to
a fresh spawn) is more robust than teleporting a stiff joint island. Always clear the tracked scalar
state (steer angle, ramps) even if the body path early-returns.

**Never step at dt=0 with a stiff motor.** `prepareSceneQueries()` runs a `dt=0` `world.step()`. With a
spring/position motor configured, that divides by ~zero and detonates. Configure motors so they're inert
at rest, or avoid the dt=0 step touching motorized bodies.

**Nail conventions once, test them.** Forward axis and steer sign are cheap bugs that block everything.
Centralise them (e.g. a `FORWARD_LOCAL` constant) and cover with a directional assertion.

---

## 5. Reusable primitives added along the way

- `IPhysicsWorld.createPrismaticSpringJoint(...)` — compliant suspension strut (prismatic + spring
  position motor). Use for any suspension/soft-constraint.
- `IPhysicsWorld.setBodyLinearVelocity / setBodyAngularVelocity` (by handle) — needed by resets and the
  assist pattern.
- `createBodyWithShape` / `destroyBodyWithShape` (`@haku/physics`) — pair every create with a destroy in
  `dispose`.
- Cylinder colliders now carry explicit-mass inertia (`applyExplicitMassProperties`) — safe as wheels.

---

## 6. Process notes

- **Diagnose before tuning.** A non-monotonic parameter sweep is a signal to stop tuning and hunt a
  structural bug or a sign error, not to keep sweeping. Timebox empirical tuning.
- **Log ground truth early.** Read actual body transforms/velocities/contacts (and a downward raycast
  for clearance) instead of inferring from geometry — repeatedly the fastest way to the real cause.
- **Consult the human at genuine forks** (e.g. "pure physics vs assisted", "keep the compliant DOF vs
  simplify"), with data. But don't burn the whole budget in a rabbit hole before surfacing the tradeoff.
- **Record what didn't work** in the controller's handoff doc so the next agent doesn't repeat it.
