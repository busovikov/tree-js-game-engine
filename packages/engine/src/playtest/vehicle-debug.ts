import type { EntityId, IWorld } from '@haku/core'
import { TransformComponent, PhysicsControllerComponent } from '@haku/core'
import type { CustomRaycastController } from '@haku/schema'
import type { IRaycastVehicle, Vec3 } from '@haku/physics'
import { vehicleChassisCollider } from '../systems/physics-collider-system.js'
import {
  VEHICLE_BODY_TARGET_LENGTH,
  VEHICLE_BODY_RAW_EXPORT_LENGTH_Z,
  expectedVehicleBodyFitScale,
} from '../vehicle-model-fit.js'
import {
  computeIsaacDriveControlState,
  type PhysicsControllerSystem,
  type ControllerInput,
} from '../systems/physics-controller-system.js'
import type { PhysicsWorldSystem } from '../systems/physics-world-system.js'
import { estimateGroundTopY } from './vehicle-metrics.js'

const WHEEL_LABELS = ['FL', 'FR', 'BL', 'BR'] as const
const MPS_TO_KMH = 3.6

export interface VehicleWheelDebugSnapshot {
  slot: (typeof WHEEL_LABELS)[number]
  inContact: boolean
  suspensionLength: number
  contactPoint: [number, number, number] | null
  steering: number
  engineForce: number
  rotation: number
}

export interface VehicleDriveDebugSnapshot {
  throttle: number
  steer: number
  boost: boolean
  brakeInput: boolean
  engineForce: number
  brake: number
  currentSteer: number
}

export interface VehicleDebugSnapshot {
  /** Monotonic time (ms). */
  t: number
  /** Snapshot sequence number. */
  seq: number
  vehicleName: string
  entityId: string
  position: [number, number, number]
  rotation: [number, number, number, number]
  linearVelocity: [number, number, number]
  angularVelocity: [number, number, number]
  speedKmh: number
  verticalVelocity: number
  grounded: boolean
  wheels: VehicleWheelDebugSnapshot[]
  drive: VehicleDriveDebugSnapshot
  component: {
    enabled: boolean
    chassis: CustomRaycastController['chassis']
    wheels: CustomRaycastController['wheels']
    suspension: CustomRaycastController['suspension']
    engine: Pick<CustomRaycastController['engine'], 'force'>
  }
  implicitCollider: {
    halfExtents: [number, number, number]
    lift: number
    offset: [number, number, number]
  }
  scale: {
    /** RCLevel entity uniform scale, if present. */
    levelEntityScale: number | null
    /** Physics chassis length (2 × halfLength). */
    physicsChassisLengthM: number
    /** Target visual body length after auto-fit. */
    expectedVisualBodyLengthM: number
    /** Raw base.glb export length before auto-fit (~0.27 m). */
    rawBodyGlbLengthM: number
    /** Auto-fit multiplier applied at load time (~15×). */
    expectedBodyFitScale: number
  }
  chassisAboveGround: number | null
  /** Set by logger when a heuristic flags unstable behavior. */
  flags: string[]
}

export interface VehicleDebugCollectContext {
  physicsSystem: PhysicsWorldSystem
  vehicleController: PhysicsControllerSystem
  raycastVehicle?: IRaycastVehicle
  vehicleName?: string
  groundTopY?: number
}

/** Relative path inside the open target project (NDJSON). */
export const VEHICLE_DEBUG_LOG_RELATIVE_PATH = '.haku/vehicle-physics.ndjson'

/** Dev-server endpoint (Vite `haku-target-project` plugin). */
export const VEHICLE_DEBUG_LOG_HTTP_ENDPOINT = '/__haku/dev/vehicle-log'

export type VehicleDebugLogRecord =
  | {
      kind: 'session'
      event: 'start' | 'stop'
      t: number
      intervalMs?: number
      historySize?: number
    }
  | {
      kind: 'sample'
      t: number
      hasFlags: boolean
      summary: {
        y: string
        vy: string
        speedKmh: string
        grounded: boolean
        wheels: string
        engineForce: string
        brake: string
        flags: string[]
      }
      snapshot: VehicleDebugSnapshot
    }

export interface VehicleDebugLogSink {
  write(record: VehicleDebugLogRecord): void
  /** Clear on-disk log (dev server DELETE). */
  reset?(): void | Promise<void>
}

