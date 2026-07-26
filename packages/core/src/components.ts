import {
  PrefabInstanceSchema,
  ScriptRefSchema,
  StaticSchema,
  TagSchema,
  TransformSchema,
  type PrefabInstance,
  type ScriptRef,
  type Static,
  type Tag,
  type Transform,
} from '@haku/schema'
import type { ComponentRegistry, ComponentDefinition } from './types.js'
import { CORE_COMPONENT_TYPE_IDS } from './component-type-ids.js'

export const TransformComponent = {
  id: CORE_COMPONENT_TYPE_IDS.Transform,
  name: 'Transform',
  schema: TransformSchema,
  defaults: () => TransformSchema.parse({}),
} satisfies ComponentDefinition<Transform>

export const ScriptRefComponent = {
  id: CORE_COMPONENT_TYPE_IDS.ScriptRef,
  name: 'ScriptRef',
  schema: ScriptRefSchema,
} satisfies ComponentDefinition<ScriptRef>

export const PrefabInstanceComponent = {
  id: CORE_COMPONENT_TYPE_IDS.PrefabInstance,
  name: 'PrefabInstance',
  schema: PrefabInstanceSchema,
} satisfies ComponentDefinition<PrefabInstance>

export const TagComponent = {
  id: CORE_COMPONENT_TYPE_IDS.Tag,
  name: 'Tag',
  schema: TagSchema,
  defaults: () => TagSchema.parse({}),
} satisfies ComponentDefinition<Tag>

export const StaticComponent = {
  id: CORE_COMPONENT_TYPE_IDS.Static,
  name: 'Static',
  schema: StaticSchema,
  defaults: () => StaticSchema.parse({}),
} satisfies ComponentDefinition<Static>

export const coreComponents = [
  TransformComponent,
  ScriptRefComponent,
  PrefabInstanceComponent,
  TagComponent,
  StaticComponent,
] as const

export function registerCoreComponents(registry: ComponentRegistry): void {
  for (const component of coreComponents) registry.register(component)
}

export function getCoreComponent(typeId: string): ComponentDefinition | undefined {
  return coreComponents.find((component) => component.id === typeId)
}
