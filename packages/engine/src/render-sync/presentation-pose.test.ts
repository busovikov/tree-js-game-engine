import { TransformComponent, World } from '@haku/core'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { RenderSyncSystem } from './render-sync-system.js'

describe('RenderSyncSystem presentation poses', () => {
  it('applies an engine-owned presentation resolver without mutating Transform', () => {
    const world = new World()
    const id = world.createEntity('Interpolated')
    world.addComponent(id, TransformComponent, {
      position: [10, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [2, 2, 2],
    })
    const sync = new RenderSyncSystem(new THREE.Scene())
    sync.setPresentationTransformResolver((_id, source) => ({
      ...source,
      position: [2.5, 0, 0],
    }))

    sync.attach(world)

    expect(sync.getObject3D(id)?.position.toArray()).toEqual([2.5, 0, 0])
    expect(world.getComponent(id, TransformComponent)?.position).toEqual([10, 0, 0])
  })

  it('falls back to authoritative transforms when no resolver is installed', () => {
    const world = new World()
    const id = world.createEntity('Authoritative')
    world.addComponent(id, TransformComponent, {
      position: [4, 5, 6],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    const sync = new RenderSyncSystem(new THREE.Scene())

    sync.attach(world)

    expect(sync.getObject3D(id)?.position.toArray()).toEqual([4, 5, 6])
  })

  it('replaces edit presentation with physics presentation and restores authoritative fallback', () => {
    const world = new World()
    const id = world.createEntity('Lifecycle')
    world.addComponent(id, TransformComponent, {
      position: [10, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    const sync = new RenderSyncSystem(new THREE.Scene())
    sync.attach(world)

    sync.setPresentationTransformResolver((_id, source) => ({
      ...source,
      position: [2, 0, 0],
    }))
    sync.update(world)
    expect(sync.getObject3D(id)?.position.x).toBe(2)

    sync.setPresentationTransformResolver((_id, source) => ({
      ...source,
      position: [6, 0, 0],
    }))
    sync.update(world)
    expect(sync.getObject3D(id)?.position.x).toBe(6)

    sync.setPresentationTransformResolver(null)
    sync.update(world)
    expect(sync.getObject3D(id)?.position.x).toBe(10)
    expect(world.getComponent(id, TransformComponent)?.position).toEqual([10, 0, 0])
  })
})
