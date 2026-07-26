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
  CustomRaycastControllerSchema,
  DynamicRaycastControllerSchema,
  ArcadeVehicleControllerSchema,
  RevoluteJointVehicleControllerSchema,
  KinematicCharacterControllerSchema,
  CharacterBodyControllerSchema,
  PointerControlsControllerSchema,
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
  type CustomRaycastController,
  type DynamicRaycastController,
  type ArcadeVehicleController,
  type RevoluteJointVehicleController,
  type KinematicCharacterController,
  type CharacterBodyController,
  type PointerControlsController,
  type AnyPhysicsController,
  type Transform,
  RenderingLayersSchema,
  RenderTextureSchema,
  type RenderingLayers,
  type RenderTexture,
} from '@haku/schema'
import type { ComponentType, EntityId, IWorld } from './types.js'
import { CORE_COMPONENT_TYPE_IDS } from './component-type-ids.js'
import { DefaultComponentRegistry } from './registry.js'

export const TransformComponent = {
  id: CORE_COMPONENT_TYPE_IDS.Transform,
  name: 'Transform',
  schema: TransformSchema,
  defaults: () => TransformSchema.parse({}),
} satisfies ComponentType<Transform>

export const CameraComponent = {
  id: CORE_COMPONENT_TYPE_IDS.Camera,
  name: 'Camera',
  schema: CameraSchema,
  defaults: () => CameraSchema.parse({}),
} satisfies ComponentType<Camera>

export const LightComponent = {
  id: CORE_COMPONENT_TYPE_IDS.Light,
  name: 'Light',
  schema: LightSchema,
  defaults: () => LightSchema.parse({ type: 'directional' }),
} satisfies ComponentType<Light>

export const MeshRendererComponent = {
  id: CORE_COMPONENT_TYPE_IDS.MeshRenderer,
  name: 'MeshRenderer',
  schema: MeshRendererSchema,
  defaults: () => MeshRendererSchema.parse({}),
} satisfies ComponentType<MeshRenderer>

export const ScriptRefComponent = {
  id: CORE_COMPONENT_TYPE_IDS.ScriptRef,
  name: 'ScriptRef',
  schema: ScriptRefSchema,
} satisfies ComponentType<ScriptRef>

export const PrefabInstanceComponent = {
  id: CORE_COMPONENT_TYPE_IDS.PrefabInstance,
  name: 'PrefabInstance',
  schema: PrefabInstanceSchema,
} satisfies ComponentType<PrefabInstance>

export const TagComponent = {
  id: CORE_COMPONENT_TYPE_IDS.Tag,
  name: 'Tag',
  schema: TagSchema,
  defaults: () => TagSchema.parse({}),
} satisfies ComponentType<Tag>

export const StaticComponent = {
  id: CORE_COMPONENT_TYPE_IDS.Static,
  name: 'Static',
  schema: StaticSchema,
  defaults: () => StaticSchema.parse({}),
} satisfies ComponentType<Static>

export const ColliderComponent = {
  id: CORE_COMPONENT_TYPE_IDS.Collider,
  name: 'Collider',
  schema: ColliderSchema,
  defaults: () => ColliderSchema.parse({ shape: 'box' }),
} satisfies ComponentType<Collider>

export const RigidBodyComponent = {
  id: CORE_COMPONENT_TYPE_IDS.RigidBody,
  name: 'RigidBody',
  schema: RigidBodySchema,
  defaults: () => RigidBodySchema.parse({}),
} satisfies ComponentType<RigidBody>

export const PhysicsAreaComponent = {
  id: CORE_COMPONENT_TYPE_IDS.PhysicsArea,
  name: 'PhysicsArea',
  schema: PhysicsAreaSchema,
  defaults: () => PhysicsAreaSchema.parse({}),
} satisfies ComponentType<PhysicsArea>

export const PhysicsJointComponent = {
  id: CORE_COMPONENT_TYPE_IDS.PhysicsJoint,
  name: 'PhysicsJoint',
  schema: PhysicsJointSchema,
  defaults: () => PhysicsJointSchema.parse({}),
} satisfies ComponentType<PhysicsJoint>

export const CollidersComponent = {
  id: CORE_COMPONENT_TYPE_IDS.Colliders,
  name: 'Colliders',
  schema: CollidersSchema,
  defaults: () => CollidersSchema.parse({}),
} satisfies ComponentType<Colliders>

export const AnimatableBodyComponent = {
  id: CORE_COMPONENT_TYPE_IDS.AnimatableBody,
  name: 'AnimatableBody',
  schema: AnimatableBodySchema,
  defaults: () => AnimatableBodySchema.parse({}),
} satisfies ComponentType<AnimatableBody>

