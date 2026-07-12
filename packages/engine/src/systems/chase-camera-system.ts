import type { EntityId, IWorld, ISystem } from '@haku/core'
import {
  CameraComponent,
  TransformComponent,
  PhysicsControllerComponent,
} from '@haku/core'
import type { Quat, Vec3 } from '@haku/schema'
import type { InputManager } from '../input/input-manager.js'
import type { PhysicsWorldSystem } from './physics-world-system.js'
import type { PhysicsControllerSystem } from './physics-controller-system.js'

export const CHASE_CAMERA_OFFSET: Vec3 = [0, 5.2, -7.4]
export const CHASE_CAMERA_LOOK_OFFSET: Vec3 = [0, 1.2, 3.2]
export const CHASE_AIRBORNE_OFFSET: Vec3 = [0, 8.2, -12.5]
export const CHASE_AIRBORNE_LOOK_OFFSET: Vec3 = [0, 0.6, 9.5]
export const CHASE_ORBIT_PIVOT_OFFSET: Vec3 = [0, 1.2, 0]

export const CHASE_PITCH_MIN = -0.5
export const CHASE_PITCH_MAX = 0.35
export const CHASE_ZOOM_MIN = 0.4
export const CHASE_ZOOM_MAX = 1.5
export const CHASE_BOOST_FOV = 72

export const CHASE_ORBIT_YAW_SENSITIVITY = 0.0035
export const CHASE_ORBIT_PITCH_SENSITIVITY = 0.0028
export const CHASE_WHEEL_ZOOM_SENSITIVITY = 0.001

export interface ChaseCameraOrbitState {
  yaw: number
  pitch: number
  targetYaw: number
  targetPitch: number
  zoom: number
  targetZoom: number
}

export interface ChaseCameraRuntimeState {
  orbit: ChaseCameraOrbitState
  airborneBlend: number
  boostBlend: number
  smoothedPosition: Vec3
  smoothedTarget: Vec3
  initialized: boolean
}

export interface ChaseCameraInput {
  orbitDx: number
  orbitDy: number
  zoomDelta: number
  boost: boolean
  throttle: number
  dragging: boolean
}

export interface ChaseCameraVehicleState {
  position: Vec3
  rotation: Quat
  grounded: boolean
  upwardSpeed: number
}

export interface ChaseCameraPose {
  position: Vec3
  lookTarget: Vec3
  fov: number
}

export interface ChaseCameraStepOptions {
  baseFov?: number
  dt: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function expLerpFactor(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt)
}

export function normalizeAngleRadians(angle: number): number {
  const t = angle + Math.PI
  const mod = ((t % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2)
  return mod - Math.PI
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function subVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function scaleVec3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s]
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

function applyAxisAngle(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const [ax, ay, az] = axis
  const len = Math.hypot(ax, ay, az)
  if (len < 1e-8 || Math.abs(angle) < 1e-8) {
    return [...v] as Vec3
  }

  const nx = ax / len
  const ny = ay / len
  const nz = az / len
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const t = 1 - c
  const [x, y, z] = v

  return [
    (t * nx * nx + c) * x + (t * nx * ny - s * nz) * y + (t * nx * nz + s * ny) * z,
    (t * nx * ny + s * nz) * x + (t * ny * ny + c) * y + (t * ny * nz - s * nx) * z,
    (t * nx * nz - s * ny) * x + (t * ny * nz + s * nx) * y + (t * nz * nz + c) * z,
  ]
}

/** Three.js-compatible lookAt quaternion (camera looks down local -Z). */
export function lookAtQuaternion(eye: Vec3, target: Vec3, up: Vec3 = [0, 1, 0]): Quat {
  const zAxis = subVec3(eye, target)
  const zLen = Math.hypot(zAxis[0], zAxis[1], zAxis[2])
  if (zLen < 1e-8) {
    return [0, 0, 0, 1]
  }
  zAxis[0] /= zLen
  zAxis[1] /= zLen
  zAxis[2] /= zLen

  let xAxis = [
    up[1] * zAxis[2] - up[2] * zAxis[1],
    up[2] * zAxis[0] - up[0] * zAxis[2],
    up[0] * zAxis[1] - up[1] * zAxis[0],
  ]
  const xLen = Math.hypot(xAxis[0], xAxis[1], xAxis[2])
  if (xLen < 1e-8) {
    return [0, 0, 0, 1]
  }
  xAxis = [xAxis[0] / xLen, xAxis[1] / xLen, xAxis[2] / xLen]

  const yAxis = [
    zAxis[1] * xAxis[2] - zAxis[2] * xAxis[1],
    zAxis[2] * xAxis[0] - zAxis[0] * xAxis[2],
    zAxis[0] * xAxis[1] - zAxis[1] * xAxis[0],
  ]

  const m11 = xAxis[0]
  const m12 = yAxis[0]
  const m13 = zAxis[0]
  const m21 = xAxis[1]
  const m22 = yAxis[1]
  const m23 = zAxis[1]
  const m31 = xAxis[2]
  const m32 = yAxis[2]
  const m33 = zAxis[2]

  const trace = m11 + m22 + m33
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1)
    return [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s]
  }
  if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33)
    return [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s]
  }
  if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33)
    return [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s]
  }
  const s = 2 * Math.sqrt(1 + m33 - m11 - m22)
  return [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s]
}

