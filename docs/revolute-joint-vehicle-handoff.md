# revolute-joint-vehicle — reworked architecture (handoff)

Supersedes the old crash-fix handoff. All changes are **uncommitted** in the working tree.

> **Refactoring any controller?** The generalized, actionable lessons from this rework live in
> [physics-controller-playbook.md](./physics-controller-playbook.md) — read that first. This doc is the
> case study behind it.

## What this is

A ground-up rework of the `revolute-joint-vehicle` controller. The old rig (light chassis + rigid
revolute wheels + light steering knuckles + stiff motors) was numerically fragile and trapped Rapier
with `RuntimeError: unreachable`. The premise of the rework (per the design discussion): a vehicle
controller must be **stable independent of scene contents** — proven achievable because the
raycast-vehicle in the same scenes never destabilises (single well-conditioned body + forces).

## New architecture

Per wheel, hanging off the chassis:
- **Suspension**: `chassis → hub` **prismatic-Y with a spring position motor** (new
  `createPrismaticSpringJoint` API). Rest = full droop, so the spring always pushes the wheel *down*
  and the vehicle weight compresses it up — this keeps every wheel planted (a centred rest lets
  lightly-loaded wheels float and the chassis pitch/roll off them). Only the droop (min) limit is
  hard; the compression limit is deliberately slack — a tight upper limit fights the ground reaction
  and **detonates the strut** (wheel flung above the chassis).
- **Rear (driven)**: `hub → wheel` revolute about the lateral axle, bounded velocity motor.
- **Front (steered)**: `hub → knuckle` revolute-Y (steer position motor) + `knuckle → wheel`
  revolute-Z (free roll).
- **Wheels are cylinders** (not capsules): a disc gives a wider, flatter contact → far less roll warp.
- **Well-conditioned masses**: chassis ~40 kg, wheels ~1.5 kg, hubs/knuckles ~1 kg; low CoM, wide
  track, high chassis angular damping (yaw stability).

## Status

Working (covered by `packages/engine/src/systems/revolute-vehicle.test.ts`, 6 tests, all green):
- Settles **flat and upright** on all four wheels, finite, bounded — no NaN trap.
- **Drives forward and reverses** along its axis under real joint-friction propulsion.
- **Steering changes heading.**
- **Drive + steer with unrelated obstacles** in the world stays finite and on its wheels.
- Stable at a finer timestep (1/120).

The shipped demo scene (`revolute-scene.test.ts`) drives through the **full play-mode pipeline with
auto-bootstrap** (exactly like the editor — systems bootstrap on their first `update()`, no explicit
bootstrap phase) and actually moves, not just "doesn't crash".

### Critical fix: wheel/chassis jam (was: "car falls and just stands, wheels don't turn")

The vehicle's wheel colliders contact the world *and* its own chassis collider (self-collision can't
easily be filtered here — the chassis collider is owned by the collider system, not the controller).
If the suspension let a wheel compress *up into* the chassis, the wheel collider overlapped the
chassis, **jammed**, and the whole vehicle locked (wheels wouldn't spin, car wouldn't drive) — while
still settling and looking fine. This is bistable/chaotic: explicit-bootstrap often landed in the good
basin, but the editor's auto-bootstrap reliably landed in the jammed one. Fix: cap suspension
compression **per wheel** at the point where the wheel top just clears the chassis underside
(`pos ≤ −(chassisHalfY + wheelRadius + mountY)`), so the wheel can never reach the chassis.
Side effect: usable suspension travel is small with the current geometry — for dramatic visible travel,
lower the wheel mounts (more headroom) or add real vehicle-part collision filtering.

### Critical fix: steering ("front wheels caster like a shopping-cart wheel; car won't turn")

