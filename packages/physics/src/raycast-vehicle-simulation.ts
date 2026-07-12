import type { PhysicsBodyHandle, PhysicsWheelHandle } from './handles.js'
import type { WheelConfig } from './raycast-vehicle.js'
import type { PhysicsTransform, RaycastHit, RaycastQuery, Vec3, Quat } from './types.js'
import {
  calcRollingFriction,
  resolveSingleBilateralConstraint,
} from './raycast-vehicle-friction.js'
import {
  addVec3,
  crossVec3,
  dotVec3,
  normalizeVec3,
  rotateVec3ByQuat,
  scaleVec3,
  subVec3,
  transformLocalPoint,
  velocityAtWorldPoint,
} from './vec-math.js'

/** Haku convention: Y-up, +Z forward, +X right (Isaac Mason axis indices). */
const INDEX_RIGHT_AXIS = 0
const INDEX_FORWARD_AXIS = 2
const INDEX_UP_AXIS = 1

const AXIS_DIRECTIONS: readonly Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]

const DEFAULT_DIRECTION_LOCAL: Vec3 = [0, -1, 0]
const DEFAULT_AXLE_LOCAL: Vec3 = [1, 0, 0]

const DEFAULT_MAX_SUSPENSION_FORCE = 100_000
const DEFAULT_SIDE_FRICTION_STIFFNESS = 1
const DEFAULT_FORWARD_ACCELERATION = 1
const DEFAULT_SIDE_ACCELERATION = 1
const FRICTION_FWD_FACTOR = 0.5
const FRICTION_SIDE_FACTOR = 1

/** Mutable per-wheel runtime used by the shared Isaac Mason raycast vehicle solver. */
export interface WheelRuntime {
  config: WheelConfig
  steering: number
  engineForce: number
  brake: number
  rotation: number
  inContact: boolean
  contactPoint: Vec3 | null
  suspensionLength: number
  prevSuspensionLength: number
}

export interface RaycastVehicleSimulationHooks {
  raycast(query: RaycastQuery): RaycastHit | null
  getChassisTransform(chassis: PhysicsBodyHandle): PhysicsTransform
  getChassisLinearVelocity(chassis: PhysicsBodyHandle): Vec3
  getChassisAngularVelocity(chassis: PhysicsBodyHandle): Vec3
  getChassisMass(chassis: PhysicsBodyHandle): number
  getInverseMass(body: PhysicsBodyHandle): number
  getVelocityAtWorldPoint(body: PhysicsBodyHandle, worldPoint: Vec3): Vec3
  getImpulseDenominator(body: PhysicsBodyHandle, worldPoint: Vec3, normal: Vec3): number
  applyBodyImpulseAtPoint(body: PhysicsBodyHandle, impulse: Vec3, worldPoint: Vec3): void
}

export interface RaycastVehicleStepResult {
  wheel: PhysicsWheelHandle
  inContact: boolean
  contactPoint: Vec3 | null
  suspensionLength: number
  rotation: number
  steering: number
  engineForce: number
}

interface WheelStepState {
  wheelId: string
  wheel: WheelRuntime
  directionWorld: Vec3
  axleWorld: Vec3
  chassisConnectionWorld: Vec3
  hitNormalWorld: Vec3
  hitPointWorld: Vec3
  groundBody: PhysicsBodyHandle | null
  suspensionRelativeVelocity: number
  clippedInvContactDotSuspension: number
  suspensionForce: number
  worldRotation: Quat
  worldPosition: Vec3
  axle: Vec3
  forwardWS: Vec3
  sideImpulse: number
  forwardImpulse: number
  skidInfo: number
  sliding: boolean
  deltaRotation: number
}

/**
 * Isaac Mason `RapierRaycastVehicle` update loop (faithful port).
 * @see https://github.com/isaac-mason/sketches/blob/1d474e6713a972c76dcabe8c8b074292d0e9d169/sketches/rapier/custom-raycast-vehicle/src/lib/rapier-raycast-vehicle.ts
 */
