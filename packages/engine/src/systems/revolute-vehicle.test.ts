import { describe, it, expect, beforeEach } from 'vitest'
import {
  ColliderComponent,
  RigidBodyComponent,
  TransformComponent,
  PhysicsControllerComponent,
  World,
} from '@haku/core'
import { RevoluteJointVehicleControllerSchema, ColliderSchema, RigidBodySchema } from '@haku/schema'
import { createRapierPhysicsBackend, resetRapierPhysicsIds } from '@haku/physics-rapier'
import { PhysicsColliderSystem } from './physics-collider-system.js'
import { PhysicsWorldSystem, PHYSICS_CATCH_UP_POLICY } from './physics-world-system.js'
import { PhysicsControllerSystem } from './vehicle-controller-system.js'

/**
 * Behaviour spec for the reworked revolute-joint vehicle (compliant prismatic-spring suspension +
 * cylinder wheels + RWD + front steer, well-conditioned masses). These lock the properties the
 * rework set out to guarantee:
 *  - it settles flat and upright and stays finite (the old rig trapped Rapier with NaN);
 *  - it drives forward and reverses along its axis under real joint-friction propulsion;
 *  - steering changes its heading;
 *  - and — the headline — it stays stable when driven-and-steered *regardless of scene contents*
 *    and across timesteps, because the controller is now scene-independent by construction.
 * Thresholds are tolerance bands. Exact handling (straight-line tracking, steer symmetry) is left
 * loose on purpose: the RWD car oversteers and is not finely balanced yet — that's follow-up work.
 */

/** Heading (yaw) about Y, in degrees. */
function yawDeg(q: readonly number[]): number {
  return (Math.atan2(2 * (q[3] * q[1] + q[0] * q[2]), 1 - 2 * (q[1] * q[1] + q[2] * q[2])) * 180) / Math.PI
}

/** Chassis local up (+Y) rotated into world — 1 when perfectly upright, < 0 when flipped. */
function upY(q: readonly number[]): number {
  return 1 - 2 * (q[0] * q[0] + q[2] * q[2])
}

interface DriveResult {
  x: number
  y: number
  z: number
  yaw: number
  upY: number
  maxY: number
  allFinite: boolean
}

interface DriveOptions {
  throttle?: number
  steer?: number
  frames?: number
  dt?: number
  /** Scatter unrelated dynamic obstacles into the world to prove scene-independence. */
  obstacles?: boolean
}

