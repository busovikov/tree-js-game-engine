import { describe, expect, it } from 'vitest'
import {
  MeshRendererComponent,
  PhysicsControllerComponent,
  TransformComponent,
  World,
} from '@haku/core'
import { DynamicRaycastControllerSchema, MeshRendererSchema } from '@haku/schema'
import {
  computeDynamicRaycastWheelLocalTransform,
  computeDynamicRaycastWheelRestTransform,
  createDynamicRaycastWheelRestPoseResolver,
  DYNAMIC_RAYCAST_WHEEL_MESH_ROTATION,
  stabilizeQuaternion,
  smoothSuspensionSample,
  unwrapWheelRotation,
} from './dynamic-raycast-visual-sync-system.js'

describe('computeDynamicRaycastWheelLocalTransform', () => {
  it('drops wheel by suspension length along local Y', () => {
    const visual = computeDynamicRaycastWheelLocalTransform(
      [-1, 0, 1.5],
      0,
      0.8,
      0,
      0,
      [-1, 0, 0],
    )

    expect(visual.position).toEqual([-1, -0.8, 1.5])
  })

  it('uses live suspension compression when available', () => {
    const visual = computeDynamicRaycastWheelLocalTransform(
      [1, 0, 1.5],
      0,
      0.55,
      0,
      0,
      [-1, 0, 0],
    )

    expect(visual.position[1]).toBeCloseTo(-0.55, 5)
  })

  it('keeps Three.js cylinder base rotation when steering and roll are zero', () => {
    const visual = computeDynamicRaycastWheelLocalTransform(
      [-1, 0, 1.5],
      0,
      0.8,
      0,
      0,
      [-1, 0, 0],
    )

    expect(visual.rotation).toEqual(DYNAMIC_RAYCAST_WHEEL_MESH_ROTATION)
  })

  it('rest pose drops wheels below chassis connection point', () => {
    const visual = computeDynamicRaycastWheelRestTransform([-1, 0, 1.5], 0.8, [-1, 0, 0])
    expect(visual.position).toEqual([-1, -0.8, 1.5])
  })
})

describe('dynamic raycast wheel visual helpers', () => {
  it('resolves edit-mode rest poses without mutating authored wheel transforms', () => {
    const world = new World()
    const vehicleId = world.createEntity('Car')
    world.addComponent(vehicleId, TransformComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(
      vehicleId,
      PhysicsControllerComponent,
      DynamicRaycastControllerSchema.parse({
        type: 'dynamic-raycast',
        enabled: true,
        driveProfile: 'threejs-rapier',
      }),
    )

    const wheelId = world.createEntity('frontLeft')
    world.setParent(wheelId, vehicleId)
    const authoredTransform = {
      position: [8, 7, 6] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      scale: [2, 2, 2] as [number, number, number],
    }
    world.addComponent(wheelId, TransformComponent, authoredTransform)
    world.addComponent(wheelId, MeshRendererComponent, MeshRendererSchema.parse({}))

    const resolver = createDynamicRaycastWheelRestPoseResolver(world)
    const presentation = resolver(
      wheelId,
      world.getComponent(wheelId, TransformComponent)!,
    )

    expect(presentation.position).not.toEqual(authoredTransform.position)
    expect(presentation.scale).toEqual(authoredTransform.scale)
    expect(world.getComponent(wheelId, TransformComponent)).toEqual(authoredTransform)

    const unrelatedId = world.createEntity('Unrelated')
    const unrelated = {
      position: [1, 2, 3] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      scale: [1, 1, 1] as [number, number, number],
    }
    expect(resolver(unrelatedId, unrelated)).toBe(unrelated)
  })

  it('stabilizes quaternion hemisphere flips', () => {
    const prev: [number, number, number, number] = [0, 0, 0, 1]
    const flipped: [number, number, number, number] = [0, 0, 0, -1]
    const stabilized = stabilizeQuaternion(prev, flipped)
    expect(stabilized[3]).toBe(1)
    expect(Math.abs(stabilized[0]!)).toBe(0)
  })

  it('unwraps wheel rotation across pi boundary', () => {
    expect(unwrapWheelRotation(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(Math.PI + 0.1, 5)
  })

  it('holds suspension when Rapier returns zero', () => {
    expect(smoothSuspensionSample(0.55, 0, 0.4)).toBe(0.55)
  })
})