export function stepRaycastVehicle(
  chassis: PhysicsBodyHandle,
  wheels: ReadonlyMap<string, WheelRuntime>,
  hooks: RaycastVehicleSimulationHooks,
  dt: number,
): RaycastVehicleStepResult[] {
  const transform = hooks.getChassisTransform(chassis)
  const linearVelocity = hooks.getChassisLinearVelocity(chassis)
  const angularVelocity = hooks.getChassisAngularVelocity(chassis)
  const chassisMass = hooks.getChassisMass(chassis)
  const center = transform.position
  const chassisRotation = transform.rotation

  const states: WheelStepState[] = []
  for (const [wheelId, wheel] of wheels) {
    states.push(createWheelStepState(wheelId, wheel))
  }

  updateWheelTransforms(states, transform)
  updateWheelSuspension(states, chassis, hooks, chassisMass)
  applyWheelSuspensionForces(states, chassis, hooks, dt)
  updateFriction(states, chassis, hooks, dt)
  applyFrictionImpulses(states, chassis, hooks, chassisRotation)
  updateWheelRotation(states, linearVelocity, angularVelocity, center, chassisRotation, dt)

  const results: RaycastVehicleStepResult[] = []
  for (const state of states) {
    const { wheel, wheelId } = state
    results.push({
      wheel: { value: wheelId } as PhysicsWheelHandle,
      inContact: wheel.inContact,
      contactPoint: wheel.contactPoint,
      suspensionLength: wheel.suspensionLength,
      rotation: wheel.rotation,
      steering: wheel.steering,
      engineForce: wheel.engineForce,
    })
  }

  return results
}

/** Wheel center pose in world space (matches Isaac Mason `updateWheelTransform`). */
export function computeWheelWorldPose(
  chassisTransform: PhysicsTransform,
  config: WheelConfig,
  steering: number,
  rotation: number,
  suspensionLength: number,
): { worldPosition: Vec3; worldRotation: Quat } {
  const chassisConnectionWorld = transformLocalPoint(chassisTransform, config.localPosition)
  const directionWorld = rotateVec3ByQuat(wheelDirectionLocal(config), chassisTransform.rotation)

  const directionLocal = wheelDirectionLocal(config)
  const axleLocal = wheelAxleLocal(config)
  const up = negateVec3(directionLocal)
  const right = [...axleLocal] as Vec3

  const steeringOrn = quatFromAxisAngle(up, steering)
  const rotatingOrn = quatFromAxisAngle(right, rotation)
  const worldRotation = multiplyQuaternions(
    multiplyQuaternions(chassisTransform.rotation, steeringOrn),
    rotatingOrn,
  )
  const worldPosition = addVec3(
    chassisConnectionWorld,
    scaleVec3(directionWorld, suspensionLength),
  )

  return { worldPosition, worldRotation }
}

function createWheelStepState(wheelId: string, wheel: WheelRuntime): WheelStepState {
  return {
    wheelId,
    wheel,
    directionWorld: [0, 0, 0],
    axleWorld: [0, 0, 0],
    chassisConnectionWorld: [0, 0, 0],
    hitNormalWorld: [0, 0, 0],
    hitPointWorld: [0, 0, 0],
    groundBody: null,
    suspensionRelativeVelocity: 0,
    clippedInvContactDotSuspension: 1,
    suspensionForce: 0,
    worldRotation: [0, 0, 0, 1],
    worldPosition: [0, 0, 0],
    axle: [0, 0, 0],
    forwardWS: [0, 0, 0],
    sideImpulse: 0,
    forwardImpulse: 0,
    skidInfo: 1,
    sliding: false,
    deltaRotation: 0,
  }
}

function wheelDirectionLocal(config: WheelConfig): Vec3 {
  return config.directionLocal ?? DEFAULT_DIRECTION_LOCAL
}

function wheelAxleLocal(config: WheelConfig): Vec3 {
  return config.axleLocal ?? DEFAULT_AXLE_LOCAL
}

function updateWheelTransformWorld(state: WheelStepState, transform: PhysicsTransform): void {
  const { wheel } = state
  state.chassisConnectionWorld = transformLocalPoint(transform, wheel.config.localPosition)
  state.directionWorld = rotateVec3ByQuat(wheelDirectionLocal(wheel.config), transform.rotation)
  state.axleWorld = rotateVec3ByQuat(wheelAxleLocal(wheel.config), transform.rotation)
}

function updateWheelTransforms(states: WheelStepState[], transform: PhysicsTransform): void {
  for (const state of states) {
    const { wheel } = state
    updateWheelTransformWorld(state, transform)

    const suspLength = wheel.suspensionLength
    const pose = computeWheelWorldPose(
      transform,
      wheel.config,
      wheel.steering,
      wheel.rotation,
      suspLength,
    )
    state.worldRotation = pose.worldRotation
    state.worldPosition = pose.worldPosition
  }
}

