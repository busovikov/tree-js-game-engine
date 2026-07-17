import type { IWorld, EntityId } from '@haku/core'
import {
  CameraComponent,
  PhysicsControllerComponent,
  TransformComponent,
  entityId,
} from '@haku/core'
import type {
  ArcadeVehicleController,
  CharacterBodyController,
  DynamicRaycastController,
  KinematicCharacterController,
  RevoluteJointVehicleController,
} from '@haku/schema'
import { controllerWheelLocalPositions } from '@haku/schema'
import type {
  DynamicRaycastWheelConfig,
  ICharacterController,
  IDynamicRaycastVehicle,
  IPhysicsWorld,
  PhysicsBodyHandle,
  PhysicsJointHandle,
  PhysicsShapeHandle,
  PhysicsTransform,
  Quat,
  Vec3,
} from '@haku/physics'
import { createBodyWithShape, destroyBodyWithShape } from '@haku/physics'
import type { ControllerInput } from '../controllers/registry.js'
import type { PhysicsWorldSystem } from './physics-world-system.js'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const CONTROLLER_REFERENCE_HZ = 60
const MAX_CONTROLLER_RAMP_DT = 1 / 20

/** Upper bound (rad/s) on a revolute wheel's driven spin target — keeps the joint solver stable. */
const MAX_WHEEL_SPIN = 50

/**
 * The vehicle's forward axis is local X, so wheels spin about the lateral Z axle. Rotate a Y-axis
 * capsule onto Z (+90° about X): quat [sin45, 0, 0, cos45].
 */
const WHEEL_AXIS_ROTATION: Quat = [Math.SQRT1_2, 0, 0, Math.SQRT1_2]

/** Revolute wheel spin axis (local lateral = Z). */
const WHEEL_SPIN_AXIS: Vec3 = [0, 0, 1]

/** Steering axis (vertical Y) — the hub→knuckle joint rotates the front wheel's heading. */
const STEER_AXIS: Vec3 = [0, 1, 0]

/** Suspension slide axis (vertical Y in chassis-local space). */
const SUSPENSION_AXIS: Vec3 = [0, 1, 0]

/**
 * Chassis-local forward — the direction the vehicle travels under positive throttle (rear wheels roll
 * it along −X). Used to sign the steering assist so a reverse turn goes the correct way.
 */
const REVOLUTE_FORWARD_LOCAL: Vec3 = [-1, 0, 0]

/**
 * Steering assist: a free-rolling wheel on a light steer knuckle is numerically twitchy — a pure joint
 * steer motor can't hold the wheel angle against the wheel's own rolling/gyroscopic disturbance (it
 * overshoots forward and diverges in reverse). So the actual heading change is driven by a bounded
 * yaw-rate on the chassis, proportional to steer × signed forward speed (turn flips in reverse, like a
 * real car). The knuckle motor stays only to point the wheels visually. This also damps the parasitic
 * yaw/wobble the free knuckles inject. GAIN is rad/s per (steer · m/s); SPEED is capped.
 */
const STEER_ASSIST_GAIN = 0.22
const STEER_ASSIST_MAX_SPEED = 12

/**
 * Lateral grip: per-second rate at which the chassis's sideways (perpendicular-to-forward) velocity is
 * bled off. Without it the low-friction front wheels let the car skate/skid (занос) — it drifts
 * sideways on a straight and slides through turns, and back-then-forward never returns to the start.
 * This makes the car track where it points. 0 = free-sliding ice, higher = more planted.
 */
const LATERAL_GRIP = 10

/**
 * Extra solver iterations for the vehicle island (Rapier default 4 → effective 4 + this). A safety
 * margin on top of the well-conditioned masses + compliant suspension, not the sole stabiliser.
 */
const WHEEL_SOLVER_ITERATIONS = 8

/** Rear (driven) wheel–ground friction for traction (Rapier default is 0.5). */
const WHEEL_FRICTION = 2.0
/** Steered front wheel friction — low, so free-rolling front wheels don't scrub and parasitically yaw. */
const WHEEL_STEER_FRICTION = 0.2

/**
 * Suspension hubs and steer knuckles are massive enough to condition the joints but must not collide
 * with the world (they sit inside the chassis footprint). Membership group 1, filter 0 → never
 * collides; carries only the suspension / steer DOF.
 */
const CARRIER_RADIUS = 0.05
const CARRIER_COLLISION_GROUPS = 0x0001_0000

function controllerReferenceSteps(dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) {
    return 0
  }
  return Math.min(dt, MAX_CONTROLLER_RAMP_DT) * CONTROLLER_REFERENCE_HZ
}

function referenceStepBlend(alpha: number, referenceSteps: number): number {
  return 1 - Math.pow(1 - alpha, referenceSteps)
}

