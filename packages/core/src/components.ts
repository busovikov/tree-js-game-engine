import {
  CameraSchema,
  LightSchema,
  MeshRendererSchema,
  PrefabInstanceSchema,
  ScriptRefSchema,
  StaticSchema,
  TagSchema,
  ColliderSchema,
  RigidBodySchema,
  PhysicsAreaSchema,
  PhysicsJointSchema,
  CollidersSchema,
  AnimatableBodySchema,
  PhysicsControllerSchema,
  TransformSchema,
  type Camera,
  type Light,
  type MeshRenderer,
  type PrefabInstance,
  type ScriptRef,
  type Static,
  type Tag,
  type Collider,
  type RigidBody,
  type PhysicsArea,
  type PhysicsJoint,
  type Colliders,
  type AnimatableBody,
  type PhysicsController,
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

export const ColliderComponent = {
  id: 'Collider',
  schema: ColliderSchema,
  defaults: () => ColliderSchema.parse({ shape: 'box' }),
} satisfies ComponentType<Collider>

export const RigidBodyComponent = {
  id: 'RigidBody',
  schema: RigidBodySchema,
  defaults: () => RigidBodySchema.parse({}),
} satisfies ComponentType<RigidBody>

export const PhysicsAreaComponent = {
  id: 'PhysicsArea',
  schema: PhysicsAreaSchema,
  defaults: () => PhysicsAreaSchema.parse({}),
} satisfies ComponentType<PhysicsArea>

export const PhysicsJointComponent = {
  id: 'PhysicsJoint',
  schema: PhysicsJointSchema,
  defaults: () => PhysicsJointSchema.parse({}),
} satisfies ComponentType<PhysicsJoint>

export const CollidersComponent = {
  id: 'Colliders',
  schema: CollidersSchema,
  defaults: () => CollidersSchema.parse({}),
} satisfies ComponentType<Colliders>

export const AnimatableBodyComponent = {
  id: 'AnimatableBody',
  schema: AnimatableBodySchema,
  defaults: () => AnimatableBodySchema.parse({}),
} satisfies ComponentType<AnimatableBody>

export const PhysicsControllerComponent = {
  id: 'PhysicsController',
  schema: PhysicsControllerSchema,
  defaults: () => PhysicsControllerSchema.parse({ type: 'custom-raycast' }),
} satisfies ComponentType<PhysicsController>

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
  ColliderComponent,
  RigidBodyComponent,
  PhysicsAreaComponent,
  PhysicsJointComponent,
  CollidersComponent,
  AnimatableBodyComponent,
  PhysicsControllerComponent,
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