export function createHttpVehicleDebugLogSink(
  endpoint: string = VEHICLE_DEBUG_LOG_HTTP_ENDPOINT,
): VehicleDebugLogSink {
  return {
    reset() {
      void fetch(endpoint, { method: 'DELETE' }).catch(() => {})
    },
    write(record) {
      const line = `${JSON.stringify(record)}\n`
      void fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-ndjson' },
        body: line,
        keepalive: true,
      }).catch(() => {})
    },
  }
}

export interface VehicleDebugLogOptions {
  /** Console log interval in ms. Default 500. */
  intervalMs?: number
  /** Ring buffer capacity. Default 600. */
  historySize?: number
  /** Log only when flags are non-empty. Default false. */
  anomaliesOnly?: boolean
  /** Vertical velocity (m/s) that triggers a flag. Default 8. */
  launchVyThreshold?: number
  /** Chassis Y rise (m) between snapshots that triggers a flag. Default 0.35. */
  riseDeltaYThreshold?: number
  /** File sink — required in dev; no console fallback. */
  sink?: VehicleDebugLogSink
}

function resolveLevelEntityScale(world: IWorld): number | null {
  for (const id of world.getAllEntities()) {
    if (world.getEntityName(id) !== 'RCLevel') {
      continue
    }
    const transform = world.getComponent(id, TransformComponent)
    if (!transform) {
      return null
    }
    const [sx, sy, sz] = transform.scale as [number, number, number]
    if (sx === sy && sy === sz) {
      return sx
    }
    return Math.max(sx, sy, sz)
  }
  return null
}

function findVehicleId(world: IWorld, vehicleName?: string): EntityId | null {
  for (const id of world.query(PhysicsControllerComponent, TransformComponent)) {
    const data = world.getComponent(id, PhysicsControllerComponent)
    if (!data?.enabled) {
      continue
    }
    const name = world.getEntityName(id) ?? ''
    if (vehicleName && name !== vehicleName) {
      continue
    }
    return id
  }
  return null
}

function speedKmh(velocity: Vec3): number {
  return Math.hypot(velocity[0], velocity[1], velocity[2]) * MPS_TO_KMH
}

function detectFlags(
  snapshot: Omit<VehicleDebugSnapshot, 'flags'>,
  previous: VehicleDebugSnapshot | null,
  options: Required<Pick<VehicleDebugLogOptions, 'launchVyThreshold' | 'riseDeltaYThreshold'>>,
): string[] {
  const flags: string[] = []

  if (snapshot.verticalVelocity > options.launchVyThreshold) {
    flags.push(`high_vy:${snapshot.verticalVelocity.toFixed(2)}`)
  }
  if (snapshot.verticalVelocity > 2 && snapshot.grounded) {
    flags.push('grounded_but_rising')
  }
  if (!snapshot.grounded && snapshot.drive.engineForce !== 0) {
    flags.push('engine_force_airborne')
  }
  if (previous) {
    const dy = snapshot.position[1] - previous.position[1]
    const dt = (snapshot.t - previous.t) / 1000
    if (dt > 0 && dy > options.riseDeltaYThreshold) {
      flags.push(`rapid_rise:dy=${dy.toFixed(2)}/dt=${dt.toFixed(2)}`)
    }
    if (previous.grounded && !snapshot.grounded && snapshot.verticalVelocity > 1) {
      flags.push('launch_after_grounded')
    }
  }
  if (Math.abs(snapshot.angularVelocity[0]) > 0.35 && snapshot.grounded) {
    flags.push(`pitch_wobble:${snapshot.angularVelocity[0].toFixed(2)}`)
  }
  if (previous && snapshot.grounded && previous.grounded) {
    if (Math.sign(snapshot.verticalVelocity) !== Math.sign(previous.verticalVelocity)) {
      if (
        Math.abs(snapshot.verticalVelocity) > 0.15 &&
        Math.abs(previous.verticalVelocity) > 0.15
      ) {
        flags.push('vy_sign_flip')
      }
    }
  }
  if (snapshot.wheels.every((wheel) => !wheel.inContact) && snapshot.position[1] > 3) {
    flags.push('all_wheels_airborne')
  }

  return flags
}

