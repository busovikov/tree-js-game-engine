import { describe, expect, it, afterEach } from 'vitest'
import { TransformComponent, World } from '@haku/core'
import type { Engine } from '@haku/engine'
import type { PhysicsWorldSystem } from '@haku/engine'
import {
  installPlayModePhysicsAccess,
  teleportEntitiesToAuthoredTransform,
} from './play-mode-physics-access.js'

describe('play-mode-physics-access', () => {
  afterEach(() => {
    installPlayModePhysicsAccess({ getEngine: () => null })()
  })

  it('no-ops when play physics is not installed', () => {
    const world = new World()
    const id = world.createEntity('Box')
    world.addComponent(id, TransformComponent, {
      position: [1, 2, 3],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    expect(() => teleportEntitiesToAuthoredTransform(world, [id])).not.toThrow()
  })

  it('calls resetBodyState for entities with a tracked physics body', () => {
    const world = new World()
    const id = world.createEntity('Box')
    world.addComponent(id, TransformComponent, {
      position: [4, 5, 6],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })

    const resets: Array<{ id: string; position: number[] }> = []
    const physicsSystem = {
      getBodyHandle: (entityId: { value: string }) =>
        entityId.value === id.value ? { value: 'body-1' } : null,
      resetBodyState: (
        entityId: { value: string },
        transform: { position: number[] },
      ) => {
        resets.push({ id: entityId.value, position: [...transform.position] })
      },
    } as unknown as PhysicsWorldSystem

    const engine = {
      getPhysicsWorldSystem: () => physicsSystem,
    } as unknown as Engine

    const uninstall = installPlayModePhysicsAccess({ getEngine: () => engine })
    teleportEntitiesToAuthoredTransform(world, [id])
    uninstall()

    expect(resets).toEqual([{ id: id.value, position: [4, 5, 6] }])
  })
})