The steer position-motor stiffness was far too low (1500). A revolute *velocity* motor at factor 2500
drives the wheels fine, but a *position* motor needs a much higher gain to hold a steered wheel against
tyre scrub — at 1500 the front knuckles simply free-swivelled (caster), so the wheels didn't point and
the car drove straight. Raising `steerStiffness` helped the *stationary* wheel visual but **pure joint steering turned out to
be intractable**: a free-rolling wheel on a light steer knuckle is dynamically twitchy — even at a
rack-stiff motor (500k) the steer angle overshoots forward and diverges in reverse (the "reverse turns
uncontrollably / wheels wobble" report), and the free front wheels scrub-inject a parasitic yaw so the
car veers with no input.

Final steering design (three parts):
1. **Chassis yaw assist** authors the actual turning: `angVel.y = steer · steerAngle · GAIN ·
   signedForwardSpeed` (overriding, so steer 0 locks the heading straight; the turn flips correctly in
   reverse). This is the arcade/raycast-style robust path — the only reliable one here.
2. **Low-friction front wheels** (`WHEEL_STEER_FRICTION = 0.2`, rear stay at 2.0): the steered wheels
   are free-rolling casters, so low grip stops them scrubbing and injecting the parasitic yaw the assist
   would otherwise fight. They only roll and carry load.
3. **Heavy steer knuckle** (`hubMass` default 3) + **stiff steer motor** (`steerStiffness` 200000):
   purely to *point the front wheels visually* into the turn without jitter — they hold ~25–30° relative
   to the chassis, symmetric L/R. The visual is cosmetic; handling comes from (1).

Result: drives, reverses, and turns controllably and symmetrically; straight input goes straight.
`revolute-scene.test.ts` asserts it both drives **and** turns through the editor auto-bootstrap path.

### Feel fixes (steering sign, drift, respawn)

- **Steering sign** was inverted (wheels/car turned opposite to the key) — the assist + visual steer
  input is negated so positive steer turns toward the press.
- **Drift / skid (занос)**: the low-friction front wheels let the chassis skate sideways (straight
  drives wandered, turns slid, back-then-forward never returned). Added **lateral grip** — each frame
  the sideways component of the chassis velocity is bled off (`LATERAL_GRIP`), so the car tracks where
  it points. Straight-line lateral drift dropped ~4× and the car no longer skids through turns.
- **Respawn spin/launch**: the wheel/hub/knuckle bodies are runtime-only (not entities), so the old
  respawn (which reset only the chassis + zeroed motors) left them with their driven poses/momentum and
  the joints spun the car on the spot. `resetRevoluteVehicle` now **disposes and rebuilds** all
  sub-bodies against the freshly-reset chassis (via `IPhysicsWorld.setBodyLinearVelocity/
  setBodyAngularVelocity`, newly exposed). Clean for settle/short/medium drives.

### Known remaining issues (follow-up)

1. **Respawn after a very long, fast drive can still jolt.** Every sub-body reads as a clean standstill
   after the rebuild, yet the first physics step occasionally launches the car — the poison is in
   Rapier's island/broad-phase state that survives a large teleport, and it resisted every body-level
   fix (chassis re-seat, clearForces/wake, fresh rebuild, assist disabled). Short/medium drives reset
   fine. A fuller fix likely needs recreating the chassis body itself, or a physics-world-level reset.
2. **Forward is stronger than reverse** (~15 vs ~9 m over equal time from rest) — a real drive
   asymmetry, so back-then-forward doesn't perfectly return. Not yet root-caused.

## Known limitations (follow-up)

1. **Handling is not finely balanced.** The RWD car oversteers/spins under hard steer, and straight
   tracking wanders a few degrees — it's marginally roll/yaw stable. Proper fix is real vehicle
   dynamics: Ackermann steer, a differential, front/rear grip + weight balance, maybe an anti-roll
   coupling. The tests assert stability + drive/reverse + "steering has an effect", not fine handling.
2. **Not yet fully scene-independent.** The suspension is stable on its own but still marginal enough
   that a *busy* scene (ramp + bumps + a dozen dynamic props) can tip it into a frame-~30 divergence,
   even with no input. So the demo scene ships **without** those obstacles by default. They are
   opt-in in the generator via `REVOLUTE_OBSTACLES=1` — re-enable once the suspension is hardened
   (more damping headroom / anti-roll / lower marginal sensitivity), which is the real remaining work
   to honour the "scene-independent" goal.

## Files changed

- **New joint API** — `createPrismaticSpringJoint` (compliant suspension strut) across
  `packages/physics/src/{joints,world,backend,physics-world,index}.ts`, the Rapier backend
  (`prismatic` + `configureMotorPosition` + slack limit) and the stub backend; covered in
  `rapier-backend.test.ts`. Also added cylinder inertia to `applyExplicitMassProperties`.
- **Schema** — `packages/schema/src/physics-controller.ts`: dropped `axlePosition`; added `hubMass`
  and suspension fields; retuned defaults (droop rest, cylinder-friendly). `physics-controller.test.ts`
  updated.
- **Runtime** — `packages/engine/src/systems/physics-controller-runtime.ts`: full rewrite of
  `bootstrap/update/disposeRevoluteVehicle` and `RevoluteWheelRuntime` (hub + suspension + drive/steer/
  roll joints, cylinder wheels, droop-anchored spring). Plugin `resetEntity` updated to `driveJoint`.
- **Editor** — `PhysicsControllerFields.tsx`: hub + suspension inspector fields.
- **Scene** — `scripts/generate-isaac-sketch-scenes.mjs` regenerates
  `apps/playground/.../isaac/revolute-joint-vehicle.scene.json` (well-conditioned car, cylinder wheel
  meshes; obstacles opt-in).
- **Tests** — new `revolute-vehicle.test.ts` (behaviour) + `revolute-scene.test.ts` (scene file,
  driven+steered through the pipeline). Old diagnostic tests removed.

## Verify

```
npx vitest run                       # 368 pass
pnpm -r run build                    # clean
node scripts/generate-isaac-sketch-scenes.mjs   # regenerate the stable demo scene
```
Manual: open "Isaac — Revolute Joint Vehicle" in the editor (rebuild + hard reload), drive + steer;
watch the suspension compress as it settles and rolls. (Lint has 2 pre-existing errors unrelated to
this work: `collider-section.test.tsx` unused import, `rapier-backend.test.ts` `matrix` var.)
```
```
