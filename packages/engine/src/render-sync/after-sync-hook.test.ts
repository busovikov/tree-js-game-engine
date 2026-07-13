import { TransformComponent, World } from '@haku/core'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { RenderSyncSystem } from './render-sync-system.js'

describe('RenderSyncSystem after-sync hook', () => {
  function makeWorld(): World {
    const world = new World()
    const id = world.createEntity('Node')
    world.addComponent(id, TransformComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    return world
  }

  it('runs the hook after every full sync (attach + update)', () => {
    const world = makeWorld()
    const sync = new RenderSyncSystem(new THREE.Scene())
    let calls = 0
    sync.setAfterSyncHook(() => {
      calls += 1
    })

    sync.attach(world)
    expect(calls).toBe(1)

    sync.update(world)
    sync.update(world)
    expect(calls).toBe(3)
  })

  it('stops invoking the hook once cleared', () => {
    const world = makeWorld()
    const sync = new RenderSyncSystem(new THREE.Scene())
    let calls = 0
    sync.setAfterSyncHook(() => {
      calls += 1
    })

    sync.attach(world)
    sync.setAfterSyncHook(null)
    sync.update(world)

    expect(calls).toBe(1)
  })
})