export function createChaseCameraRuntimeState(
  initialPosition: Vec3,
  initialTarget: Vec3,
): ChaseCameraRuntimeState {
  return {
    orbit: {
      yaw: 0,
      pitch: 0,
      targetYaw: 0,
      targetPitch: 0,
      zoom: 1,
      targetZoom: 1,
    },
    airborneBlend: 0,
    boostBlend: 0,
    smoothedPosition: [...initialPosition] as Vec3,
    smoothedTarget: [...initialTarget] as Vec3,
    initialized: false,
  }
}

export function applyChaseOrbitInput(
  orbit: ChaseCameraOrbitState,
  dx: number,
  dy: number,
): void {
  orbit.targetYaw -= dx * CHASE_ORBIT_YAW_SENSITIVITY
  orbit.targetPitch = clamp(
    orbit.targetPitch - dy * CHASE_ORBIT_PITCH_SENSITIVITY,
    CHASE_PITCH_MIN,
    CHASE_PITCH_MAX,
  )
}

export function applyChaseZoomInput(orbit: ChaseCameraOrbitState, wheelDelta: number): void {
  orbit.targetZoom = clamp(
    orbit.targetZoom + wheelDelta * CHASE_WHEEL_ZOOM_SENSITIVITY,
    CHASE_ZOOM_MIN,
    CHASE_ZOOM_MAX,
  )
}

export function updateChaseOrbitSmoothing(orbit: ChaseCameraOrbitState, dt: number): void {
  const orbitLerp = expLerpFactor(14, dt)
  orbit.yaw = lerp(orbit.yaw, orbit.targetYaw, orbitLerp)
  orbit.pitch = lerp(orbit.pitch, orbit.targetPitch, orbitLerp)
  orbit.zoom = lerp(orbit.zoom, orbit.targetZoom, orbitLerp)
}

export function resetChaseOrbitOnAccelerate(
  orbit: ChaseCameraOrbitState,
  accelerating: boolean,
  dt: number,
): void {
  if (!accelerating) {
    return
  }

  orbit.yaw = normalizeAngleRadians(orbit.yaw)
  orbit.targetYaw = normalizeAngleRadians(orbit.targetYaw)
  const resetLerp = expLerpFactor(8, dt)
  orbit.targetYaw = lerp(orbit.targetYaw, 0, resetLerp)
  orbit.targetPitch = lerp(orbit.targetPitch, 0, resetLerp)
}

export function updateChaseAirborneBlend(
  current: number,
  grounded: boolean,
  upwardSpeed: number,
  dt: number,
): number {
  const airborneTarget = grounded
    ? 0
    : clamp(0.45 + upwardSpeed / 12, 0.45, 1)
  const rate = grounded ? 5 : 3
  return lerp(current, airborneTarget, expLerpFactor(rate, dt))
}

export function updateChaseBoostBlend(current: number, boosting: boolean, dt: number): number {
  const target = boosting ? 1 : 0
  return lerp(current, target, expLerpFactor(7, dt))
}

