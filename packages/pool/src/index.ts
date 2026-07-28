import {
  entityId,
  type ComponentDefinition,
  type EntityId,
  type IWorld,
} from '@haku/core'
import { PREFAB_ASSET_TYPE } from '@haku/assets'
import { AssetRefSchema, componentTypeId } from '@haku/schema'
import { z } from 'zod'

export const ENTITY_POOL_COMPONENT_TYPE_ID = componentTypeId(
  '40000000-0000-4000-8000-000000000009',
)

export const PoolExpansionPolicySchema = z.enum(['fixed', 'grow'])
export const PoolExhaustionPolicySchema = z.enum(['return-null', 'throw', 'reuse-oldest'])

export const EntityPoolSchema = z
  .object({
    template: AssetRefSchema,
    capacity: z.number().int().nonnegative().default(0),
    maximum: z.number().int().positive(),
    prewarm: z.number().int().nonnegative().default(0),
    expansionPolicy: PoolExpansionPolicySchema.default('grow'),
    exhaustionPolicy: PoolExhaustionPolicySchema.default('return-null'),
  })
  .superRefine((value, context) => {
    if (value.capacity > value.maximum) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capacity'],
        message: 'Pool capacity must not exceed maximum',
      })
    }
    if (value.prewarm > value.maximum) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prewarm'],
        message: 'Pool prewarm must not exceed maximum',
      })
    }
  })

export type EntityPoolData = z.infer<typeof EntityPoolSchema>
export type PoolExpansionPolicy = z.infer<typeof PoolExpansionPolicySchema>
export type PoolExhaustionPolicy = z.infer<typeof PoolExhaustionPolicySchema>

export const EntityPoolComponent: ComponentDefinition<EntityPoolData> = {
  id: ENTITY_POOL_COMPONENT_TYPE_ID,
  name: 'EntityPool',
  schema: EntityPoolSchema,
  references: [{ path: 'template', assetType: PREFAB_ASSET_TYPE }],
}

export interface PoolHandle {
  readonly pool: string
  readonly entity: string
  readonly generation: number
}

export type PoolLifecycleAction = 'acquire' | 'release' | 'clear'

export interface PoolLifecycleEvent {
  readonly action: PoolLifecycleAction
  readonly pool: string
  readonly root: EntityId
  readonly entities: readonly EntityId[]
  readonly generation: number
  readonly scope: PoolRuntimeScope
}

export interface PoolLifecycleParticipant {
  onPoolLifecycle(event: PoolLifecycleEvent): void
}

export interface PoolMetrics {
  readonly capacity: number
  readonly maximum: number
  readonly total: number
  readonly active: number
  readonly inactive: number
  readonly acquisitions: number
  readonly releases: number
  readonly expansions: number
  readonly exhaustions: number
  readonly forcedReleases: number
}

export interface EntityPoolOptions {
  readonly id?: string
  readonly world: IWorld
  readonly createInstance: () => EntityId
  readonly capacity?: number
  readonly maximum?: number
  readonly expansionPolicy?: PoolExpansionPolicy
  readonly exhaustionPolicy?: PoolExhaustionPolicy
  readonly participants?: readonly PoolLifecycleParticipant[]
  readonly onLifecycle?: (event: PoolLifecycleEvent) => void
}

interface EntityBaseline {
  readonly id: EntityId
  readonly name: string
  readonly parent: EntityId | null
  readonly activeSelf: boolean
  readonly components: readonly {
    readonly definition: ComponentDefinition
    readonly data: unknown
  }[]
}

interface PoolRecord {
  readonly root: EntityId
  readonly baseline: readonly EntityBaseline[]
  scope: PoolRuntimeScope
  generation: number
  active: boolean
  acquiredSequence: number
}

/**
 * Lease-owned runtime state. Releasing the lease aborts tasks, runs subscription/resource
 * cleanup in reverse registration order, clears flags, and replaces this scope before reuse.
 */
export class PoolRuntimeScope {
  private controller = new AbortController()
  private readonly cleanups: Array<() => void> = []
  private readonly mutableFlags = new Map<string, boolean>()

  get signal(): AbortSignal {
    return this.controller.signal
  }

  get flags(): ReadonlyMap<string, boolean> {
    return this.mutableFlags
  }

  setFlag(name: string, value: boolean): void {
    this.mutableFlags.set(name, value)
  }

  addCleanup(cleanup: () => void): () => void {
    this.cleanups.push(cleanup)
    return () => {
      const index = this.cleanups.indexOf(cleanup)
      if (index >= 0) this.cleanups.splice(index, 1)
    }
  }

  trackTask<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    return task(this.controller.signal)
  }

  reset(): void {
    this.controller.abort()
    for (const cleanup of [...this.cleanups].reverse()) cleanup()
    this.cleanups.length = 0
    this.mutableFlags.clear()
    this.controller = new AbortController()
  }
}