export function collectVehicleDebugSnapshot(
  world: IWorld,
  context: VehicleDebugCollectContext,
  seq: number,
  previous: VehicleDebugSnapshot | null = null,
  flagOptions?: Pick<VehicleDebugLogOptions, 'launchVyThreshold' | 'riseDeltaYThreshold'>,
): VehicleDebugSnapshot | null {
  const vehicleId = findVehicleId(world, context.vehicleName)
  if (!vehicleId) {
    return null
  }

  const vehicleData = world.getComponent(vehicleId, PhysicsControllerComponent)
  const transform = world.getComponent(vehicleId, TransformComponent)
  if (!vehicleData || !transform || vehicleData.type !== 'custom-raycast') {
    return null
  }
  const raycastController = vehicleData

  const linearVelocity =
    context.physicsSystem.getBodyLinearVelocity(vehicleId) ?? ([0, 0, 0] as Vec3)
  const angularVelocity =
    context.physicsSystem.getBodyAngularVelocity(vehicleId) ?? ([0, 0, 0] as Vec3)

  const raycastVehicle =
    context.raycastVehicle ?? context.vehicleController.getRaycastVehicle(vehicleId)
  const wheelStates = raycastVehicle?.getWheelStates() ?? []
  const grounded = wheelStates.some((state) => state.inContact)

  const input: ControllerInput = context.vehicleController.getControllerInput(vehicleId) ?? {}
  const drive = computeIsaacDriveControlState({
    vehicle: raycastController,
    input,
  })

  const [cx, cy, cz] = transform.position as [number, number, number]
  const groundTop =
    context.groundTopY ?? estimateGroundTopY(world, cx, cz) ?? null

  const implicit = vehicleChassisCollider(raycastController.chassis)

  const base: Omit<VehicleDebugSnapshot, 'flags'> = {
    t: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    seq,
    vehicleName: world.getEntityName(vehicleId) ?? 'Vehicle',
    entityId: vehicleId.value,
    position: [cx, cy, cz],
    rotation: [...transform.rotation] as [number, number, number, number],
    linearVelocity: [...linearVelocity] as [number, number, number],
    angularVelocity: [...angularVelocity] as [number, number, number],
    speedKmh: speedKmh(linearVelocity),
    verticalVelocity: linearVelocity[1],
    grounded,
    wheels: wheelStates.slice(0, 4).map((state, index) => ({
      slot: WHEEL_LABELS[index] ?? WHEEL_LABELS[0],
      inContact: state.inContact,
      suspensionLength: state.suspensionLength,
      contactPoint: state.contactPoint ? [...state.contactPoint] as [number, number, number] : null,
      steering: state.steering,
      engineForce: state.engineForce,
      rotation: state.rotation,
    })),
    drive: {
      throttle: input.throttle ?? 0,
      steer: input.steer ?? 0,
      boost: input.boost === true,
      brakeInput: input.brake === true,
      engineForce: drive.engineForce,
      brake: drive.brake,
      currentSteer: drive.currentSteer,
    },
    component: {
      enabled: raycastController.enabled,
      chassis: { ...raycastController.chassis },
      wheels: { ...raycastController.wheels },
      suspension: { ...raycastController.suspension },
      engine: {
        force: raycastController.engine.force,
      },
    },
    implicitCollider: {
      halfExtents: [...raycastController.chassis.halfExtents] as [number, number, number],
      lift: raycastController.chassis.lift,
      offset: [...implicit.offset] as [number, number, number],
    },
    scale: {
      levelEntityScale: resolveLevelEntityScale(world),
      physicsChassisLengthM: raycastController.chassis.halfExtents[2] * 2,
      expectedVisualBodyLengthM: VEHICLE_BODY_TARGET_LENGTH,
      rawBodyGlbLengthM: VEHICLE_BODY_RAW_EXPORT_LENGTH_Z,
      expectedBodyFitScale: expectedVehicleBodyFitScale(),
    },
    chassisAboveGround: groundTop != null ? cy - groundTop : null,
  }

  const thresholds = {
    launchVyThreshold: flagOptions?.launchVyThreshold ?? 8,
    riseDeltaYThreshold: flagOptions?.riseDeltaYThreshold ?? 0.35,
  }
  const flags = detectFlags(base, previous, thresholds)

  return { ...base, flags }
}

