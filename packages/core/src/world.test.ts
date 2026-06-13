import { describe, expect, it } from 'vitest'
import {
  CameraComponent,
  TransformComponent,
  World,
  entityId,
} from '../src/index.js'

describe('@haku/core World', () => {
  it('creates entity with Transform + Camera and query works', () => {
    const world = new World()
    const id = world.createEntity('MainCamera')

    world.addComponent(id, TransformComponent, {
      position: [0, 2, 5],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(id, CameraComponent, { fov: 60, near: 0.1, far: 1000 })

    expect(world.hasEntity(id)).toBe(true)
    expect(world.getComponent(id, TransformComponent)?.position).toEqual([0, 2, 5])

    const results = [...world.query(TransformComponent, CameraComponent)]
    expect(results).toHaveLength(1)
    expect(results[0].value).toBe(id.value)
  })

  it('supports hierarchy', () => {
    const world = new World()
    const parent = world.createEntity('Parent')
    const child = world.createEntity('Child')
    world.setParent(child, parent)
    expect(world.getParent(child)?.value).toBe(parent.value)
    expect(world.getChildren(parent)).toHaveLength(1)
  })

  it('accepts explicit entity id', () => {
    const world = new World()
    const id = entityId('a0000000-0000-4000-8000-000000000001')
    world.createEntity('Named', id)
    expect(world.hasEntity(id)).toBe(true)
  })
})