function rotateVec3ByQuat(v: Vec3, q: Quat): Vec3 {
  const [x, y, z] = v
  const [qx, qy, qz, qw] = q
  const ix = qw * x + qy * z - qz * y
  const iy = qw * y + qz * x - qx * z
  const iz = qw * z + qx * y - qy * x
  const iw = -qx * x - qy * y - qz * z
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ]
}

function yawFromQuat(q: Quat): number {
  const [x, y, z, w] = q
  return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z))
}

function transformLocalPoint(transform: PhysicsTransform, local: Vec3): Vec3 {
  const rotated = rotateVec3ByQuat(local, transform.rotation as Quat)
  return [
    transform.position[0] + rotated[0],
    transform.position[1] + rotated[1],
    transform.position[2] + rotated[2],
  ]
}

function resolveCameraYaw(world: IWorld): number {
  for (const id of world.query(CameraComponent, TransformComponent)) {
    const camera = world.getComponent(id, CameraComponent)
    const transform = world.getComponent(id, TransformComponent)
    if (camera?.enabled !== false && transform) {
      return yawFromQuat(transform.rotation as Quat)
    }
  }
  return 0
}

export function dynamicRaycastWheelConfigs(
  controller: DynamicRaycastController,
): DynamicRaycastWheelConfig[] {
  const { wheels, suspension } = controller
  const isThreeJs = controller.driveProfile === 'threejs-rapier'
  const base = {
    radius: wheels.radius,
    directionLocal: [0, -1, 0] as Vec3,
    axleLocal: (isThreeJs ? [-1, 0, 0] : [1, 0, 0]) as Vec3,
    suspensionRestLength: suspension.restLength,
    suspensionStiffness: suspension.stiffness,
    frictionSlip: suspension.frictionSlip,
    ...(isThreeJs
      ? {}
      : {
          maxSuspensionTravel: suspension.maxTravel,
          sideFrictionStiffness: suspension.sideFrictionStiffness,
        }),
  }
  return controllerWheelLocalPositions(wheels).map((localPosition) => ({
    ...base,
    localPosition,
  }))
}

export interface TrackedDynamicRaycast {
  vehicle: IDynamicRaycastVehicle
  wheelCount: number
  /** Ramped engine force (Three.js example). */
  accelerateForce: number
  /** Ramped brake strength (Three.js example). */
  brakeForceValue: number
  /** Smoothed front-wheel steer angle (Three.js example). */
  currentSteering: number
}