export class VehicleDebugLogger {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private seq = 0
  private readonly history: VehicleDebugSnapshot[] = []
  private lastSnapshot: VehicleDebugSnapshot | null = null
  private readonly options: Required<
    Omit<VehicleDebugLogOptions, 'sink'>
  > & { sink?: VehicleDebugLogSink }

  constructor(
    private readonly getWorld: () => IWorld | null,
    private readonly getContext: () => VehicleDebugCollectContext | null,
    options: VehicleDebugLogOptions = {},
  ) {
    this.options = {
      intervalMs: options.intervalMs ?? 500,
      historySize: options.historySize ?? 600,
      anomaliesOnly: options.anomaliesOnly ?? false,
      launchVyThreshold: options.launchVyThreshold ?? 8,
      riseDeltaYThreshold: options.riseDeltaYThreshold ?? 0.35,
      sink: options.sink,
    }
  }

  snapshot(): VehicleDebugSnapshot | null {
    const world = this.getWorld()
    const context = this.getContext()
    if (!world || !context) {
      return null
    }

    const snap = collectVehicleDebugSnapshot(
      world,
      context,
      this.seq,
      this.lastSnapshot,
      this.options,
    )
    if (!snap) {
      return null
    }

    this.seq += 1
    this.lastSnapshot = snap
    this.history.push(snap)
    if (this.history.length > this.options.historySize) {
      this.history.shift()
    }
    return snap
  }

  getHistory(): readonly VehicleDebugSnapshot[] {
    return this.history
  }

  clearHistory(): void {
    this.history.length = 0
    this.lastSnapshot = null
    this.seq = 0
  }

  start(): void {
    if (this.intervalId != null) {
      return
    }
    void this.options.sink?.reset?.()
    this.options.sink?.write({
      kind: 'session',
      event: 'start',
      t: Date.now(),
      intervalMs: this.options.intervalMs,
      historySize: this.options.historySize,
    })
    this.intervalId = setInterval(() => this.tick(), this.options.intervalMs)
  }

  stop(): void {
    if (this.intervalId != null) {
      clearInterval(this.intervalId)
      this.intervalId = null
      this.options.sink?.write({
        kind: 'session',
        event: 'stop',
        t: Date.now(),
      })
    }
  }

  isRunning(): boolean {
    return this.intervalId != null
  }

  private tick(): void {
    const snap = this.snapshot()
    if (!snap) {
      return
    }

    const hasFlags = snap.flags.length > 0
    if (this.options.anomaliesOnly && !hasFlags) {
      return
    }

    const summary = {
      y: snap.position[1].toFixed(3),
      vy: snap.verticalVelocity.toFixed(3),
      speedKmh: snap.speedKmh.toFixed(1),
      grounded: snap.grounded,
      wheels: snap.wheels.map((w) => (w.inContact ? 'G' : '-')).join(''),
      engineForce: snap.drive.engineForce.toFixed(0),
      brake: snap.drive.brake.toFixed(1),
      flags: snap.flags,
    }

    this.options.sink?.write({
      kind: 'sample',
      t: snap.t,
      hasFlags,
      summary,
      snapshot: snap,
    })
  }
}

export interface VehicleDebugWindowApi {
  snapshot(): VehicleDebugSnapshot | null
  getHistory(): readonly VehicleDebugSnapshot[]
  clearHistory(): void
  startLog(options?: VehicleDebugLogOptions): void
  stopLog(): void
  isLogging(): boolean
}

export function createVehicleDebugWindowApi(
  getWorld: () => IWorld | null,
  getContext: () => VehicleDebugCollectContext | null,
  defaults: VehicleDebugLogOptions = {},
): VehicleDebugWindowApi {
  let logger: VehicleDebugLogger | null = null

  return {
    snapshot() {
      if (!logger) {
        logger = new VehicleDebugLogger(getWorld, getContext, defaults)
      }
      return logger.snapshot()
    },
    getHistory() {
      return logger?.getHistory() ?? []
    },
    clearHistory() {
      logger?.clearHistory()
    },
    startLog(options) {
      if (logger) {
        logger.stop()
      }
      logger = new VehicleDebugLogger(getWorld, getContext, { ...defaults, ...options })
      logger.start()
    },
    stopLog() {
      logger?.stop()
    },
    isLogging() {
      return logger?.isRunning() ?? false
    },
  }
}

declare global {
  interface Window {
    __HAKU_VEHICLE_DEBUG?: VehicleDebugWindowApi
  }
}
