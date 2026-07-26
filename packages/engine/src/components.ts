import {
  componentTypeId,
} from '@haku/schema'
import {
  DefaultComponentRegistry,
  registerCoreComponents,
  type ComponentRegistry,
  type ComponentDefinition,
} from '@haku/core'
import { registerPhysicsComponents } from '@haku/physics'
import { CameraSchema, type Camera } from './camera.js'
import { LightSchema, type Light } from './light.js'
import { MeshRendererSchema, type MeshRenderer } from './mesh.js'
import { RenderingLayersSchema, type RenderingLayers } from './rendering-layers.js'
import { RenderTextureSchema, type RenderTexture } from './render-texture.js'

export const RENDER_COMPONENT_TYPE_IDS = {
  Camera: componentTypeId('40000000-0000-4000-8000-000000000002'),
  Light: componentTypeId('40000000-0000-4000-8000-000000000003'),
  MeshRenderer: componentTypeId('40000000-0000-4000-8000-000000000004'),
  RenderingLayers: componentTypeId('40000000-0000-4000-8000-000000000022'),
  RenderTexture: componentTypeId('40000000-0000-4000-8000-000000000023'),
} as const

export const CameraComponent = {
  id: RENDER_COMPONENT_TYPE_IDS.Camera, name: 'Camera', schema: CameraSchema,
  defaults: () => CameraSchema.parse({}),
} satisfies ComponentDefinition<Camera>
export const LightComponent = {
  id: RENDER_COMPONENT_TYPE_IDS.Light, name: 'Light', schema: LightSchema,
  defaults: () => LightSchema.parse({ type: 'directional' }),
} satisfies ComponentDefinition<Light>
export const MeshRendererComponent = {
  id: RENDER_COMPONENT_TYPE_IDS.MeshRenderer, name: 'MeshRenderer', schema: MeshRendererSchema,
  defaults: () => MeshRendererSchema.parse({}),
} satisfies ComponentDefinition<MeshRenderer>
export const RenderingLayersComponent = {
  id: RENDER_COMPONENT_TYPE_IDS.RenderingLayers, name: 'RenderingLayers',
  schema: RenderingLayersSchema, defaults: () => RenderingLayersSchema.parse({}),
} satisfies ComponentDefinition<RenderingLayers>
export const RenderTextureComponent = {
  id: RENDER_COMPONENT_TYPE_IDS.RenderTexture, name: 'RenderTexture', schema: RenderTextureSchema,
} satisfies ComponentDefinition<RenderTexture>

export const renderComponents = [
  CameraComponent, LightComponent, MeshRendererComponent,
  RenderingLayersComponent, RenderTextureComponent,
] as const
export function registerRenderComponents(registry: ComponentRegistry): void {
  for (const component of renderComponents) registry.register(component)
}

export function createEngineComponentRegistry(): DefaultComponentRegistry {
  const registry = new DefaultComponentRegistry()
  registerCoreComponents(registry)
  registerPhysicsComponents(registry)
  registerRenderComponents(registry)
  return registry
}

export function getEngineComponent(typeId: string): ComponentDefinition | undefined {
  return createEngineComponentRegistry().get(typeId)
}