export function bootstrapDynamicRaycast(
  world: IWorld,
  physicsWorld: IPhysicsWorld,
  physicsSystem: PhysicsWorldSystem,
  tracked: Map<string, TrackedDynamicRaycast>,
): void {
  for (const id of world.query(PhysicsControllerComponent, TransformComponent)) {
    const controller = world.getComponent(id, PhysicsControllerComponent)
    if (!controller || controller.type !== 'dynamic-raycast') {
      continue
    }
    const bodyHandle = physicsSystem.getBodyHandle(id)
    if (!bodyHandle) {
      continue
    }
    const vehicle = physicsWorld.createDynamicRaycastVehicle(bodyHandle)
    const configs = dynamicRaycastWheelConfigs(controller)
    for (const config of configs) {
      vehicle.addWheel(config)
    }
    tracked.set(id.value, {
      vehicle,
      wheelCount: configs.length,
      accelerateForce: 0,
      brakeForceValue: 0,
      currentSteering: 0,
    })
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Three.js `physics_rapier_vehicle_controller.html` — ramped force, FWD, smoothed steer. */
function updateThreeJsDynamicRaycast(
  controller: DynamicRaycastController,
  state: TrackedDynamicRaycast,
  input: ControllerInput,
  dt: number,
): void {
  const throttle = clamp(input.throttle ?? 0, -1, 1)
  const steer = clamp(input.steer ?? 0, -1, 1)
  const braking = input.brake === true
  const referenceSteps = controllerReferenceSteps(dt)

  let accelerateForce = state.accelerateForce
  // Haku +Z forward: W=+1 ramps toward max engine force (Three.js uses -Z forward).
  if (throttle > 0.05) {
    accelerateForce += controller.accelerateForceStep * referenceSteps
    if (accelerateForce > controller.accelerateForceMax) {
      accelerateForce = controller.accelerateForceMax
    }
  } else if (throttle < -0.05) {
    accelerateForce -= controller.accelerateForceStep * referenceSteps
    if (accelerateForce < controller.accelerateForceMin) {
      accelerateForce = controller.accelerateForceMin
    }
  }
  state.accelerateForce = accelerateForce

  let brakeForceValue = state.brakeForceValue
  if (braking) {
    brakeForceValue += controller.brakeForceStep * referenceSteps
    if (brakeForceValue > controller.brakeForceMax) {
      brakeForceValue = controller.brakeForceMax
    }
  }
  state.brakeForceValue = brakeForceValue

  const { vehicle, wheelCount } = state
  const engineForce = accelerateForce
  const steerDirection = -steer
  const targetSteer = controller.steerAngleMax * steerDirection
  const currentSteering = vehicle.getWheelSteering(0)
  const steering = lerp(
    currentSteering,
    targetSteer,
    referenceStepBlend(controller.steerLerp, referenceSteps),
  )
  state.currentSteering = steering

  for (let i = 0; i < wheelCount; i++) {
    const isFront = i < 2
    vehicle.setWheelSteering(i, isFront ? steering : 0)
    vehicle.setWheelEngineForce(i, isFront ? engineForce : 0)
    vehicle.setWheelBrake(i, braking ? brakeForceValue : 0)
  }
}

export function updateDynamicRaycast(
  world: IWorld,
  tracked: Map<string, TrackedDynamicRaycast>,
  inputs: Map<string, ControllerInput>,
  dt: number,
): void {
  for (const [entityIdValue, state] of tracked) {
    const id = entityId(entityIdValue)
    const controller = world.getComponent(id, PhysicsControllerComponent)
    if (
      !controller ||
      controller.enabled === false ||
      controller.type !== 'dynamic-raycast'
    ) {
      continue
    }
    const input = inputs.get(entityIdValue) ?? {}

    if (controller.driveProfile === 'threejs-rapier') {
      updateThreeJsDynamicRaycast(controller, state, input, dt)
      continue
    }

    const throttle = clamp(input.throttle ?? 0, -1, 1)
    const steer = clamp(input.steer ?? 0, -1, 1)
    const engineForce = throttle * controller.accelerateForce
    const brake = input.brake ? controller.brakeForce : 0
    const steerAngle = steer * controller.steerAngle

    const { vehicle, wheelCount } = state
    for (let i = 0; i < wheelCount; i++) {
      const isFront = i < 2
      const isRear = i >= 2
      vehicle.setWheelSteering(i, isFront ? steerAngle : 0)
      vehicle.setWheelEngineForce(i, isRear ? engineForce : 0)
      vehicle.setWheelBrake(i, brake)
    }
  }
}

export interface TrackedArcadeVehicle {
  currentSpeed: number
  jumpCooldown: number
}

export function bootstrapArcadeVehicle(tracked: Map<string, TrackedArcadeVehicle>): void {
  // Arcade uses chassis body only — no extra bootstrap state beyond defaults.
  void tracked
}

export function updateArcadeVehicle(
  world: IWorld,
  physicsWorld: IPhysicsWorld,
  physicsSystem: PhysicsWorldSystem,
  tracked: Map<string, TrackedArcadeVehicle>,
  inputs: Map<string, ControllerInput>,
  dt: number,
): void {
  for (const [entityIdValue, state] of tracked) {
    const id = entityId(entityIdValue)
    const controller = world.getComponent(id, PhysicsControllerComponent)
    if (
      !controller ||
      controller.enabled === false ||
      controller.type !== 'arcade-vehicle'
    ) {
      continue
    }
    const bodyHandle = physicsSystem.getBodyHandle(id)
    const transform = world.getComponent(id, TransformComponent)
    if (!bodyHandle || !transform) {
      continue
    }

    const input = inputs.get(entityIdValue) ?? {}
    const throttle = clamp(input.throttle ?? 0, -1, 1)
    const steer = clamp(input.steer ?? 0, -1, 1)
    const pos = transform.position as Vec3
    const hit = physicsWorld.raycast({
      origin: [pos[0], pos[1] + 1, pos[2]],
      direction: [0, -1, 0],
      maxDistance: 4,
      excludeBody: bodyHandle,
    })
    const grounded = hit !== null

    let jumpCooldown = Math.max(0, state.jumpCooldown - dt)
    if (input.jump && grounded && jumpCooldown <= 0) {
      physicsWorld.applyImpulse(bodyHandle, [0, controller.jumpImpulse, 0])
      jumpCooldown = 0.35
    }
    state.jumpCooldown = jumpCooldown

    const targetSpeed =
      throttle >= 0
        ? throttle * controller.maxForwardSpeed
        : throttle * Math.abs(controller.maxReverseSpeed)
    const speedBlend = referenceStepBlend(
      controller.speedLerp,
      controllerReferenceSteps(dt),
    )
    state.currentSpeed += (targetSpeed - state.currentSpeed) * speedBlend

    const forward = rotateVec3ByQuat([0, 0, 1], transform.rotation as Quat)
    const velocity = physicsSystem.getBodyLinearVelocity(id) ?? ([0, 0, 0] as Vec3)

    if (grounded) {
      const horizontalSpeed = state.currentSpeed
      const nextVel: Vec3 = [
        forward[0] * horizontalSpeed,
        velocity[1],
        forward[2] * horizontalSpeed,
      ]
      physicsSystem.setBodyLinearVelocity(id, nextVel)

      if (Math.abs(steer) > 0.01 && Math.abs(horizontalSpeed) > 0.05) {
        const yawRate = steer * controller.driftSteerRate * 60 * dt
        const ang = physicsSystem.getBodyAngularVelocity(id) ?? ([0, 0, 0] as Vec3)
        physicsSystem.setBodyAngularVelocity(id, [ang[0], ang[1] + yawRate, ang[2]])
      }

      if (Math.abs(throttle) < 0.01) {
        physicsSystem.setBodyLinearVelocity(id, [
          nextVel[0] * (1 - controller.damping * dt),
          nextVel[1],
          nextVel[2] * (1 - controller.damping * dt),
        ])
      }
    }
  }
}

export interface TrackedCharacter {
  controller: ICharacterController
  velocityXZ: Vec3
  jumpBuffer: number
  jumpCooldown: number
  grounded: boolean
}

type CharacterControllerData = KinematicCharacterController | CharacterBodyController

function characterControllerOptions(data: CharacterControllerData) {
  if (data.type === 'character-body') {
    return {
      offset: data.characterShapeOffset,
      snapToGroundDistance: data.floorSnapLength,
      autoStepMaxHeight: data.stepHeight,
      autoStepMinWidth: data.autoStepMinWidth,
      autoStepIncludeDynamicBodies: data.autoStepIncludeDynamicBodies,
      applyImpulsesToDynamicBodies: data.applyImpulsesToDynamicBodies,
    }
  }
  return {
    offset: data.characterShapeOffset,
    snapToGroundDistance: data.snapToGroundDistance,
    autoStepMaxHeight: data.autoStepMaxHeight,
    autoStepMinWidth: data.autoStepMinWidth,
    autoStepIncludeDynamicBodies: data.autoStepIncludeDynamicBodies,
    applyImpulsesToDynamicBodies: data.applyImpulsesToDynamicBodies,
  }
}

export function bootstrapCharacter(
  world: IWorld,
  physicsWorld: IPhysicsWorld,
  physicsSystem: PhysicsWorldSystem,
  tracked: Map<string, TrackedCharacter>,
  controllerType: 'kinematic-character' | 'character-body',
): void {
  for (const id of world.query(PhysicsControllerComponent, TransformComponent)) {
    const data = world.getComponent(id, PhysicsControllerComponent)
    if (!data || data.type !== controllerType) {
      continue
    }
    const bodyHandle = physicsSystem.getBodyHandle(id)
    const shapeHandle = physicsSystem.getShapeHandle(id)
    if (!bodyHandle || !shapeHandle) {
      continue
    }
    const controller = physicsWorld.createCharacterController(bodyHandle, shapeHandle, {
      ...characterControllerOptions(data),
    })
    tracked.set(id.value, {
      controller,
      velocityXZ: [0, 0, 0],
      jumpBuffer: 0,
      jumpCooldown: 0,
      grounded: false,
    })
  }
}

export function updateCharacter(
  world: IWorld,
  tracked: Map<string, TrackedCharacter>,
  inputs: Map<string, ControllerInput>,
  dt: number,
  controllerType: 'kinematic-character' | 'character-body',
): void {
  const cameraYaw = resolveCameraYaw(world)

  for (const [entityIdValue, state] of tracked) {
    const id = entityId(entityIdValue)
    const data = world.getComponent(id, PhysicsControllerComponent)
    if (!data || data.enabled === false || data.type !== controllerType) {
      continue
    }

    const input = inputs.get(entityIdValue) ?? {}
    const throttle = clamp(input.throttle ?? 0, -1, 1)
    const steer = clamp(input.steer ?? 0, -1, 1)
    const sprint = input.sprint === true ? data.sprintMultiplier : 1

    if (input.jump) {
      state.jumpBuffer = 0.15
    }
    state.jumpBuffer = Math.max(0, state.jumpBuffer - dt)
    state.jumpCooldown = Math.max(0, state.jumpCooldown - dt)

    const sin = Math.sin(cameraYaw)
    const cos = Math.cos(cameraYaw)
    const forward: Vec3 = [-sin, 0, -cos]
    const right: Vec3 = [cos, 0, -sin]
    const desired: Vec3 = [
      forward[0] * throttle + right[0] * steer,
      0,
      forward[2] * throttle + right[2] * steer,
    ]
    const desiredLen = Math.hypot(desired[0], desired[2])
    const targetSpeed = data.moveSpeed * sprint
    const targetXZ =
      desiredLen > 1e-4
        ? ([
            (desired[0] / desiredLen) * targetSpeed,
            0,
            (desired[2] / desiredLen) * targetSpeed,
          ] as Vec3)
        : ([0, 0, 0] as Vec3)

    const accelTime = state.grounded
      ? data.accelerationTimeGrounded
      : data.accelerationTimeAirborne
    const blend = clamp(dt / Math.max(accelTime, 1e-4), 0, 1)
    state.velocityXZ = [
      state.velocityXZ[0] + (targetXZ[0] - state.velocityXZ[0]) * blend,
      0,
      state.velocityXZ[2] + (targetXZ[2] - state.velocityXZ[2]) * blend,
    ]

    let movement: Vec3 = [
      state.velocityXZ[0] * dt,
      0,
      state.velocityXZ[2] * dt,
    ]

    if (state.jumpBuffer > 0 && state.jumpCooldown <= 0 && state.grounded) {
      const g = 9.81
      const jumpVel = Math.sqrt(2 * g * data.maxJumpHeight)
      movement = [movement[0], jumpVel * dt, movement[2]]
      state.jumpBuffer = 0
      state.jumpCooldown = 0.25
    }

    state.controller.configure(characterControllerOptions(data))

    const result = state.controller.step(movement, dt)
    state.grounded = result.grounded
  }
}

interface RevoluteWheelRuntime {
  wheelBody: PhysicsBodyHandle
  wheelShape: PhysicsShapeHandle
  /** Suspension hub: hangs from the chassis on a prismatic-Y spring strut. */
  hubBody: PhysicsBodyHandle
  hubShape: PhysicsShapeHandle
  /** Compliant suspension strut: chassis→hub prismatic-Y with spring position motor. */
  suspensionJoint: PhysicsJointHandle
  /** Drive joint (rear): hub→wheel revolute about the lateral axle, bounded velocity motor. */
  driveJoint?: PhysicsJointHandle
  /** Steer joint (front): hub→knuckle revolute about vertical Y, position motor. */
  steerJoint?: PhysicsJointHandle
  /** Roll joint (front): knuckle→wheel revolute about the lateral axle, free. */
  rollJoint?: PhysicsJointHandle
  /** Steer knuckle (front only): carries the steer DOF between hub and wheel. */
  knuckleBody?: PhysicsBodyHandle
  knuckleShape?: PhysicsShapeHandle
  isSteered: boolean
  isDriven: boolean
}

export interface TrackedRevoluteVehicle {
  wheels: RevoluteWheelRuntime[]
  steerAngle: number
  steerStiffness: number
  steerDamping: number
}

/**
 * Build all the sub-bodies (hubs, wheels, knuckles) and joints for one vehicle, positioned relative to
 * the given chassis pose. Shared by initial bootstrap and respawn (which disposes the old bodies and
 * rebuilds fresh — far more robust than trying to teleport a stiff joint island back into place).
 */
function buildRevoluteWheels(
  physicsWorld: IPhysicsWorld,
  chassisHandle: PhysicsBodyHandle,
  chassisTransform: PhysicsTransform,
  data: RevoluteJointVehicleController,
): RevoluteWheelRuntime[] {
  // Keep wheels/hubs well below chassis mass — a healthy ratio keeps the joint island well
    // conditioned regardless of the rest of the scene. Floor the ratio in case a scene authors a
    // heavy wheel/hub directly.
    const massCeiling = data.chassis.mass * 0.25
    const wheelMass = Math.max(0.05, Math.min(data.wheelMass ?? 1.5, massCeiling))
    const hubMass = Math.max(0.05, Math.min(data.hubMass ?? 1, massCeiling))
    // Real-suspension semantics: `suspensionRestLength` is the free droop — how far the wheel hangs
    // below its chassis mount when unloaded. The strut's slide position (hub relative to the chassis
    // anchor along +Y) is negative (wheel below mount). The spring targets full droop (−droop), so it
    // always pushes the wheel *down* toward the ground; the vehicle's weight compresses it upward by
    // up to `suspensionTravel`. Anchoring the rest at the droop limit is what guarantees every wheel
    // stays planted — a centred rest lets lightly-loaded wheels float and the chassis pitch off them.
    const droop = Math.max(0, data.suspensionRestLength)
    const suspensionTarget = -droop
    // The wheel bodies contact the world *and* the chassis body (a vehicle can't easily filter
    // self-collisions here — the chassis collider is owned by the collider system). So the strut MUST
    // NOT let a wheel compress up into the chassis: if it does, the wheel collider overlaps the
    // chassis, jams, and the vehicle locks up (wheels stop spinning, car won't drive). Cap the
    // compression per wheel at the point where the wheel's top just clears the chassis underside:
    //   mountY + pos + wheelRadius ≤ −chassisHalfY  ⇒  pos ≤ −(chassisHalfY + wheelRadius + mountY).
    const chassisHalfY = data.chassis.halfExtents[1]

    const carrierShape = {
      type: 'sphere' as const,
      radius: CARRIER_RADIUS,
      spawn: { collisionGroups: CARRIER_COLLISION_GROUPS },
    }
    const carrierBody = (position: Vec3) => ({
      type: 'dynamic' as const,
      transform: { position, rotation: chassisTransform.rotation },
      mass: hubMass,
      additionalSolverIterations: WHEEL_SOLVER_ITERATIONS,
    })

    const wheels: RevoluteWheelRuntime[] = []
    for (const wheel of data.wheels) {
      // Spawn the wheel at its suspension rest (drooped below the mount), not at the mount itself. At
      // the mount the wheel collider overlaps the chassis underside — tolerable on a fresh drop but it
      // detonates when the chassis is pinned (e.g. right after a respawn teleport). Drooped clears it.
      const wheelWorld = transformLocalPoint(chassisTransform, [
        wheel.wheelPosition[0],
        wheel.wheelPosition[1] - droop,
        wheel.wheelPosition[2],
      ])

      // Per-wheel compression cap that keeps the wheel clear of the chassis underside (see above),
      // with a small safety margin. Never tighter than the droop (which would zero the joint) and
      // never looser than the authored travel.
      const clearanceMax = -(chassisHalfY + data.wheelRadius + wheel.wheelPosition[1]) - 0.03
      const suspensionLimits = {
        min: -droop,
        max: Math.max(-droop, Math.min(clearanceMax, -droop + data.suspensionTravel)),
      }

      // Suspension hub — the sprung carrier the chassis rests on. Collides with nothing.
      const hub = createBodyWithShape(physicsWorld, carrierBody(wheelWorld), carrierShape)

      // Wheel — the only body that contacts the ground; a capsule rolled onto the lateral Z axle.
      const wheelBody = createBodyWithShape(
        physicsWorld,
        {
          type: 'dynamic',
          transform: { position: wheelWorld, rotation: chassisTransform.rotation },
          mass: wheelMass,
          additionalSolverIterations: WHEEL_SOLVER_ITERATIONS,
        },
        {
          type: 'cylinder',
          radius: data.wheelRadius,
          halfHeight: data.wheelHalfHeight,
          // Cylinder long axis is Y by default; rotate it onto the lateral Z axle so its round profile
          // rolls along X. A disc gives a wider, flatter contact than a capsule → far less roll warp.
          localTransform: { position: [0, 0, 0], rotation: WHEEL_AXIS_ROTATION },
          // Rear (driven) wheels grip for traction. Steered front wheels are deliberately low-friction:
          // as a free-rolling caster they'd otherwise scrub sideways and inject a parasitic yaw that
          // fights the steering assist. They only need to roll and carry load; the assist does the turn.
          spawn: { friction: wheel.isDriven ? WHEEL_FRICTION : WHEEL_STEER_FRICTION, restitution: 0 },
        },
      )

      // Compliant strut: chassis→hub prismatic along Y with a spring position motor. This absorbs
      // the impulse spikes that make a rigid revolute rig diverge; it's the primary stabiliser.
      const suspensionJoint = physicsWorld.createPrismaticSpringJoint({
        bodyA: chassisHandle,
        bodyB: hub.body,
        anchorA: wheel.wheelPosition,
        anchorB: [0, 0, 0],
        axis: SUSPENSION_AXIS,
        restLength: suspensionTarget,
        stiffness: data.suspensionStiffness,
        damping: data.suspensionDamping,
        limits: suspensionLimits,
      })

      if (wheel.isSteered) {
        // Steer + roll need two DOF. A knuckle between hub and wheel carries the steer motor about Y;
        // the wheel then rolls freely about the lateral axle and points where the knuckle turns.
        const knuckle = createBodyWithShape(physicsWorld, carrierBody(wheelWorld), carrierShape)
        const steerJoint = physicsWorld.createRevoluteMotorJoint({
          bodyA: hub.body,
          bodyB: knuckle.body,
          anchorA: [0, 0, 0],
          anchorB: [0, 0, 0],
          axis: STEER_AXIS,
        })
        const rollJoint = physicsWorld.createRevoluteMotorJoint({
          bodyA: knuckle.body,
          bodyB: wheelBody.body,
          anchorA: [0, 0, 0],
          anchorB: [0, 0, 0],
          axis: WHEEL_SPIN_AXIS,
        })
        wheels.push({
          wheelBody: wheelBody.body,
          wheelShape: wheelBody.shape,
          hubBody: hub.body,
          hubShape: hub.shape,
          suspensionJoint,
          steerJoint,
          rollJoint,
          knuckleBody: knuckle.body,
          knuckleShape: knuckle.shape,
          isSteered: true,
          isDriven: false,
        })
        continue
      }

      // Driven wheel: hub→wheel revolute about the lateral axle, driven by a bounded velocity motor.
      const driveJoint = physicsWorld.createRevoluteMotorJoint({
        bodyA: hub.body,
        bodyB: wheelBody.body,
        anchorA: [0, 0, 0],
        anchorB: [0, 0, 0],
        axis: WHEEL_SPIN_AXIS,
      })
      wheels.push({
        wheelBody: wheelBody.body,
        wheelShape: wheelBody.shape,
        hubBody: hub.body,
        hubShape: hub.shape,
        suspensionJoint,
        driveJoint,
        isSteered: false,
        isDriven: wheel.isDriven,
      })
    }

  return wheels
}

export function bootstrapRevoluteVehicle(
  world: IWorld,
  physicsWorld: IPhysicsWorld,
  physicsSystem: PhysicsWorldSystem,
  tracked: Map<string, TrackedRevoluteVehicle>,
): void {
  for (const id of world.query(PhysicsControllerComponent, TransformComponent)) {
    const data = world.getComponent(id, PhysicsControllerComponent)
    if (!data || data.type !== 'revolute-joint-vehicle') {
      continue
    }
    const chassisHandle = physicsSystem.getBodyHandle(id)
    const chassisTransform = physicsSystem.getBodyTransform(id)
    if (!chassisHandle || !chassisTransform) {
      continue
    }
    tracked.set(id.value, {
      wheels: buildRevoluteWheels(physicsWorld, chassisHandle, chassisTransform, data),
      steerAngle: 0,
      steerStiffness: data.steerStiffness,
      steerDamping: data.steerDamping,
    })
  }
}

export function updateRevoluteVehicle(
  world: IWorld,
  physicsWorld: IPhysicsWorld,
  physicsSystem: PhysicsWorldSystem,
  tracked: Map<string, TrackedRevoluteVehicle>,
  inputs: Map<string, ControllerInput>,
  dt: number,
): void {
  for (const [entityIdValue, state] of tracked) {
    const id = entityId(entityIdValue)
    const data = world.getComponent(id, PhysicsControllerComponent)
    if (
      !data ||
      data.enabled === false ||
      data.type !== 'revolute-joint-vehicle'
    ) {
      continue
    }
    const input = inputs.get(entityIdValue) ?? {}
    const throttle = clamp(input.throttle ?? 0, -1, 1)
    // Negated so the wheels and the car turn *toward* the steer input (positive steer → turn right).
    const steer = -clamp(input.steer ?? 0, -1, 1)
    const targetSteer = steer * data.steerAngle
    state.steerAngle += (targetSteer - state.steerAngle) * clamp(dt * 8, 0, 1)

    // Commanded wheel spin at the current throttle. Symmetric in reverse; the bounded motor force
    // (drivenFactor) and tyre friction do the rest — no runaway target fed into the solver.
    const targetSpin = clamp(
      throttle * data.drivenTargetVelocity,
      -MAX_WHEEL_SPIN,
      MAX_WHEEL_SPIN,
    )

    for (const wheel of state.wheels) {
      if (wheel.isSteered && wheel.steerJoint) {
        // Steer the knuckle about Y (real heading change) — not the wheel's spin.
        physicsWorld.setRevoluteMotorPosition(
          wheel.steerJoint,
          state.steerAngle,
          data.steerStiffness,
          data.steerDamping,
        )
      }
      if (wheel.isDriven && wheel.driveJoint) {
        physicsWorld.setRevoluteMotorVelocity(wheel.driveJoint, targetSpin, data.drivenFactor)
      }
    }

    // Steering assist (see STEER_ASSIST_* above): the chassis yaw-rate is *authored* to
    // steer × signed-forward-speed. Overriding (not nudging) is deliberate — the free steer knuckles
    // inject a strong parasitic yaw that a gentle assist can't cancel, so the car would veer with no
    // input. Forcing yaw = target means steer 0 locks the heading dead straight and steer alone turns
    // the car (the turn correctly flips in reverse, since signedSpeed flips).
    const chassisTransform = physicsSystem.getBodyTransform(id)
    if (chassisTransform) {
      const forward = rotateVec3ByQuat(REVOLUTE_FORWARD_LOCAL, chassisTransform.rotation as Quat)
      const vel = physicsSystem.getBodyLinearVelocity(id) ?? ([0, 0, 0] as Vec3)
      const signedSpeed = clamp(
        vel[0] * forward[0] + vel[2] * forward[2],
        -STEER_ASSIST_MAX_SPEED,
        STEER_ASSIST_MAX_SPEED,
      )
      const targetYawRate = steer * data.steerAngle * STEER_ASSIST_GAIN * signedSpeed
      const ang = physicsSystem.getBodyAngularVelocity(id) ?? ([0, 0, 0] as Vec3)
      physicsSystem.setBodyAngularVelocity(id, [ang[0], targetYawRate, ang[2]])

      // Lateral grip: bleed off the sideways component of horizontal velocity so the car tracks where
      // it points instead of skating (the low-friction front wheels have no lateral bite of their own).
      const right: Vec3 = [forward[2], 0, -forward[0]]
      const lateral = vel[0] * right[0] + vel[2] * right[2]
      const bleed = lateral * clamp(dt * LATERAL_GRIP, 0, 1)
      physicsSystem.setBodyLinearVelocity(id, [
        vel[0] - right[0] * bleed,
        vel[1],
        vel[2] - right[2] * bleed,
      ])
    }
  }
}

/** Remove all joints and destroy all sub-bodies for one vehicle's wheels. */
function disposeRevoluteWheels(physicsWorld: IPhysicsWorld, wheels: RevoluteWheelRuntime[]): void {
  for (const wheel of wheels) {
    physicsWorld.removeJoint(wheel.suspensionJoint)
    if (wheel.driveJoint) {
      physicsWorld.removeJoint(wheel.driveJoint)
    }
    if (wheel.steerJoint) {
      physicsWorld.removeJoint(wheel.steerJoint)
    }
    if (wheel.rollJoint) {
      physicsWorld.removeJoint(wheel.rollJoint)
    }
    destroyBodyWithShape(physicsWorld, wheel.wheelBody, wheel.wheelShape)
    destroyBodyWithShape(physicsWorld, wheel.hubBody, wheel.hubShape)
    if (wheel.knuckleBody) {
      destroyBodyWithShape(physicsWorld, wheel.knuckleBody, wheel.knuckleShape)
    }
  }
}

export function disposeRevoluteVehicle(
  physicsWorld: IPhysicsWorld,
  tracked: Map<string, TrackedRevoluteVehicle>,
): void {
  for (const state of tracked.values()) {
    disposeRevoluteWheels(physicsWorld, state.wheels)
  }
  tracked.clear()
}

/**
 * Respawn: bring the whole vehicle back to a clean standstill. The chassis body is reset by the respawn
 * system, but the wheel/hub/knuckle bodies are runtime-only (not entities), so they keep their old
 * poses, spin and momentum — the stiff joint island then yanks the chassis and the car detonates /
 * spins on the spot instead of standing still. Rather than fight that by teleporting the island (which
 * leaves the joints' internal state inconsistent and still explodes), just **dispose and rebuild** the
 * sub-bodies from scratch against the freshly-reset chassis — identical to a first spawn, which is
 * stable. Must run AFTER the chassis has been reset (respawn ordering guarantees this).
 */
export function resetRevoluteVehicle(
  world: IWorld,
  physicsWorld: IPhysicsWorld,
  physicsSystem: PhysicsWorldSystem,
  tracked: Map<string, TrackedRevoluteVehicle>,
  id: EntityId,
): void {
  const state = tracked.get(id.value)
  if (!state) {
    return
  }
  state.steerAngle = 0
  const data = world.getComponent(id, PhysicsControllerComponent)
  const chassisHandle = physicsSystem.getBodyHandle(id)
  const chassisTransform = physicsSystem.getBodyTransform(id)
  if (!data || data.type !== 'revolute-joint-vehicle' || !chassisHandle || !chassisTransform) {
    return
  }
  // Dispose the old sub-bodies FIRST so the chassis is joint-free, then re-seat it cleanly (the
  // respawn teleport ran while the far-away old wheels were still jointed to it), and only then
  // rebuild fresh — identical to a first spawn, which is stable. (A very long, fast drive before the
  // reset can still leave Rapier's island/broad-phase state stale enough to jolt on the next step;
  // that residual is a known limitation.)
  disposeRevoluteWheels(physicsWorld, state.wheels)
  physicsWorld.setBodyTransform(chassisHandle, chassisTransform)
  physicsWorld.setBodyLinearVelocity(chassisHandle, [0, 0, 0])
  physicsWorld.setBodyAngularVelocity(chassisHandle, [0, 0, 0])
  state.wheels = buildRevoluteWheels(physicsWorld, chassisHandle, chassisTransform, data)
}

export function ensureArcadeTracked(
  world: IWorld,
  tracked: Map<string, TrackedArcadeVehicle>,
): void {
  for (const id of world.query(PhysicsControllerComponent)) {
    const data = world.getComponent(id, PhysicsControllerComponent)
    if (!data || data.enabled === false || data.type !== 'arcade-vehicle') {
      continue
    }
    if (!tracked.has(id.value)) {
      tracked.set(id.value, { currentSpeed: 0, jumpCooldown: 0 })
    }
  }
}

export type { ArcadeVehicleController, CharacterBodyController, KinematicCharacterController, RevoluteJointVehicleController }