export function computeChaseCameraDesiredPose(
  vehicle: ChaseCameraVehicleState,
  runtime: ChaseCameraRuntimeState,
): { position: Vec3; lookTarget: Vec3 } {
  const { orbit, airborneBlend, boostBlend } = runtime
  const chassisPos = vehicle.position
  const chassisRot = vehicle.rotation

  const blendedLookOffset = lerpVec3(CHASE_CAMERA_LOOK_OFFSET, CHASE_AIRBORNE_LOOK_OFFSET, airborneBlend)
  const normalTarget = addVec3(
    rotateVec3ByQuat(blendedLookOffset, chassisRot),
    chassisPos,
  )

  const orbitTarget = addVec3(
    rotateVec3ByQuat(CHASE_ORBIT_PIVOT_OFFSET, chassisRot),
    chassisPos,
  )

  const orbitAmount = clamp(
    Math.abs(orbit.yaw) * 1.5 + Math.abs(orbit.pitch) * 2,
    0,
    1,
  )

  const blendedOffset = lerpVec3(CHASE_CAMERA_OFFSET, CHASE_AIRBORNE_OFFSET, airborneBlend)
  const boostPullBack = 1 + 0.08 * boostBlend
  const orbitLocalOffset = scaleVec3(
    subVec3(blendedOffset, CHASE_ORBIT_PIVOT_OFFSET),
    orbit.zoom * boostPullBack,
  )

  const localX: Vec3 = [1, 0, 0]
  const localY: Vec3 = [0, 1, 0]
  const orbitOffset = rotateVec3ByQuat(
    applyAxisAngle(applyAxisAngle(orbitLocalOffset, localX, orbit.pitch), localY, orbit.yaw),
    chassisRot,
  )

  const desiredPosition = addVec3(orbitOffset, orbitTarget)
  desiredPosition[1] = Math.max(desiredPosition[1], chassisPos[1] + 1.5, 1.2)

  const desiredTarget = lerpVec3(normalTarget, orbitTarget, orbitAmount)

  return {
    position: desiredPosition,
    lookTarget: desiredTarget,
  }
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ]
}

export function computeChaseCameraStep(
  runtime: ChaseCameraRuntimeState,
  vehicle: ChaseCameraVehicleState,
  input: ChaseCameraInput,
  options: ChaseCameraStepOptions,
): ChaseCameraPose {
  const { orbit } = runtime
  const dt = options.dt
  const baseFov = options.baseFov ?? 60

  if (input.orbitDx !== 0 || input.orbitDy !== 0) {
    applyChaseOrbitInput(orbit, input.orbitDx, input.orbitDy)
  }
  if (input.zoomDelta !== 0) {
    applyChaseZoomInput(orbit, input.zoomDelta)
  }

  const accelerating =
    Math.abs(input.throttle) > 0.05
  resetChaseOrbitOnAccelerate(orbit, accelerating, dt)
  updateChaseOrbitSmoothing(orbit, dt)

  runtime.airborneBlend = updateChaseAirborneBlend(
    runtime.airborneBlend,
    vehicle.grounded,
    vehicle.upwardSpeed,
    dt,
  )
  runtime.boostBlend = updateChaseBoostBlend(runtime.boostBlend, input.boost, dt)

  const desired = computeChaseCameraDesiredPose(vehicle, runtime)

  if (!runtime.initialized) {
    runtime.smoothedPosition = [...desired.position] as Vec3
    runtime.smoothedTarget = [...desired.lookTarget] as Vec3
    runtime.initialized = true
  } else {
    const positionLerp = expLerpFactor(6, dt)
    const targetLerp = expLerpFactor(10, dt)
    runtime.smoothedPosition = lerpVec3(
      runtime.smoothedPosition,
      desired.position,
      positionLerp,
    )
    runtime.smoothedTarget = lerpVec3(
      runtime.smoothedTarget,
      desired.lookTarget,
      targetLerp,
    )
  }

  const fov = lerp(baseFov, CHASE_BOOST_FOV, runtime.boostBlend)

  return {
    position: [...runtime.smoothedPosition] as Vec3,
    lookTarget: [...runtime.smoothedTarget] as Vec3,
    fov,
  }
}

export interface ChaseCameraSystemOptions {
  controlledEntity?: EntityId | null
  cameraEntityId?: EntityId | null
}

/**
 * Chase camera for vehicle play mode — follow offset, mouse orbit, airborne blend, boost FOV.
 * Runs after physics + vehicle visual sync (order 91).
 */
export class ChaseCameraSystem implements ISystem {
  readonly order = 91

  private controlledEntity: EntityId | null
  private cameraEntityId: EntityId | null
  private readonly runtimeByVehicle = new Map<string, ChaseCameraRuntimeState>()

