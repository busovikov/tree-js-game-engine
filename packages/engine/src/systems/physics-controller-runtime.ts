import type { IWorld } from '@haku/core'
import {
  CameraComponent,
  PhysicsControllerComponent,
  TransformComponent,
  entityId,
} from '@haku/core'
import type {
  ArcadeVehicleController,
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

export function bootstrapCharacter(
  world: IWorld,
  physicsWorld: IPhysicsWorld,
  physicsSystem: PhysicsWorldSystem,
  tracked: Map<string, TrackedCharacter>,
): void {
  for (const id of world.query(PhysicsControllerComponent, TransformComponent)) {
    const data = world.getComponent(id, PhysicsControllerComponent)
    if (!data || data.type !== 'kinematic-character') {
      continue
    }
    const bodyHandle = physicsSystem.getBodyHandle(id)
    const shapeHandle = physicsSystem.getShapeHandle(id)
    if (!bodyHandle || !shapeHandle) {
      continue
    }
    const controller = physicsWorld.createCharacterController(bodyHandle, shapeHandle, {
      offset: data.characterShapeOffset,
      snapToGroundDistance: data.snapToGroundDistance,
      autoStepMaxHeight: data.autoStepMaxHeight,
      autoStepMinWidth: data.autoStepMinWidth,
      autoStepIncludeDynamicBodies: data.autoStepIncludeDynamicBodies,
      applyImpulsesToDynamicBodies: data.applyImpulsesToDynamicBodies,
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
): void {
  const cameraYaw = resolveCameraYaw(world)

  for (const [entityIdValue, state] of tracked) {
    const id = entityId(entityIdValue)
    const data = world.getComponent(id, PhysicsControllerComponent)
    if (!data || data.enabled === false || data.type !== 'kinematic-character') {
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

    state.controller.configure({
      offset: data.characterShapeOffset,
      snapToGroundDistance: data.snapToGroundDistance,
      autoStepMaxHeight: data.autoStepMaxHeight,
      autoStepMinWidth: data.autoStepMinWidth,
      autoStepIncludeDynamicBodies: data.autoStepIncludeDynamicBodies,
      applyImpulsesToDynamicBodies: data.applyImpulsesToDynamicBodies,
    })

    const result = state.controller.step(movement, dt)
    state.grounded = result.grounded
  }
}

interface RevoluteWheelRuntime {
  wheelBody: PhysicsBodyHandle
  wheelShape: import('@haku/physics').PhysicsShapeHandle
  joint: PhysicsJointHandle
  isSteered: boolean
  isDriven: boolean
}

export interface TrackedRevoluteVehicle {
  wheels: RevoluteWheelRuntime[]
  steerAngle: number
  steerStiffness: number
  steerDamping: number
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

    const wheels: RevoluteWheelRuntime[] = []
    for (const wheel of data.wheels) {
      const wheelWorld = transformLocalPoint(chassisTransform, wheel.wheelPosition)
      const bodyWithShape = createBodyWithShape(
        physicsWorld,
        {
          type: 'dynamic',
          transform: {
            position: wheelWorld,
            rotation: chassisTransform.rotation,
          },
          mass: 8,
        },
        {
          type: 'capsule',
          radius: data.wheelRadius,
          halfHeight: data.wheelHalfHeight,
        },
      )
      const joint = physicsWorld.createRevoluteMotorJoint({
        bodyA: chassisHandle,
        bodyB: bodyWithShape.body,
        anchorA: wheel.axlePosition,
        anchorB: [0, 0, 0],
        axis: [1, 0, 0],
      })
      wheels.push({
        wheelBody: bodyWithShape.body,
        wheelShape: bodyWithShape.shape,
        joint,
        isSteered: wheel.isSteered,
        isDriven: wheel.isDriven,
      })
    }

    tracked.set(id.value, {
      wheels,
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
    const steer = clamp(input.steer ?? 0, -1, 1)
    const targetSteer = steer * data.steerAngle
    state.steerAngle += (targetSteer - state.steerAngle) * clamp(dt * 8, 0, 1)

    const chassisVel = physicsSystem.getBodyLinearVelocity(id) ?? ([0, 0, 0] as Vec3)
    const speed = Math.hypot(chassisVel[0], chassisVel[2])
    const driveVel = throttle * data.drivenTargetVelocity

    for (const wheel of state.wheels) {
      if (wheel.isSteered) {
        physicsWorld.setRevoluteMotorPosition(
          wheel.joint,
          state.steerAngle,
          data.steerStiffness,
          data.steerDamping,
        )
      }
      if (wheel.isDriven) {
        physicsWorld.setRevoluteMotorVelocity(
          wheel.joint,
          driveVel + speed / Math.max(data.wheelRadius, 0.01),
          data.drivenFactor,
        )
      }
    }
  }
}

export function disposeRevoluteVehicle(
  physicsWorld: IPhysicsWorld,
  tracked: Map<string, TrackedRevoluteVehicle>,
): void {
  for (const state of tracked.values()) {
    for (const wheel of state.wheels) {
      physicsWorld.removeJoint(wheel.joint)
      destroyBodyWithShape(physicsWorld, wheel.wheelBody, wheel.wheelShape)
    }
  }
  tracked.clear()
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

export type { ArcadeVehicleController, KinematicCharacterController, RevoluteJointVehicleController }
