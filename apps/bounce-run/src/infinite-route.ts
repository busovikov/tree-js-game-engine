import { TransformComponent, type EntityId, type IWorld } from '@haku/core'
import { MeshRendererComponent } from '@haku/engine'
import { poolHandleRoot, type EntityPool, type PoolHandle } from '@haku/pool'
import { ColliderComponent } from '@haku/physics'
import type { Vec3 } from '@haku/schema'
import {
  generateBounceRunRoute,
  type BounceRunBonusConfig,
  type BounceRunBonusDescriptor,
  type BounceRunDifficultySchedule,
  type BounceRunRouteDecision,
  type BounceRunRoutePlatform,
} from './route-generator.js'

export interface PoolBackedBounceRunRouteOptions {
  readonly world: IWorld
  readonly pool: EntityPool
  readonly bonusPool?: EntityPool
  readonly seed: number
  readonly activeAhead: number
  readonly retainBehind: number
  readonly difficultySchedule?: BounceRunDifficultySchedule
  readonly bonus?: BounceRunBonusConfig
}

export interface ActiveBounceRunRoutePlatform {
  readonly platformIndex: number
  readonly entity: EntityId
  readonly descriptor: BounceRunRoutePlatform
}

export interface ActiveBounceRunRouteBonus {
  readonly bonusIndex: number
  readonly entity: EntityId
  readonly descriptor: BounceRunBonusDescriptor
}

export interface PoolBackedBounceRunRoute {
  advanceTo(platformIndex: number): void
  advanceForPosition(forwardPosition: number): void
  reset(): void
  dispose(): void
  activePlatforms(): readonly ActiveBounceRunRoutePlatform[]
  activeBonuses(): readonly ActiveBounceRunRouteBonus[]
  collectBonus(entity: EntityId): BounceRunBonusDescriptor | null
  platformDescriptor(entity: EntityId): BounceRunRoutePlatform | null
  decisionLog(): readonly BounceRunRouteDecision[]
}

interface ActiveLease {
  readonly entity: EntityId
  readonly handle: PoolHandle
  readonly descriptor: BounceRunRoutePlatform
}

interface ActiveBonusLease {
  readonly entity: EntityId
  readonly handle: PoolHandle
  readonly descriptor: BounceRunBonusDescriptor
}

const PLATFORM_COLORS: Readonly<Record<BounceRunRoutePlatform['variant'], string>> = {
  normal: '#35c6d0',
  wide: '#48d597',
  narrow: '#ff9f5a',
  bounce: '#b46cff',
}

