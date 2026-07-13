import type { ZodType, ZodTypeDef } from 'zod'
import type { RenderSettings } from '@haku/schema'

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

export interface ComponentType<T = unknown> {
  readonly id: string
  readonly schema: ZodType<T, ZodTypeDef, unknown>
  readonly defaults?: () => T
}

export interface ComponentRegistry {
  register(type: ComponentType): void
  get(typeId: string): ComponentType | undefined
  all(): ComponentType[]
}

export interface IWorld {
  createEntity(name?: string, id?: EntityId): EntityId
  destroyEntity(id: EntityId): void
  hasEntity(id: EntityId): boolean
  getEntityName(id: EntityId): string | undefined
  setEntityName(id: EntityId, name: string): void
  getAllEntities(): readonly EntityId[]

  addComponent<T>(id: EntityId, type: ComponentType<T>, data: T): void
  removeComponent(id: EntityId, type: ComponentType): void
  getComponent<T>(id: EntityId, type: ComponentType<T>): T | undefined
  hasComponent(id: EntityId, type: ComponentType): boolean
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

  query(...types: ComponentType[]): Iterable<EntityId>
}

export interface ISystem {
  readonly order?: number
  update(world: IWorld, dt: number): void
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