  constructor(
    private readonly inputManager: InputManager,
    private readonly physicsSystem: PhysicsWorldSystem,
    private readonly controllerSystem: PhysicsControllerSystem,
    options: ChaseCameraSystemOptions = {},
  ) {
    this.controlledEntity = options.controlledEntity ?? null
    this.cameraEntityId = options.cameraEntityId ?? null
  }

  setControlledEntity(id: EntityId | null): void {
    this.controlledEntity = id
  }

  setCameraEntityId(id: EntityId | null): void {
    this.cameraEntityId = id
  }

  update(world: IWorld, dt: number): void {
    const vehicleId = this.resolveControlledEntity(world)
    const cameraId = this.resolveCameraEntity(world)
    if (!vehicleId || !cameraId) {
      this.inputManager.endFrame()
      return
    }

    const authoritativeVehicleTransform = world.getComponent(vehicleId, TransformComponent)
    const cameraTransform = world.getComponent(cameraId, TransformComponent)
    const cameraData = world.getComponent(cameraId, CameraComponent)
    if (!authoritativeVehicleTransform || !cameraTransform || !cameraData) {
      this.inputManager.endFrame()
      return
    }
    const vehicleTransform = this.physicsSystem.resolvePresentationTransform(
      vehicleId,
      authoritativeVehicleTransform,
    )

    const raycastVehicle = this.controllerSystem.getRaycastVehicle(vehicleId)
    const dynamicVehicle = this.controllerSystem.getDynamicRaycastVehicle(vehicleId)
    const wheelStates = raycastVehicle?.getWheelStates() ?? []
    const grounded =
      wheelStates.some((state) => state.inContact) ||
      (dynamicVehicle != null &&
        [0, 1, 2, 3].some((i) => dynamicVehicle.getWheelIsInContact(i)))
    const linearVelocity =
      this.physicsSystem.getBodyLinearVelocity(vehicleId) ?? ([0, 0, 0] as Vec3)
    const upwardSpeed = Math.max(0, linearVelocity[1])

    const actions = this.inputManager.getActions()
    const vehicleInput = this.controllerSystem.getControllerInput(vehicleId) ?? {}

    let runtime = this.runtimeByVehicle.get(vehicleId.value)
    if (!runtime) {
      runtime = createChaseCameraRuntimeState(
        cameraTransform.position,
        vehicleTransform.position,
      )
      this.runtimeByVehicle.set(vehicleId.value, runtime)
    }

    const baseFov = cameraData.fov
    const pose = computeChaseCameraStep(
      runtime,
      {
        position: vehicleTransform.position,
        rotation: vehicleTransform.rotation as Quat,
        grounded,
        upwardSpeed,
      },
      {
        orbitDx: actions.cameraOrbitDelta.dx,
        orbitDy: actions.cameraOrbitDelta.dy,
        zoomDelta: actions.cameraZoomDelta,
        boost: actions.boost || vehicleInput.boost === true,
        throttle: actions.throttle,
        dragging: this.inputManager.isPointerDragging,
      },
      { dt, baseFov },
    )

    world.addComponent(cameraId, TransformComponent, {
      position: [...pose.position] as Vec3,
      rotation: lookAtQuaternion(pose.position, pose.lookTarget),
      scale: [...cameraTransform.scale] as Vec3,
    })
    world.addComponent(cameraId, CameraComponent, {
      ...cameraData,
      fov: pose.fov,
    })

    this.inputManager.endFrame()
  }

  dispose(): void {
    this.runtimeByVehicle.clear()
    this.controlledEntity = null
    this.cameraEntityId = null
  }

  private resolveControlledEntity(world: IWorld): EntityId | null {
    if (this.controlledEntity && world.hasEntity(this.controlledEntity)) {
      return this.controlledEntity
    }

    for (const id of world.query(PhysicsControllerComponent)) {
      const vehicle = world.getComponent(id, PhysicsControllerComponent)
      if (vehicle?.enabled !== false) {
        this.controlledEntity = id
        return id
      }
    }

    return null
  }

  private resolveCameraEntity(world: IWorld): EntityId | null {
    if (this.cameraEntityId && world.hasEntity(this.cameraEntityId)) {
      return this.cameraEntityId
    }

    for (const id of world.query(CameraComponent, TransformComponent)) {
      const camera = world.getComponent(id, CameraComponent)
      if (camera?.enabled !== false) {
        this.cameraEntityId = id
        return id
      }
    }

    return null
  }
}
