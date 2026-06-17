import {
  CameraSchema,
  LightSchema,
  MeshRendererSchema,
  PrefabInstanceSchema,
  ScriptRefSchema,
  StaticSchema,
  TagSchema,
  TransformSchema,
  type Camera,
  type Light,
  type MeshRenderer,
  type PrefabInstance,
  type ScriptRef,
  type Static,
  type Tag,
  type Transform,
  RenderingLayersSchema,
  RenderTextureSchema,
  type RenderingLayers,
  type RenderTexture,
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

export const TagComponent = {
  id: 'Tag',
  schema: TagSchema,
  defaults: () => TagSchema.parse({}),
} satisfies ComponentType<Tag>

export const StaticComponent = {
  id: 'Static',
  schema: StaticSchema,
  defaults: () => StaticSchema.parse({}),
} satisfies ComponentType<Static>

export const RenderingLayersComponent = {
  id: 'RenderingLayers',
  schema: RenderingLayersSchema,
  defaults: () => RenderingLayersSchema.parse({}),
} satisfies ComponentType<RenderingLayers>

export const RenderTextureComponent = {
  id: 'RenderTexture',
  schema: RenderTextureSchema,
} satisfies ComponentType<RenderTexture>

export const coreComponents = [
  TransformComponent,
  CameraComponent,
  LightComponent,
  MeshRendererComponent,
  ScriptRefComponent,
  PrefabInstanceComponent,
  TagComponent,
  StaticComponent,
  RenderingLayersComponent,
  RenderTextureComponent,
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