async function drive(options: DriveOptions = {}): Promise<DriveResult> {
  const { throttle = 0, steer = 0, frames = 300, dt = 1 / 60, obstacles = false } = options

  resetRapierPhysicsIds()
  const backend = await createRapierPhysicsBackend()
  const physicsSystem = new PhysicsWorldSystem(PHYSICS_CATCH_UP_POLICY)
  physicsSystem.setBackend(backend)
  const collider = new PhysicsColliderSystem(physicsSystem)
  const controller = new PhysicsControllerSystem(physicsSystem)

  const world = new World()
  const ground = world.createEntity('Ground')
  world.addComponent(ground, TransformComponent, {
    position: [0, -2, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  })
  world.addComponent(ground, ColliderComponent, ColliderSchema.parse({ shape: 'box', halfExtents: [75, 1, 75] }))

  if (obstacles) {
    // A dozen unrelated dynamic bodies well clear of the car's path. A well-conditioned controller
    // is indifferent to them; the old rig diverged into a NaN trap once the scene got busy.
    for (let i = 0; i < 12; i++) {
      const box = world.createEntity(`Obstacle${i}`)
      const side = i % 2 === 0 ? 1 : -1
      world.addComponent(box, TransformComponent, {
        position: [(i - 6) * 3, 2 + i * 0.5, side * 20],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      })
      world.addComponent(box, RigidBodyComponent, RigidBodySchema.parse({ type: 'dynamic' }))
      world.addComponent(
        box,
        ColliderComponent,
        ColliderSchema.parse(
          i % 2 === 0 ? { shape: 'box', halfExtents: [0.5, 0.5, 0.5] } : { shape: 'sphere', radius: 0.5 },
        ),
      )
    }
  }

  const car = world.createEntity('RevoluteVehicle')
  // Spawn just above rest: wheel mount at chassis_y − 0.2, wheels droop to the platform (top y = −1).
  world.addComponent(car, TransformComponent, {
    position: [0, 0.2, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  })
  world.addComponent(
    car,
    PhysicsControllerComponent,
    RevoluteJointVehicleControllerSchema.parse({
      type: 'revolute-joint-vehicle',
      // Well-conditioned: heavy low-CoM chassis, wide track, high angular damping (yaw stability).
      chassis: { mass: 40, halfExtents: [1.6, 0.2, 1.2], lift: 0, angularDamping: 4, inertiaScale: 6 },
      // schema defaults already lay the wheels out wide (front steered, rear driven).
    }),
  )

  collider.bootstrap(world)
  controller.bootstrap(world)
  controller.setVehicleInput(car, { throttle, steer })

  let maxY = -Infinity
  let allFinite = true
  for (let i = 0; i < frames; i++) {
    controller.update(world, dt)
    physicsSystem.update(world, dt)
    const p = world.getComponent(car, TransformComponent)!.position
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) {
      allFinite = false
    }
    maxY = Math.max(maxY, p[1])
  }

  const t = world.getComponent(car, TransformComponent)!
  collider.dispose()
  physicsSystem.dispose()
  return {
    x: t.position[0],
    y: t.position[1],
    z: t.position[2],
    yaw: yawDeg(t.rotation),
    upY: upY(t.rotation),
    maxY,
    allFinite,
  }
}

describe('revolute-joint-vehicle (reworked: spring suspension + cylinder wheels + RWD)', () => {
  beforeEach(() => resetRapierPhysicsIds())

  it('settles flat and upright, bounded, with no input', async () => {
    const r = await drive({ frames: 240 })
    expect(r.allFinite).toBe(true)
    expect(r.upY).toBeGreaterThan(0.95) // sits flat on all four wheels
    expect(r.maxY).toBeLessThan(0.5) // no launch off the platform
    expect(r.y).toBeGreaterThan(-0.5) // did not sink through
    expect(Math.hypot(r.x, r.z)).toBeLessThan(1.5) // idle car barely wanders
  })

  it('drives forward along its axis under throttle', async () => {
    const r = await drive({ throttle: 1, frames: 300 })
    expect(r.allFinite).toBe(true)
    expect(r.upY).toBeGreaterThan(0.8) // stays on its wheels
    expect(Math.abs(r.x)).toBeGreaterThan(1.5) // travelled a meaningful distance under joint drive
  })

  it('reverses in the opposite direction from forward', async () => {
    const fwd = await drive({ throttle: 1, frames: 240 })
    const rev = await drive({ throttle: -1, frames: 240 })
    expect(rev.allFinite).toBe(true)
    expect(fwd.x * rev.x).toBeLessThan(0) // opposite signs along the forward axis
    expect(Math.abs(rev.x)).toBeGreaterThan(1)
  })

  it('changes heading when steered', async () => {
    const straight = await drive({ throttle: 1, frames: 300 })
    const steered = await drive({ throttle: 1, steer: 1, frames: 300 })
    expect(steered.allFinite).toBe(true)
    // Steering meaningfully alters the heading vs. driving straight (RWD oversteers, so this is large).
    expect(Math.abs(steered.yaw - straight.yaw)).toBeGreaterThan(10)
  })

  it('drives-and-steers stably regardless of scene contents (no NaN trap)', async () => {
    const bare = await drive({ throttle: 1, steer: 1, frames: 300 })
    const busy = await drive({ throttle: 1, steer: 1, frames: 300, obstacles: true })
    // Both must survive; the old rig trapped Rapier here once the scene got busy.
    expect(bare.allFinite).toBe(true)
    expect(busy.allFinite).toBe(true)
    expect(busy.upY).toBeGreaterThan(0.3) // still not flipped
    // The car's own trajectory is essentially unchanged by unrelated far-away bodies (separate islands).
    expect(Math.hypot(busy.x - bare.x, busy.z - bare.z)).toBeLessThan(2)
  })

  it('stays finite and on its wheels at a finer timestep', async () => {
    const fine = await drive({ throttle: 1, frames: 600, dt: 1 / 120 })
    expect(fine.allFinite).toBe(true)
    expect(fine.upY).toBeGreaterThan(0.8)
    expect(Math.abs(fine.x)).toBeGreaterThan(1.5)
  })
})
