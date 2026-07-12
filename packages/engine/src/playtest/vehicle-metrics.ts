import type { EntityId, IWorld } from '@haku/core'
import {
  ColliderComponent,
  TransformComponent,
  PhysicsControllerComponent,
} from '@haku/core'
import { vehicleWheelLocalPositions } from '@haku/schema'
import type { IRaycastVehicle } from '@haku/physics'

const FORWARD_LOCAL: [number, number, number] = [0, 0, 1]

export interface VehiclePlaytestMetrics {
  vehicleName: string
  chassisPosition: [number, number, number]
  chassisRotation: [number, number, number, number]
  wheelLocalPositions: Array<[number, number, number]>
  wheelGrounded: boolean[]
  allWheelsGrounded: boolean
  maxWheelHorizontalOffset: number
  maxWheelVerticalOffset: number
  chassisAboveGround: number | null
  forwardDriveDeltaZ: number | null
}

export interface VehiclePlaytestOptions {
  groundTopY?: number
  vehicleName?: string
}

function rotateVec3ByQuat(
  v: [number, number, number],
  q: [number, number, number, number],
): [number, number, number] {
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

function horizontalDist(x: number, z: number): number {
  return Math.hypot(x, z)
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

function resolveWheelChildren(world: IWorld, vehicleId: EntityId): EntityId[] {
  const slots = ['frontLeft', 'frontRight', 'backLeft', 'backRight'] as const
  const patterns: Record<(typeof slots)[number], RegExp[]> = {
    frontLeft: [/front.?left/i, /\bfl\b/i],
    frontRight: [/front.?right/i, /\bfr\b/i],
    backLeft: [/back.?left/i, /rear.?left/i, /\bbl\b/i],
    backRight: [/back.?right/i, /rear.?right/i, /\bbr\b/i],
  }

  const resolved: Array<EntityId | undefined> = []
  const meshChildren: EntityId[] = []

  for (const childId of world.getChildren(vehicleId)) {
    if (!world.hasComponent(childId, TransformComponent)) {
      continue
    }
    meshChildren.push(childId)
    const name = world.getEntityName(childId) ?? ''
    for (const slot of slots) {
      const idx = slots.indexOf(slot)
      if (resolved[idx]) {
        continue
      }
      if (patterns[slot].some((p) => p.test(name))) {
        resolved[idx] = childId
      }
    }
  }

  for (let i = 0; i < 4; i++) {
    if (!resolved[i] && meshChildren[i]) {
      resolved[i] = meshChildren[i]
    }
  }

  return resolved.filter((id): id is EntityId => id != null)
}

export function estimateGroundTopY(world: IWorld, x: number, z: number): number | null {
  let best: number | null = null

  for (const id of world.query(TransformComponent, ColliderComponent)) {
    const collider = world.getComponent(id, ColliderComponent)
    const transform = world.getComponent(id, TransformComponent)
    if (!collider || !transform || collider.shape !== 'box' || !collider.isStatic) {
      continue
    }

    const [ex, ey, ez] = transform.position as [number, number, number]
    const [, oy] = collider.offset as [number, number, number]
    const [hx, hy, hz] = collider.halfExtents as [number, number, number]

    if (x < ex - hx || x > ex + hx || z < ez - hz || z > ez + hz) {
      continue
    }

    const top = ey + oy + hy
    if (best === null || top > best) {
      best = top
    }
  }

  return best
}

export function collectVehiclePlaytestMetrics(
  world: IWorld,
  raycastVehicle: IRaycastVehicle | undefined,
  options: VehiclePlaytestOptions = {},
): VehiclePlaytestMetrics | null {
  const vehicleId = findVehicleId(world, options.vehicleName)
  if (!vehicleId) {
    return null
  }

  const vehicleData = world.getComponent(vehicleId, PhysicsControllerComponent)
  if (!vehicleData || vehicleData.type !== 'custom-raycast') {
    return null
  }
  const chassis = world.getComponent(vehicleId, TransformComponent)!
  const wheelIds = resolveWheelChildren(world, vehicleId)
  const wheelStates = raycastVehicle?.getWheelStates() ?? []

  const wheelLocalPositions = wheelIds.map((wheelId) => {
    const t = world.getComponent(wheelId, TransformComponent)!
    return [...t.position] as [number, number, number]
  })

  let maxWheelHorizontalOffset = 0
  let maxWheelVerticalOffset = 0
  for (const [x, y, z] of wheelLocalPositions) {
    maxWheelHorizontalOffset = Math.max(maxWheelHorizontalOffset, horizontalDist(x, z))
    maxWheelVerticalOffset = Math.max(maxWheelVerticalOffset, Math.abs(y))
  }

  const expected = vehicleWheelLocalPositions(vehicleData.wheels)
  for (const [ex, , ez] of expected) {
    maxWheelHorizontalOffset = Math.max(maxWheelHorizontalOffset, horizontalDist(ex, ez))
  }

  const [cx, cy, cz] = chassis.position as [number, number, number]
  const groundTop =
    options.groundTopY ?? estimateGroundTopY(world, cx, cz) ?? null
  const chassisAboveGround = groundTop != null ? cy - groundTop : null

  const wheelGrounded = wheelStates.map((s) => s.inContact)
  while (wheelGrounded.length < 4) {
    wheelGrounded.push(false)
  }

  return {
    vehicleName: world.getEntityName(vehicleId) ?? 'Vehicle',
    chassisPosition: [cx, cy, cz],
    chassisRotation: [...chassis.rotation] as [number, number, number, number],
    wheelLocalPositions,
    wheelGrounded: wheelGrounded.slice(0, 4),
    allWheelsGrounded: wheelGrounded.slice(0, 4).every(Boolean),
    maxWheelHorizontalOffset,
    maxWheelVerticalOffset,
    chassisAboveGround,
    forwardDriveDeltaZ: null,
  }
}

export function chassisForwardDeltaZ(
  rotation: [number, number, number, number],
  delta: [number, number, number],
): number {
  const forward = rotateVec3ByQuat(FORWARD_LOCAL, rotation)
  return forward[0] * delta[0] + forward[1] * delta[1] + forward[2] * delta[2]
}

export function assertVehiclePlaytestMetrics(
  metrics: VehiclePlaytestMetrics,
  forwardDriveDeltaZ: number,
): { ok: boolean; failures: string[] } {
  const failures: string[] = []

  if (!metrics.allWheelsGrounded) {
    failures.push(`allWheelsGrounded=false (${JSON.stringify(metrics.wheelGrounded)})`)
  }
  if (metrics.maxWheelHorizontalOffset > 1.85) {
    failures.push(
      `maxWheelHorizontalOffset=${metrics.maxWheelHorizontalOffset.toFixed(3)} > 1.85`,
    )
  }
  if (metrics.maxWheelVerticalOffset > 1.2) {
    failures.push(
      `maxWheelVerticalOffset=${metrics.maxWheelVerticalOffset.toFixed(3)} > 1.2`,
    )
  }
  if (
    metrics.chassisAboveGround != null &&
    (metrics.chassisAboveGround < -0.2 || metrics.chassisAboveGround > 1.6)
  ) {
    failures.push(
      `chassisAboveGround=${metrics.chassisAboveGround.toFixed(3)} outside 0.35..1.6`,
    )
  }
  if (forwardDriveDeltaZ < 2) {
    failures.push(
      `forwardDriveDeltaZ=${forwardDriveDeltaZ.toFixed(3)} < 2 (backward or stuck)`,
    )
  }

  return { ok: failures.length === 0, failures }
}

export type PlaytestWindowApi = {
  getVehicleMetrics(): VehiclePlaytestMetrics | null
}

declare global {
  interface Window {
    __HAKU_PLAYTEST?: PlaytestWindowApi
  }
}