/** Materializes a deterministic route through an exclusive public entity pool. */
export function createPoolBackedBounceRunRoute(
  options: PoolBackedBounceRunRouteOptions,
): PoolBackedBounceRunRoute {
  validateOptions(options)
  const active = new Map<number, ActiveLease>()
  const activeBonuses = new Map<number, ActiveBonusLease>()
  const collectedBonuses = new Set<number>()
  const decisions: BounceRunRouteDecision[] = []
  let currentPlatformIndex = 0
  let disposed = false

  const activateWindow = (platformIndex: number): void => {
    const horizon = platformIndex + options.activeAhead
    if (horizon > 10_000) {
      throw new Error('route horizon must not exceed 10000 platforms')
    }
    const generated = generateBounceRunRoute({
      seed: options.seed,
      platformCount: horizon,
      difficultySchedule: options.difficultySchedule,
      bonus: options.bonus,
    })
    const firstRetained = Math.max(0, platformIndex - options.retainBehind)
    const desiredIndices = new Set<number>()
    for (let index = firstRetained; index < horizon; index += 1) desiredIndices.add(index)

    for (const [index, lease] of [...active]) {
      if (desiredIndices.has(index)) continue
      options.pool.release(lease.handle)
      active.delete(index)
    }

    try {
      for (const index of [...desiredIndices].sort((left, right) => left - right)) {
        if (active.has(index)) continue
        const descriptor = generated.platforms[index]!
        const handle = options.pool.acquire((root) => {
          materializePlatform(options.world, root, descriptor)
        })
        if (!handle) throw new Error(`Bounce Run route pool exhausted at platform ${index}`)
        active.set(index, { handle, entity: poolHandleRoot(handle), descriptor })
      }
      synchronizeBonusLeases(generated.bonuses, desiredIndices)
    } catch (error) {
      for (const lease of active.values()) options.pool.release(lease.handle)
      active.clear()
      for (const lease of activeBonuses.values()) options.bonusPool?.release(lease.handle)
      activeBonuses.clear()
      throw error
    }

    decisions.push(...generated.decisionLog.slice(decisions.length))
    currentPlatformIndex = platformIndex
  }

  const releaseOwnedLeases = (): void => {
    for (const [, lease] of [...active].sort(([left], [right]) => left - right)) {
      options.pool.release(lease.handle)
    }
    active.clear()
    for (const lease of activeBonuses.values()) options.bonusPool?.release(lease.handle)
    activeBonuses.clear()
  }

  const synchronizeBonusLeases = (
    descriptors: readonly BounceRunBonusDescriptor[],
    desiredPlatformIndices: ReadonlySet<number>,
  ): void => {
    for (const [bonusIndex, lease] of [...activeBonuses]) {
      const descriptor = descriptors.find((candidate) => candidate.index === bonusIndex)
      if (
        descriptor &&
        desiredPlatformIndices.has(descriptor.sourcePlatformIndex) &&
        desiredPlatformIndices.has(descriptor.targetPlatformIndex)
      ) {
        continue
      }
      options.bonusPool!.release(lease.handle)
      activeBonuses.delete(bonusIndex)
    }
    if (!options.bonusPool) return
    for (const descriptor of descriptors) {
      if (
        collectedBonuses.has(descriptor.index) ||
        activeBonuses.has(descriptor.index) ||
        !desiredPlatformIndices.has(descriptor.sourcePlatformIndex) ||
        !desiredPlatformIndices.has(descriptor.targetPlatformIndex)
      ) {
        continue
      }
      const handle = options.bonusPool.acquire((root) => {
        materializeBonus(options.world, root, descriptor)
      })
      if (!handle) throw new Error(`Bounce Run bonus pool exhausted at bonus ${descriptor.index}`)
      activeBonuses.set(descriptor.index, {
        entity: poolHandleRoot(handle),
        handle,
        descriptor,
      })
    }
  }

  activateWindow(0)

  return {
    advanceTo(platformIndex) {
      requireLive(disposed)
      requirePlatformIndex(platformIndex)
      if (platformIndex < currentPlatformIndex) {
        throw new Error('platformIndex must not move backwards; call reset instead')
      }
      if (platformIndex === currentPlatformIndex) return
      activateWindow(platformIndex)
    },
    advanceForPosition(forwardPosition) {
      requireLive(disposed)
      if (!Number.isFinite(forwardPosition)) {
        throw new Error('forwardPosition must be finite')
      }
      let crossedIndex = currentPlatformIndex
      for (const [platformIndex, lease] of active) {
        const transform = options.world.getComponent(lease.entity, TransformComponent)
        if (transform && platformIndex > crossedIndex && transform.position[2] <= forwardPosition) {
          crossedIndex = platformIndex
        }
      }
      if (crossedIndex > currentPlatformIndex) activateWindow(crossedIndex)
    },
    reset() {
      requireLive(disposed)
      releaseOwnedLeases()
      collectedBonuses.clear()
      decisions.length = 0
      currentPlatformIndex = 0
      activateWindow(0)
    },
    dispose() {
      if (disposed) return
      releaseOwnedLeases()
      disposed = true
    },
    activePlatforms() {
      return [...active]
        .sort(([left], [right]) => left - right)
        .map(([platformIndex, lease]) => ({
          platformIndex,
          entity: lease.entity,
          descriptor: lease.descriptor,
        }))
    },
    activeBonuses() {
      return [...activeBonuses]
        .sort(([left], [right]) => left - right)
        .map(([bonusIndex, lease]) => ({
          bonusIndex,
          entity: lease.entity,
          descriptor: lease.descriptor,
        }))
    },
    collectBonus(entity) {
      requireLive(disposed)
      const entry = [...activeBonuses].find(([, lease]) => lease.entity.value === entity.value)
      if (!entry) return null
      const [bonusIndex, lease] = entry
      options.bonusPool!.release(lease.handle)
      activeBonuses.delete(bonusIndex)
      collectedBonuses.add(bonusIndex)
      return lease.descriptor
    },
    platformDescriptor(entity) {
      return (
        [...active.values()].find((lease) => lease.entity.value === entity.value)?.descriptor ??
        null
      )
    },
    decisionLog() {
      return [...decisions]
    },
  }
}