class PoolSystem {
  private readonly records = new Map<string, PoolRecord>()
  private currentCapacity: number
  private nextAcquireSequence = 0
  private acquisitions = 0
  private releases = 0
  private expansions = 0
  private exhaustions = 0
  private forcedReleases = 0

  constructor(
    private readonly poolId: string,
    private readonly options: Required<
      Pick<EntityPoolOptions, 'world' | 'createInstance' | 'expansionPolicy' | 'exhaustionPolicy'>
    > &
      Pick<EntityPoolOptions, 'participants' | 'onLifecycle'> & {
        readonly maximum: number
        readonly capacity: number
      },
  ) {
    this.currentCapacity = options.capacity
  }

  prewarm(count = this.currentCapacity): void {
    requireNonNegativeInteger(count, 'Pool prewarm count')
    if (count > this.options.maximum) {
      throw new Error('Pool prewarm count must not exceed maximum')
    }
    this.currentCapacity = Math.max(this.currentCapacity, count)
    while (this.records.size < count) this.createInactiveRecord()
  }

  acquire(): PoolHandle | null {
    let record = [...this.records.values()].find((candidate) => !candidate.active)
    if (!record && this.canExpand()) {
      this.expandCapacity()
      record = this.createInactiveRecord()
    }
    if (!record) {
      this.exhaustions += 1
      if (this.options.exhaustionPolicy === 'throw') {
        throw new Error(`Pool ${this.poolId} is exhausted`)
      }
      if (this.options.exhaustionPolicy === 'reuse-oldest') {
        record = [...this.records.values()]
          .filter((candidate) => candidate.active)
          .sort((left, right) => left.acquiredSequence - right.acquiredSequence)[0]
        if (record) {
          this.releaseRecord(record)
          this.forcedReleases += 1
        }
      }
    }
    if (!record) return null

    this.restoreBaseline(record, true)
    record.generation += 1
    record.active = true
    record.acquiredSequence = this.nextAcquireSequence++
    this.options.world.setActiveSelf(record.root, true)
    this.dispatch(record, 'acquire')
    this.acquisitions += 1
    return this.handleFor(record)
  }

  release(handle: PoolHandle): void {
    const record = this.requireHandle(handle)
    if (!record.active || record.generation !== handle.generation) {
      throw new Error(`Stale pool handle for entity ${handle.entity}`)
    }
    this.releaseRecord(record)
  }

  releaseAll(): void {
    for (const record of this.records.values()) {
      if (record.active) this.releaseRecord(record)
    }
  }

  clear(): void {
    for (const record of [...this.records.values()]) {
      if (record.active) this.releaseRecord(record)
      this.dispatch(record, 'clear')
      this.destroyOwnedHierarchy(record)
      this.records.delete(record.root.value)
    }
    this.currentCapacity = this.options.capacity
  }

  metrics(): PoolMetrics {
    const active = [...this.records.values()].filter((record) => record.active).length
    return {
      capacity: this.currentCapacity,
      maximum: this.options.maximum,
      total: this.records.size,
      active,
      inactive: this.records.size - active,
      acquisitions: this.acquisitions,
      releases: this.releases,
      expansions: this.expansions,
      exhaustions: this.exhaustions,
      forcedReleases: this.forcedReleases,
    }
  }

  scope(handle: PoolHandle): PoolRuntimeScope {
    const record = this.requireHandle(handle)
    if (!record.active || record.generation !== handle.generation) {
      throw new Error(`Stale pool handle for entity ${handle.entity}`)
    }
    return record.scope
  }

  private canExpand(): boolean {
    if (this.records.size >= this.options.maximum) return false
    return (
      this.records.size < this.currentCapacity ||
      this.options.expansionPolicy === 'grow'
    )
  }

  private expandCapacity(): void {
    if (this.records.size < this.currentCapacity) return
    const next = this.currentCapacity === 0 ? 1 : this.currentCapacity * 2
    this.currentCapacity = Math.min(this.options.maximum, next)
    this.expansions += 1
  }

  private createInactiveRecord(): PoolRecord {
    if (this.records.size >= this.options.maximum) {
      throw new Error(`Pool ${this.poolId} reached maximum ${this.options.maximum}`)
    }
    const root = this.options.createInstance()
    if (!this.options.world.hasEntity(root)) {
      throw new Error(`Pool factory returned missing entity ${root.value}`)
    }
    if (!this.options.world.getActiveSelf(root)) {
      throw new Error('Pool instance root must be authored active')
    }
    const baseline = captureBaseline(this.options.world, root)
    const record: PoolRecord = {
      root,
      baseline,
      scope: new PoolRuntimeScope(),
      generation: 0,
      active: false,
      acquiredSequence: -1,
    }
    this.records.set(root.value, record)
    this.options.world.setActiveSelf(root, false)
    return record
  }

  private releaseRecord(record: PoolRecord): void {
    this.options.world.setActiveSelf(record.root, false)
    this.dispatch(record, 'release')
    record.scope.reset()
    this.restoreBaseline(record, false)
    record.active = false
    this.releases += 1
  }