function updateWheelSuspension(
  states: WheelStepState[],
  chassis: PhysicsBodyHandle,
  hooks: RaycastVehicleSimulationHooks,
  chassisMass: number,
): void {
  for (const state of states) {
    const { wheel } = state
    const config = wheel.config

    updateWheelTransformWorld(state, hooks.getChassisTransform(chassis))

    const rayLength = config.radius + config.suspensionRestLength
    const direction = normalizeVec3(state.directionWorld)

    const hit = hooks.raycast({
      origin: state.chassisConnectionWorld,
      direction,
      maxDistance: rayLength,
      excludeBody: chassis,
    })

    wheel.inContact = false
    wheel.contactPoint = null
    state.groundBody = null
    state.suspensionForce = 0

    if (hit) {
      state.groundBody = hit.body
      wheel.inContact = true
      wheel.contactPoint = hit.point
      state.hitNormalWorld = [...hit.normal] as Vec3
      state.hitPointWorld = [...hit.point] as Vec3

      const rawLength = hit.distance - config.radius
      const minLength = config.suspensionRestLength - config.maxSuspensionTravel
      const maxLength = config.suspensionRestLength + config.maxSuspensionTravel
      let suspensionLength = rawLength

      if (suspensionLength < minLength) {
        suspensionLength = minLength
      }
      if (suspensionLength > maxLength) {
        suspensionLength = maxLength
        wheel.inContact = false
        wheel.contactPoint = null
        state.groundBody = null
        state.hitNormalWorld = [0, 0, 0]
        state.hitPointWorld = [0, 0, 0]
      }

      wheel.suspensionLength = suspensionLength

      const denominator = dotVec3(state.hitNormalWorld, state.directionWorld)
      const contactVel = velocityAtWorldPoint(
        hooks.getChassisTransform(chassis).position,
        hooks.getChassisLinearVelocity(chassis),
        hooks.getChassisAngularVelocity(chassis),
        state.hitPointWorld,
      )
      const projVel = dotVec3(state.hitNormalWorld, contactVel)

      if (denominator >= -0.1) {
        state.suspensionRelativeVelocity = 0
        state.clippedInvContactDotSuspension = 1 / 0.1
      } else {
        const inv = -1 / denominator
        state.suspensionRelativeVelocity = projVel * inv
        state.clippedInvContactDotSuspension = inv
      }
    } else {
      wheel.suspensionLength = config.suspensionRestLength
      state.suspensionRelativeVelocity = 0
      state.hitNormalWorld = scaleVec3(state.directionWorld, -1)
      state.clippedInvContactDotSuspension = 1
    }

    if (wheel.inContact) {
      const compression = config.suspensionRestLength - wheel.suspensionLength
      let force =
        compression * config.suspensionStiffness * state.clippedInvContactDotSuspension
      const damper =
        state.suspensionRelativeVelocity < 0
          ? config.dampingCompression * state.suspensionRelativeVelocity
          : config.dampingRelaxation * state.suspensionRelativeVelocity
      force -= damper

      state.suspensionForce = force * chassisMass
      if (state.suspensionForce < 0) {
        state.suspensionForce = 0
      }
    }

    wheel.prevSuspensionLength = wheel.suspensionLength
  }
}

function applyWheelSuspensionForces(
  states: WheelStepState[],
  chassis: PhysicsBodyHandle,
  hooks: RaycastVehicleSimulationHooks,
  dt: number,
): void {
  for (const state of states) {
    if (!state.wheel.inContact) {
      continue
    }

    const maxForce = state.wheel.config.maxSuspensionForce ?? DEFAULT_MAX_SUSPENSION_FORCE
    let suspensionForce = state.suspensionForce
    if (suspensionForce > maxForce) {
      suspensionForce = maxForce
    }

    const impulse = scaleVec3(state.hitNormalWorld, suspensionForce * dt)
    hooks.applyBodyImpulseAtPoint(chassis, impulse, state.chassisConnectionWorld)
  }
}

