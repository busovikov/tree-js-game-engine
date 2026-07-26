import {
  componentTypeId,
} from '@haku/schema'
import { type ComponentRegistry, type ComponentDefinition, type EntityId, type IWorld } from '@haku/core'
import { AnimatableBodySchema, type AnimatableBody } from './animatable-body.js'
import { ColliderSchema, type Collider } from './collider.js'
import { CollidersSchema, type Colliders } from './colliders-array.js'
import { PhysicsAreaSchema, type PhysicsArea } from './physics-area.js'
import {
  ArcadeVehicleControllerSchema,
  CharacterBodyControllerSchema,
  CustomRaycastControllerSchema,
  DynamicRaycastControllerSchema,
  KinematicCharacterControllerSchema,
  PointerControlsControllerSchema,
  RevoluteJointVehicleControllerSchema,
  type AnyPhysicsController,
  type ArcadeVehicleController,
  type CharacterBodyController,
  type CustomRaycastController,
  type DynamicRaycastController,
  type KinematicCharacterController,
  type PointerControlsController,
  type RevoluteJointVehicleController,
} from './physics-controller.js'
import { PhysicsJointSchema, type PhysicsJoint } from './physics-joint.js'
import { RigidBodySchema, type RigidBody } from './rigid-body.js'

export const PHYSICS_COMPONENT_TYPE_IDS = {
  Collider: componentTypeId('40000000-0000-4000-8000-000000000009'),
  RigidBody: componentTypeId('40000000-0000-4000-8000-000000000010'),
  PhysicsArea: componentTypeId('40000000-0000-4000-8000-000000000011'),
  PhysicsJoint: componentTypeId('40000000-0000-4000-8000-000000000012'),
  Colliders: componentTypeId('40000000-0000-4000-8000-000000000013'),
  AnimatableBody: componentTypeId('40000000-0000-4000-8000-000000000014'),
  CustomRaycastController: componentTypeId('40000000-0000-4000-8000-000000000015'),
  DynamicRaycastController: componentTypeId('40000000-0000-4000-8000-000000000016'),
  ArcadeVehicleController: componentTypeId('40000000-0000-4000-8000-000000000017'),
  RevoluteJointVehicleController: componentTypeId('40000000-0000-4000-8000-000000000018'),
  KinematicCharacterController: componentTypeId('40000000-0000-4000-8000-000000000019'),
  CharacterBodyController: componentTypeId('40000000-0000-4000-8000-000000000020'),
  PointerControlsController: componentTypeId('40000000-0000-4000-8000-000000000021'),
} as const