function materializeBonus(
  world: IWorld,
  entity: EntityId,
  descriptor: BounceRunBonusDescriptor,
): void {
  const transform = world.getComponent(entity, TransformComponent)
  if (!transform) throw new Error(`Pooled bonus ${entity.value} has no Transform`)
  const collider = world.getComponent(entity, ColliderComponent)
  if (!collider || collider.shape !== 'sphere' || !collider.isTrigger) {
    throw new Error(`Pooled bonus ${entity.value} must use a trigger sphere Collider`)
  }
  world.addComponent(entity, TransformComponent, {
    ...transform,
    position: [...descriptor.position] as Vec3,
  })
  world.addComponent(entity, ColliderComponent, {
    ...collider,
    radius: descriptor.radius,
    isTrigger: true,
  })
  const mesh = world.getComponent(entity, MeshRendererComponent)
  if (mesh) {
    if (mesh.geometryType !== 'SphereGeometry') {
      throw new Error(`Pooled bonus ${entity.value} mesh must use SphereGeometry`)
    }
    world.addComponent(entity, MeshRendererComponent, {
      ...mesh,
      geometryParams: { ...mesh.geometryParams, radius: descriptor.radius },
    })
  }
}

function materializePlatform(
  world: IWorld,
  entity: EntityId,
  descriptor: BounceRunRoutePlatform,
): void {
  const transform = world.getComponent(entity, TransformComponent)
  if (!transform) throw new Error(`Pooled platform ${entity.value} has no Transform`)
  const mesh = world.getComponent(entity, MeshRendererComponent)
  if (!mesh || mesh.geometryType !== 'BoxGeometry') {
    throw new Error(`Pooled platform ${entity.value} must use BoxGeometry`)
  }
  const collider = world.getComponent(entity, ColliderComponent)
  if (!collider || collider.shape !== 'box') {
    throw new Error(`Pooled platform ${entity.value} must use a box Collider`)
  }

  world.addComponent(entity, TransformComponent, {
    ...transform,
    position: [...descriptor.position] as Vec3,
  })
  world.addComponent(entity, MeshRendererComponent, {
    ...mesh,
    geometryParams: {
      ...mesh.geometryParams,
      width: descriptor.size[0],
      height: descriptor.size[1],
      depth: descriptor.size[2],
    },
    material:
      'color' in mesh.material
        ? {
            ...mesh.material,
            color: PLATFORM_COLORS[descriptor.variant],
            ...(mesh.material.materialType === 'standard'
              ? { roughness: descriptor.variant === 'bounce' ? 0.25 : 0.58 }
              : {}),
          }
        : mesh.material,
  })
  world.addComponent(entity, ColliderComponent, {
    ...collider,
    halfExtents: descriptor.size.map((dimension) => dimension / 2) as Vec3,
  })
}

function validateOptions(options: PoolBackedBounceRunRouteOptions): void {
  if (!Number.isFinite(options.seed) || !Number.isInteger(options.seed)) {
    throw new Error('seed must be a finite integer')
  }
  if (!Number.isInteger(options.activeAhead) || options.activeAhead < 2) {
    throw new Error('activeAhead must be an integer of at least 2')
  }
  if (!Number.isInteger(options.retainBehind) || options.retainBehind < 0) {
    throw new Error('retainBehind must be a non-negative integer')
  }
  const metrics = options.pool.metrics()
  if (options.activeAhead + options.retainBehind > metrics.maximum) {
    throw new Error('activeAhead plus retainBehind must not exceed pool maximum')
  }
  if (metrics.active !== 0) {
    throw new Error('Bounce Run route requires an entity pool with no active leases')
  }
  if (options.bonus?.enabled && !options.bonusPool) {
    throw new Error('Enabled Bounce Run bonus requires a dedicated entity pool')
  }
  if (options.bonusPool) {
    const bonusMetrics = options.bonusPool.metrics()
    if (bonusMetrics.maximum < 1)
      throw new Error('Bounce Run bonus pool maximum must be at least 1')
    if (bonusMetrics.active !== 0) {
      throw new Error('Bounce Run bonus requires an entity pool with no active leases')
    }
  }
}

function requirePlatformIndex(platformIndex: number): void {
  if (!Number.isInteger(platformIndex) || platformIndex < 0) {
    throw new Error('platformIndex must be a non-negative integer')
  }
}

function requireLive(disposed: boolean): void {
  if (disposed) throw new Error('Bounce Run route is disposed')
}
