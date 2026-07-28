import type { ZodType, ZodTypeDef } from 'zod'
import type { AssetTypeId, AssetRef, ComponentTypeId, RenderSettings } from '@haku/schema'
import type { SchedulerPhase } from './scheduler.js'

export interface EntityId {
  readonly __brand: 'EntityId'
  readonly value: string
}

export function entityId(value: string): EntityId {
  return { __brand: 'EntityId', value }
}

export function entityIdToString(id: EntityId): string {
  return id.value
}

export interface ComponentDefinition<T = unknown> {
  readonly id: ComponentTypeId
  readonly name: string
  readonly schema: ZodType<T, ZodTypeDef, unknown>
  readonly defaults?: () => T
  readonly version?: number
  readonly fingerprint?: string
  readonly references?: readonly {
    readonly path: string
    readonly assetType: AssetTypeId
    readonly optional?: boolean
  }[]
  readonly inspector?: ComponentInspectorDescriptor
  readonly behavior?: {
    readonly graph?: AssetRef
    readonly typescript?: {
      readonly exportName: string
      readonly domain: SchedulerPhase
      readonly query: readonly string[]
      readonly reads: readonly string[]
      readonly writes: readonly string[]
      readonly effects: readonly string[]
      readonly commands: readonly ('add' | 'set' | 'remove')[]
    }
  }
  readonly editorExtension?: {
    readonly gizmoProvider?: string
    readonly customWidget?: string
  }
  readonly lifecycle?: ComponentLifecycleHooks<T>
}

export interface ComponentInspectorFieldDescriptor {
  readonly name: string
  readonly type: string
  readonly label: string
  readonly optional: boolean
  readonly min?: number
  readonly max?: number
  readonly step?: number
  readonly placeholder?: string
  readonly multiline?: boolean
}

export interface ComponentInspectorDescriptor {
  readonly category?: string
  readonly description?: string
  readonly fields: readonly ComponentInspectorFieldDescriptor[]
}

export interface ComponentLifecycleContext<T = unknown> {
  readonly world: IWorld
  readonly entity: EntityId
  readonly component: ComponentDefinition<T>
  readonly data: T
}

export interface ComponentLifecycleHooks<T = unknown> {
  readonly create?: (context: ComponentLifecycleContext<T>) => void
  readonly activate?: (context: ComponentLifecycleContext<T>) => void
  readonly deactivate?: (context: ComponentLifecycleContext<T>) => void
  readonly destroy?: (context: ComponentLifecycleContext<T>) => void
}

export interface ComponentTypeReference {
  readonly id: ComponentTypeId | string
}

export interface ComponentRegistry {
  register(type: ComponentDefinition): void
  get(typeId: ComponentTypeId | string): ComponentDefinition | undefined
  require(typeId: ComponentTypeId | string): ComponentDefinition
  all(): readonly ComponentDefinition[]
}

export interface IWorld {
  createEntity(name?: string, id?: EntityId, activeSelf?: boolean): EntityId
  destroyEntity(id: EntityId): void
  hasEntity(id: EntityId): boolean
  getEntityName(id: EntityId): string | undefined
  setEntityName(id: EntityId, name: string): void
  getAllEntities(): readonly EntityId[]
  getActiveSelf(id: EntityId): boolean
  setActiveSelf(id: EntityId, active: boolean): void
  isActiveInHierarchy(id: EntityId): boolean

  addComponent<T>(id: EntityId, type: ComponentDefinition<T>, data: T): void
  removeComponent(id: EntityId, type: ComponentTypeReference): void
  getComponent<T>(id: EntityId, type: ComponentDefinition<T>): T | undefined
  getComponentDefinition(id: EntityId, typeId: string): ComponentDefinition | undefined
  hasComponent(id: EntityId, type: ComponentTypeReference): boolean
  getComponentTypes(id: EntityId): readonly string[]

  setParent(child: EntityId, parent: EntityId | null): void
  getParent(id: EntityId): EntityId | null
  getChildren(id: EntityId): readonly EntityId[]
  getRootEntities(): readonly EntityId[]
  moveEntityInHierarchy(
    entity: EntityId,
    target: EntityId,
    mode: 'before' | 'after' | 'child',
  ): void

  query(...types: ComponentTypeReference[]): Iterable<EntityId>
  queryIncludingInactive(...types: ComponentTypeReference[]): Iterable<EntityId>
}

export interface ViewportRenderOverrides {
  previewShadows?: boolean
}

export interface IRenderBackend {
  attach(world: IWorld): void
  detach(): void
  setActiveCamera(entityId: EntityId): void
  setRenderSettings(settings: RenderSettings): void
  setViewportOverrides(overrides: ViewportRenderOverrides): void
  render(): void
  resize(width: number, height: number): void
  getRenderTarget?(entityId: EntityId): unknown
  requestRenderTargetUpdate?(entityId: EntityId): void
}

export type { RenderMode, RenderPrototype } from '@haku/schema'
