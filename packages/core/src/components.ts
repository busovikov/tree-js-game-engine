import {
  CameraSchema,
  LightSchema,
  MeshRendererSchema,
  PrefabInstanceSchema,
  ScriptRefSchema,
  TransformSchema,
  type Camera,
  type Light,
  type MeshRenderer,
  type PrefabInstance,
  type ScriptRef,
  type Transform,
} from '@haku/schema'
import type { ComponentType } from './types.js'
import { globalComponentRegistry } from './registry.js'

export const TransformComponent = {
  id: 'Transform',
  schema: TransformSchema,
  defaults: () => TransformSchema.parse({}),
} satisfies ComponentType<Transform>

export const CameraComponent = {
  id: 'Camera',
  schema: CameraSchema,
  defaults: () => CameraSchema.parse({}),
} satisfies ComponentType<Camera>

export const LightComponent = {
  id: 'Light',
  schema: LightSchema,
  defaults: () => LightSchema.parse({ type: 'directional' }),
} satisfies ComponentType<Light>

export const MeshRendererComponent = {
  id: 'MeshRenderer',
  schema: MeshRendererSchema,
  defaults: () => MeshRendererSchema.parse({}),
} satisfies ComponentType<MeshRenderer>

export const ScriptRefComponent = {
  id: 'ScriptRef',
  schema: ScriptRefSchema,
} satisfies ComponentType<ScriptRef>

export const PrefabInstanceComponent = {
  id: 'PrefabInstance',
  schema: PrefabInstanceSchema,
} satisfies ComponentType<PrefabInstance>

export const coreComponents = [
  TransformComponent,
  CameraComponent,
  LightComponent,
  MeshRendererComponent,
  ScriptRefComponent,
  PrefabInstanceComponent,
] as const

export function registerCoreComponents(): void {
  for (const c of coreComponents) {
    globalComponentRegistry.register(c)
  }
}

registerCoreComponents()

export function getCoreComponent(typeId: string): ComponentType | undefined {
  return coreComponents.find((c) => c.id === typeId)
}