export const CustomRaycastControllerComponent = {
  id: CORE_COMPONENT_TYPE_IDS.CustomRaycastController,
  name: 'CustomRaycastController',
  schema: CustomRaycastControllerSchema,
  defaults: () => CustomRaycastControllerSchema.parse({}),
} satisfies ComponentType<CustomRaycastController>

export const DynamicRaycastControllerComponent = {
  id: CORE_COMPONENT_TYPE_IDS.DynamicRaycastController,
  name: 'DynamicRaycastController',
  schema: DynamicRaycastControllerSchema,
  defaults: () => DynamicRaycastControllerSchema.parse({}),
} satisfies ComponentType<DynamicRaycastController>

export const ArcadeVehicleControllerComponent = {
  id: CORE_COMPONENT_TYPE_IDS.ArcadeVehicleController,
  name: 'ArcadeVehicleController',
  schema: ArcadeVehicleControllerSchema,
  defaults: () => ArcadeVehicleControllerSchema.parse({}),
} satisfies ComponentType<ArcadeVehicleController>

export const RevoluteJointVehicleControllerComponent = {
  id: CORE_COMPONENT_TYPE_IDS.RevoluteJointVehicleController,
  name: 'RevoluteJointVehicleController',
  schema: RevoluteJointVehicleControllerSchema,
  defaults: () => RevoluteJointVehicleControllerSchema.parse({}),
} satisfies ComponentType<RevoluteJointVehicleController>

export const KinematicCharacterControllerComponent = {
  id: CORE_COMPONENT_TYPE_IDS.KinematicCharacterController,
  name: 'KinematicCharacterController',
  schema: KinematicCharacterControllerSchema,
  defaults: () => KinematicCharacterControllerSchema.parse({}),
} satisfies ComponentType<KinematicCharacterController>

export const CharacterBodyControllerComponent = {
  id: CORE_COMPONENT_TYPE_IDS.CharacterBodyController,
  name: 'CharacterBodyController',
  schema: CharacterBodyControllerSchema,
  defaults: () => CharacterBodyControllerSchema.parse({}),
} satisfies ComponentType<CharacterBodyController>

export const PointerControlsControllerComponent = {
  id: CORE_COMPONENT_TYPE_IDS.PointerControlsController,
  name: 'PointerControlsController',
  schema: PointerControlsControllerSchema,
  defaults: () => PointerControlsControllerSchema.parse({}),
} satisfies ComponentType<PointerControlsController>

/** All physics controller component types (one kind each). */
export const CONTROLLER_COMPONENTS = [
  CustomRaycastControllerComponent,
  DynamicRaycastControllerComponent,
  ArcadeVehicleControllerComponent,
  RevoluteJointVehicleControllerComponent,
  KinematicCharacterControllerComponent,
  CharacterBodyControllerComponent,
  PointerControlsControllerComponent,
] as const

export type ControllerComponentType = (typeof CONTROLLER_COMPONENTS)[number]

export type ControllerOnEntity = {
  component: ControllerComponentType
  data: AnyPhysicsController
}

/** First physics controller on an entity, if any. */
export function getControllerOnEntity(
  world: IWorld,
  id: EntityId,
): ControllerOnEntity | undefined {
  for (const component of CONTROLLER_COMPONENTS) {
    const data = world.getComponent(id, component as ComponentType<AnyPhysicsController>)
    if (data) {
      return { component, data }
    }
  }
  return undefined
}

/** Whether the entity has any physics controller component. */
export function hasAnyController(world: IWorld, id: EntityId): boolean {
  return CONTROLLER_COMPONENTS.some((component) =>
    world.hasComponent(id, component as ComponentType),
  )
}

/** Iterate all entities that have any physics controller. */
export function* queryControllers(world: IWorld): IterableIterator<EntityId> {
  const seen = new Set<string>()
  for (const component of CONTROLLER_COMPONENTS) {
    for (const id of world.query(component as ComponentType)) {
      if (seen.has(id.value)) continue
      seen.add(id.value)
      yield id
    }
  }
}

export const RenderingLayersComponent = {
  id: CORE_COMPONENT_TYPE_IDS.RenderingLayers,
  name: 'RenderingLayers',
  schema: RenderingLayersSchema,
  defaults: () => RenderingLayersSchema.parse({}),
} satisfies ComponentType<RenderingLayers>

export const RenderTextureComponent = {
  id: CORE_COMPONENT_TYPE_IDS.RenderTexture,
  name: 'RenderTexture',
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
  ...CONTROLLER_COMPONENTS,
  RenderingLayersComponent,
  RenderTextureComponent,
] as const

export function createCoreComponentRegistry(): DefaultComponentRegistry {
  const registry = new DefaultComponentRegistry()
  for (const c of coreComponents) {
    registry.register(c)
  }
  return registry
}

export function getCoreComponent(typeId: string): ComponentType | undefined {
  return coreComponents.find((c) => c.id === typeId)
}