function updateFriction(
  states: WheelStepState[],
  chassis: PhysicsBodyHandle,
  hooks: RaycastVehicleSimulationHooks,
  dt: number,
): void {
  for (const state of states) {
    state.sideImpulse = 0
    state.forwardImpulse = 0

    if (!state.wheel.inContact || !state.groundBody) {
      continue
    }

    const rightAxis = AXIS_DIRECTIONS[INDEX_RIGHT_AXIS]!
    state.axle = rotateVec3ByQuat(rightAxis, state.worldRotation)

    const surfNormal = state.hitNormalWorld
    const proj = dotVec3(state.axle, surfNormal)
    state.axle = subVec3(state.axle, scaleVec3(surfNormal, proj))
    state.axle = normalizeVec3(state.axle)

    state.forwardWS = normalizeVec3(crossVec3(surfNormal, state.axle))

    const sideFrictionStiffness =
      state.wheel.config.sideFrictionStiffness ?? DEFAULT_SIDE_FRICTION_STIFFNESS
    state.sideImpulse =
      resolveSingleBilateralConstraint(
        hooks,
        chassis,
        state.hitPointWorld,
        state.groundBody,
        state.hitPointWorld,
        state.axle,
      ) * sideFrictionStiffness
  }

  let vehicleSliding = false

  for (const state of states) {
    state.skidInfo = 1
    state.sliding = false

    if (!state.groundBody) {
      continue
    }

    const maxImpulse = state.wheel.brake > 0 ? state.wheel.brake : 0
    let rollingFriction = calcRollingFriction(
      hooks,
      chassis,
      state.groundBody,
      state.hitPointWorld,
      state.forwardWS,
      maxImpulse,
    )
    rollingFriction += state.wheel.engineForce * dt

    state.forwardImpulse = rollingFriction

    const maxImp = state.suspensionForce * dt * state.wheel.config.frictionSlip
    const maxImpSquared = maxImp * maxImp
    const fwdAccel = state.wheel.config.forwardAcceleration ?? DEFAULT_FORWARD_ACCELERATION
    const sideAccel = state.wheel.config.sideAcceleration ?? DEFAULT_SIDE_ACCELERATION
    const x = (state.forwardImpulse * FRICTION_FWD_FACTOR) / fwdAccel
    const y = (state.sideImpulse * FRICTION_SIDE_FACTOR) / sideAccel
    const impulseSquared = x * x + y * y

    if (impulseSquared > maxImpSquared && maxImp > 0) {
      vehicleSliding = true
      state.sliding = true
      state.skidInfo = maxImp / Math.sqrt(impulseSquared)
    }
  }

  if (vehicleSliding) {
    for (const state of states) {
      if (state.sideImpulse !== 0 && state.skidInfo < 1) {
        state.forwardImpulse *= state.skidInfo
        state.sideImpulse *= state.skidInfo
      }
    }
  }
}

function applyFrictionImpulses(
  states: WheelStepState[],
  chassis: PhysicsBodyHandle,
  hooks: RaycastVehicleSimulationHooks,
  chassisRotation: Quat,
): void {
  for (const state of states) {
    if (!state.groundBody) {
      continue
    }

    if (state.forwardImpulse !== 0) {
      hooks.applyBodyImpulseAtPoint(
        chassis,
        scaleVec3(state.forwardWS, state.forwardImpulse),
        state.hitPointWorld,
      )
    }

    if (state.sideImpulse !== 0) {
      const sideImp = scaleVec3(state.axle, state.sideImpulse)
      const relPos = subVec3(state.hitPointWorld, hooks.getChassisTransform(chassis).position)
      const rollPoint = applyRollInfluenceLocal(
        chassisRotation,
        hooks.getChassisTransform(chassis).position,
        relPos,
        state.wheel.config.rollInfluence,
        INDEX_UP_AXIS,
      )
      hooks.applyBodyImpulseAtPoint(chassis, sideImp, rollPoint)
      hooks.applyBodyImpulseAtPoint(
        state.groundBody,
        scaleVec3(state.axle, -state.sideImpulse),
        state.hitPointWorld,
      )
    }
  }
}