export const ColliderComponent = {
  id: PHYSICS_COMPONENT_TYPE_IDS.Collider, name: 'Collider', schema: ColliderSchema,
  defaults: () => ColliderSchema.parse({ shape: 'box' }),
} satisfies ComponentDefinition<Collider>
export const RigidBodyComponent = {
  id: PHYSICS_COMPONENT_TYPE_IDS.RigidBody, name: 'RigidBody', schema: RigidBodySchema,
  defaults: () => RigidBodySchema.parse({}),
} satisfies ComponentDefinition<RigidBody>
export const PhysicsAreaComponent = {
  id: PHYSICS_COMPONENT_TYPE_IDS.PhysicsArea, name: 'PhysicsArea', schema: PhysicsAreaSchema,
  defaults: () => PhysicsAreaSchema.parse({}),
} satisfies ComponentDefinition<PhysicsArea>
export const PhysicsJointComponent = {
  id: PHYSICS_COMPONENT_TYPE_IDS.PhysicsJoint, name: 'PhysicsJoint', schema: PhysicsJointSchema,
  defaults: () => PhysicsJointSchema.parse({}),
} satisfies ComponentDefinition<PhysicsJoint>
export const CollidersComponent = {
  id: PHYSICS_COMPONENT_TYPE_IDS.Colliders, name: 'Colliders', schema: CollidersSchema,
  defaults: () => CollidersSchema.parse({}),
} satisfies ComponentDefinition<Colliders>
export const AnimatableBodyComponent = {
  id: PHYSICS_COMPONENT_TYPE_IDS.AnimatableBody, name: 'AnimatableBody', schema: AnimatableBodySchema,
  defaults: () => AnimatableBodySchema.parse({}),
} satisfies ComponentDefinition<AnimatableBody>
export const CustomRaycastControllerComponent = {
  id: PHYSICS_COMPONENT_TYPE_IDS.CustomRaycastController, name: 'CustomRaycastController',
  schema: CustomRaycastControllerSchema, defaults: () => CustomRaycastControllerSchema.parse({}),
} satisfies ComponentDefinition<CustomRaycastController>
export const DynamicRaycastControllerComponent = {
  id: PHYSICS_COMPONENT_TYPE_IDS.DynamicRaycastController, name: 'DynamicRaycastController',
  schema: DynamicRaycastControllerSchema, defaults: () => DynamicRaycastControllerSchema.parse({}),
} satisfies ComponentDefinition<DynamicRaycastController>
export const ArcadeVehicleControllerComponent = {
  id: PHYSICS_COMPONENT_TYPE_IDS.ArcadeVehicleController, name: 'ArcadeVehicleController',
  schema: ArcadeVehicleControllerSchema, defaults: () => ArcadeVehicleControllerSchema.parse({}),
} satisfies ComponentDefinition<ArcadeVehicleController>
export const RevoluteJointVehicleControllerComponent = {
  id: PHYSICS_COMPONENT_TYPE_IDS.RevoluteJointVehicleController,
  name: 'RevoluteJointVehicleController', schema: RevoluteJointVehicleControllerSchema,
  defaults: () => RevoluteJointVehicleControllerSchema.parse({}),
} satisfies ComponentDefinition<RevoluteJointVehicleController>
export const KinematicCharacterControllerComponent = {
  id: PHYSICS_COMPONENT_TYPE_IDS.KinematicCharacterController,
  name: 'KinematicCharacterController', schema: KinematicCharacterControllerSchema,
  defaults: () => KinematicCharacterControllerSchema.parse({}),
} satisfies ComponentDefinition<KinematicCharacterController>
export const CharacterBodyControllerComponent = {
  id: PHYSICS_COMPONENT_TYPE_IDS.CharacterBodyController, name: 'CharacterBodyController',
  schema: CharacterBodyControllerSchema, defaults: () => CharacterBodyControllerSchema.parse({}),
} satisfies ComponentDefinition<CharacterBodyController>
export const PointerControlsControllerComponent = {
  id: PHYSICS_COMPONENT_TYPE_IDS.PointerControlsController, name: 'PointerControlsController',
  schema: PointerControlsControllerSchema, defaults: () => PointerControlsControllerSchema.parse({}),
} satisfies ComponentDefinition<PointerControlsController>

export const CONTROLLER_COMPONENTS = [
  CustomRaycastControllerComponent, DynamicRaycastControllerComponent,
  ArcadeVehicleControllerComponent, RevoluteJointVehicleControllerComponent,
  KinematicCharacterControllerComponent, CharacterBodyControllerComponent,
  PointerControlsControllerComponent,
] as const
export type ControllerComponentType = (typeof CONTROLLER_COMPONENTS)[number]
export type ControllerOnEntity = { component: ControllerComponentType; data: AnyPhysicsController }

export function getControllerOnEntity(world: IWorld, id: EntityId): ControllerOnEntity | undefined {
  for (const component of CONTROLLER_COMPONENTS) {
    const data = world.getComponent(id, component as ComponentDefinition<AnyPhysicsController>)
    if (data) return { component, data }
  }
  return undefined
}
export function hasAnyController(world: IWorld, id: EntityId): boolean {
  return CONTROLLER_COMPONENTS.some((component) => world.hasComponent(id, component as ComponentDefinition))
}
export function* queryControllers(world: IWorld): IterableIterator<EntityId> {
  const seen = new Set<string>()
  for (const component of CONTROLLER_COMPONENTS) {
    for (const id of world.query(component as ComponentDefinition)) {
      if (seen.has(id.value)) continue
      seen.add(id.value)
      yield id
    }
  }
}

export const physicsComponents = [
  ColliderComponent, RigidBodyComponent, PhysicsAreaComponent, PhysicsJointComponent,
  CollidersComponent, AnimatableBodyComponent, ...CONTROLLER_COMPONENTS,
] as const
export function registerPhysicsComponents(registry: ComponentRegistry): void {
  for (const component of physicsComponents) registry.register(component)
}
export function getPhysicsComponent(typeId: string): ComponentDefinition | undefined {
  return physicsComponents.find((component) => component.id === typeId)
}