  private restoreBaseline(record: PoolRecord, activateRoot: boolean): void {
    const world = this.options.world
    const baselineIds = new Set(record.baseline.map((entity) => entity.id.value))
    if (world.hasEntity(record.root)) {
      for (const id of collectSubtree(world, record.root).reverse()) {
        if (!baselineIds.has(id.value)) world.destroyEntity(id)
      }
    }

    for (const entity of record.baseline) {
      if (!world.hasEntity(entity.id)) {
        world.createEntity(entity.name, entity.id, false)
      }
      world.setEntityName(entity.id, entity.name)
      for (const typeId of world.getComponentTypes(entity.id)) {
        if (!entity.components.some((component) => component.definition.id === typeId)) {
          world.removeComponent(entity.id, { id: typeId })
        }
      }
      for (const component of entity.components) {
        world.addComponent(entity.id, component.definition, structuredClone(component.data))
      }
    }

    for (const entity of record.baseline) world.setParent(entity.id, entity.parent)
    for (const entity of record.baseline) {
      const intended = entity.id.value === record.root.value
        ? activateRoot && entity.activeSelf
        : entity.activeSelf
      world.setActiveSelf(entity.id, intended)
    }
  }

  private destroyOwnedHierarchy(record: PoolRecord): void {
    for (const id of collectSubtree(this.options.world, record.root).reverse()) {
      this.options.world.destroyEntity(id)
    }
    for (const baseline of [...record.baseline].reverse()) {
      if (this.options.world.hasEntity(baseline.id)) {
        this.options.world.destroyEntity(baseline.id)
      }
    }
  }

  private dispatch(record: PoolRecord, action: PoolLifecycleAction): void {
    const event: PoolLifecycleEvent = {
      action,
      pool: this.poolId,
      root: record.root,
      entities: record.baseline.map((entity) => entity.id),
      generation: record.generation,
      scope: record.scope,
    }
    for (const participant of this.options.participants ?? []) {
      participant.onPoolLifecycle(event)
    }
    this.options.onLifecycle?.(event)
  }

  private requireHandle(handle: PoolHandle): PoolRecord {
    if (handle.pool !== this.poolId) {
      throw new Error(`Pool handle belongs to ${handle.pool}, expected ${this.poolId}`)
    }
    const record = this.records.get(handle.entity)
    if (!record) throw new Error(`Unknown pooled entity ${handle.entity}`)
    return record
  }

  private handleFor(record: PoolRecord): PoolHandle {
    return {
      pool: this.poolId,
      entity: record.root.value,
      generation: record.generation,
    }
  }
}

export class EntityPool {
  readonly id: string
  private readonly system: PoolSystem

  constructor(options: EntityPoolOptions) {
    this.id = options.id ?? crypto.randomUUID()
    const capacity = options.capacity ?? 0
    const maximum = options.maximum ?? Number.MAX_SAFE_INTEGER
    requireNonNegativeInteger(capacity, 'Pool capacity')
    requirePositiveInteger(maximum, 'Pool maximum')
    if (capacity > maximum) throw new Error('Pool capacity must not exceed maximum')
    this.system = new PoolSystem(this.id, {
      world: options.world,
      createInstance: options.createInstance,
      capacity,
      maximum,
      expansionPolicy: options.expansionPolicy ?? 'grow',
      exhaustionPolicy: options.exhaustionPolicy ?? 'return-null',
      participants: options.participants,
      onLifecycle: options.onLifecycle,
    })
  }

  prewarm(count?: number): void {
    this.system.prewarm(count)
  }

  acquire(): PoolHandle | null {
    return this.system.acquire()
  }

  release(handle: PoolHandle): void {
    this.system.release(handle)
  }

  releaseAll(): void {
    this.system.releaseAll()
  }

  clear(): void {
    this.system.clear()
  }

  metrics(): PoolMetrics {
    return this.system.metrics()
  }

  scope(handle: PoolHandle): PoolRuntimeScope {
    return this.system.scope(handle)
  }
}

function captureBaseline(world: IWorld, root: EntityId): readonly EntityBaseline[] {
  return collectSubtree(world, root).map((id) => ({
    id,
    name: world.getEntityName(id) ?? 'Entity',
    parent: world.getParent(id),
    activeSelf: world.getActiveSelf(id),
    components: [...world.getComponentTypes(id)].sort().map((typeId) => {
      const definition = world.getComponentDefinition(id, typeId)
      if (!definition) throw new Error(`Missing component definition ${typeId}`)
      const data = world.getComponent(id, definition)
      return {
        definition,
        data: structuredClone(definition.schema.parse(data)),
      }
    }),
  }))
}

function collectSubtree(world: IWorld, root: EntityId): EntityId[] {
  const result: EntityId[] = []
  const visit = (id: EntityId): void => {
    if (!world.hasEntity(id)) return
    result.push(id)
    for (const child of world.getChildren(id)) visit(child)
  }
  visit(root)
  return result
}

function requireNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
}

export function poolHandleRoot(handle: PoolHandle): EntityId {
  return entityId(handle.entity)
}