function updateWheelRotation(
  states: WheelStepState[],
  linearVelocity: Vec3,
  angularVelocity: Vec3,
  center: Vec3,
  chassisRotation: Quat,
  dt: number,
): void {
  const forwardAxis = AXIS_DIRECTIONS[INDEX_FORWARD_AXIS]!
  const chassisForward = rotateVec3ByQuat(forwardAxis, chassisRotation)
  const rotationSign = INDEX_UP_AXIS === 1 ? -1 : 1

  for (const state of states) {
    const { wheel } = state
    const connectionVel = velocityAtWorldPoint(
      center,
      linearVelocity,
      angularVelocity,
      state.chassisConnectionWorld,
    )

    let deltaRotation = 0

    if (wheel.inContact) {
      const proj = dotVec3(chassisForward, state.hitNormalWorld)
      const fwd = subVec3(chassisForward, scaleVec3(state.hitNormalWorld, proj))
      const forwardSpeed = dotVec3(connectionVel, fwd)
      deltaRotation = (rotationSign * forwardSpeed * dt) / wheel.config.radius
    }

    state.deltaRotation = deltaRotation
    wheel.rotation += deltaRotation
    state.deltaRotation *= 0.99
  }
}

/** Scale only the local up-axis of contact offset (Isaac Mason roll influence). */
function applyRollInfluenceLocal(
  chassisRotation: Quat,
  center: Vec3,
  relPosWorld: Vec3,
  rollInfluence: number,
  upAxisIndex: number,
): Vec3 {
  const local = rotateVec3ByQuat(relPosWorld, conjugateQuat(chassisRotation))
  const adjusted: Vec3 = [
    upAxisIndex === 0 ? local[0] * rollInfluence : local[0],
    upAxisIndex === 1 ? local[1] * rollInfluence : local[1],
    upAxisIndex === 2 ? local[2] * rollInfluence : local[2],
  ]
  return addVec3(center, rotateVec3ByQuat(adjusted, chassisRotation))
}

function conjugateQuat(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]]
}

function negateVec3(v: Vec3): Vec3 {
  return [-v[0], -v[1], -v[2]]
}

function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const half = angle * 0.5
  const s = Math.sin(half)
  const len = Math.hypot(axis[0], axis[1], axis[2])
  if (len === 0) {
    return [0, 0, 0, 1]
  }
  return [(axis[0] / len) * s, (axis[1] / len) * s, (axis[2] / len) * s, Math.cos(half)]
}

function multiplyQuaternions(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

/** Build a default four-wheel config set (FL, FR, BL, BR) — Isaac Mason sketch defaults. */
export function defaultFourWheelConfigs(options: {
  halfWidth?: number
  height?: number
  halfLength?: number
  radius?: number
  suspension?: Partial<
    Pick<
      WheelConfig,
      | 'suspensionRestLength'
      | 'suspensionStiffness'
      | 'dampingRelaxation'
      | 'dampingCompression'
      | 'maxSuspensionTravel'
      | 'frictionSlip'
      | 'rollInfluence'
      | 'sideFrictionStiffness'
      | 'forwardAcceleration'
      | 'sideAcceleration'
    >
  >
} = {}): WheelConfig[] {
  const halfWidth = options.halfWidth ?? 0.95
  const height = options.height ?? 0.35
  const halfLength = options.halfLength ?? 1.55
  const radius = options.radius ?? 0.42
  const s = options.suspension ?? {}

  const base: Omit<WheelConfig, 'localPosition'> = {
    radius,
    directionLocal: DEFAULT_DIRECTION_LOCAL,
    axleLocal: DEFAULT_AXLE_LOCAL,
    suspensionRestLength: s.suspensionRestLength ?? 0.55,
    suspensionStiffness: s.suspensionStiffness ?? 30,
    dampingRelaxation: s.dampingRelaxation ?? 4.6,
    dampingCompression: s.dampingCompression ?? 8.8,
    maxSuspensionTravel: s.maxSuspensionTravel ?? 0.42,
    frictionSlip: s.frictionSlip ?? 1.4,
    rollInfluence: s.rollInfluence ?? 0.01,
    sideFrictionStiffness: s.sideFrictionStiffness ?? 1,
    forwardAcceleration: s.forwardAcceleration ?? 1,
    sideAcceleration: s.sideAcceleration ?? 1,
    maxSuspensionForce: DEFAULT_MAX_SUSPENSION_FORCE,
  }

  const positions: Vec3[] = [
    [-halfWidth, height, halfLength],
    [halfWidth, height, halfLength],
    [-halfWidth, height, -halfLength],
    [halfWidth, height, -halfLength],
  ]

  return positions.map((localPosition) => ({ ...base, localPosition }))
}
