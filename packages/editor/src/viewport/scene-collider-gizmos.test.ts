import { describe, expect, it } from 'vitest'
import {
  ColliderComponent,
  PhysicsControllerComponent,
  World,
  type EntityId,
} from '@haku/core'
import {
  ArcadeVehicleControllerSchema,
  ColliderSchema,
  CustomRaycastControllerSchema,
  DynamicRaycastControllerSchema,
  KinematicCharacterControllerSchema,
  PointerControlsControllerSchema,
  RevoluteJointVehicleControllerSchema,
  type Collider,
  type PhysicsController,
} from '@haku/schema'
import * as THREE from 'three'
import { SceneColliderGizmos } from './scene-collider-gizmos.js'

const explicitSphere: Collider = {
  shape: 'sphere',
  radius: 0.7,
  offset: [1, 2, 3],
  rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
}

function syncControllerGizmo(
  controller: PhysicsController,
  explicitCollider?: Collider,
): THREE.LineSegments | undefined {
  const world = new World()
  const id = world.createEntity('Controller')
  world.addComponent(id, PhysicsControllerComponent, controller)
  if (explicitCollider) {
    world.addComponent(id, ColliderComponent, explicitCollider)
  }

  const object = new THREE.Object3D()
  const objects = new Map<string, THREE.Object3D>([[id.value, object]])
  const gizmos = new SceneColliderGizmos()
  gizmos.sync(
    world,
    {
      getObject3D(entityId: EntityId) {
        return objects.get(entityId.value)
      },
    },
    { visible: true, selectedIds: new Set([id.value]) },
  )

  return object.children.find(
    (child): child is THREE.LineSegments => child.name === 'haku-collider-overlay',
  )
}

function geometrySize(lines: THREE.LineSegments): THREE.Vector3 {
  lines.geometry.computeBoundingBox()
  return lines.geometry.boundingBox!.getSize(new THREE.Vector3())
}

function expectGeometrySize(
  lines: THREE.LineSegments,
  expected: [number, number, number],
): void {
  const actual = geometrySize(lines).toArray()
  expected.forEach((value, index) => {
    expect(actual[index]).toBeCloseTo(value, 5)
  })
}

describe('SceneColliderGizmos controller parity', () => {
  it.each([
    ['custom-raycast', CustomRaycastControllerSchema.parse({ type: 'custom-raycast' })],
    ['dynamic-raycast', DynamicRaycastControllerSchema.parse({ type: 'dynamic-raycast' })],
    [
      'revolute-joint-vehicle',
      RevoluteJointVehicleControllerSchema.parse({ type: 'revolute-joint-vehicle' }),
    ],
  ])('renders the implicit chassis for %s despite a redundant collider', (_type, controller) => {
    const lines = syncControllerGizmo(controller, explicitSphere)

    expect(lines).toBeDefined()
    expectGeometrySize(lines!, controller.chassis.halfExtents.map((value) => value * 2) as [
      number,
      number,
      number,
    ])
    expect(lines!.position.toArray()).toEqual([0, controller.chassis.lift, 0])
    expect(lines!.userData.hakuImplicitCollider).toBe(true)
    expect((lines!.material as THREE.LineBasicMaterial).color.getHex()).toBe(0xffab00)
  })

  it('renders the authored arcade collider with its local transform and explicit styling', () => {
    const controller = ArcadeVehicleControllerSchema.parse({ type: 'arcade-vehicle' })

    const lines = syncControllerGizmo(controller, explicitSphere)

    expect(lines).toBeDefined()
    expect(geometrySize(lines!).toArray()).toEqual(
      expect.arrayContaining([
        expect.closeTo(1.4, 5),
        expect.closeTo(1.4, 5),
        expect.closeTo(1.4, 5),
      ]),
    )
    expect(lines!.position.toArray()).toEqual(explicitSphere.offset)
    expect(lines!.quaternion.toArray()).toEqual(explicitSphere.rotation)
    expect(lines!.userData.hakuImplicitCollider).toBe(false)
    expect((lines!.material as THREE.LineBasicMaterial).color.getHex()).toBe(0x00e676)
  })

  it('renders the arcade chassis fallback as implicit', () => {
    const controller = ArcadeVehicleControllerSchema.parse({
      type: 'arcade-vehicle',
      chassis: { halfExtents: [1, 0.4, 2], lift: 0.6 },
    })

    const lines = syncControllerGizmo(controller)

    expectGeometrySize(lines!, [2, 0.8, 4])
    expect(lines!.position.toArray()).toEqual([0, 0.6, 0])
    expect(lines!.userData.hakuImplicitCollider).toBe(true)
  })

  it('renders the implicit kinematic capsule at the exact runtime offset', () => {
    const controller = KinematicCharacterControllerSchema.parse({
      type: 'kinematic-character',
      capsuleRadius: 0.4,
      capsuleHalfHeight: 0.75,
    })

    const lines = syncControllerGizmo(controller, explicitSphere)

    expect(lines).toBeDefined()
    expect(geometrySize(lines!).y).toBeCloseTo(2.3, 5)
    expect(lines!.position.toArray()).toEqual([0, 1.15, 0])
    expect(lines!.quaternion.toArray()).toEqual([0, 0, 0, 1])
    expect(lines!.userData.hakuImplicitCollider).toBe(true)
  })

  it.each([
    ['pointer-controls', PointerControlsControllerSchema.parse({ type: 'pointer-controls' })],
  ])('renders no collider for non-collider controller %s', (_type, controller) => {
    expect(syncControllerGizmo(controller, explicitSphere)).toBeUndefined()
  })

  it('renders colliders for unselected entities when showAll is enabled', () => {
    const world = new World()
    const selectedId = world.createEntity('Selected')
    const otherId = world.createEntity('Other')
    world.addComponent(otherId, ColliderComponent, ColliderSchema.parse({
      shape: 'box',
      halfExtents: [0.5, 0.5, 0.5],
    }))

    const selectedObject = new THREE.Object3D()
    const otherObject = new THREE.Object3D()
    const objects = new Map<string, THREE.Object3D>([
      [selectedId.value, selectedObject],
      [otherId.value, otherObject],
    ])
    const gizmos = new SceneColliderGizmos()
    gizmos.sync(
      world,
      {
        getObject3D(entityId: EntityId) {
          return objects.get(entityId.value)
        },
      },
      { visible: true, selectedIds: new Set([selectedId.value]), showAll: true },
    )

    expect(otherObject.children.some((child) => child.name === 'haku-collider-overlay')).toBe(true)
  })
})
