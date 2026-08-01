import { World, entityId } from '@haku/core'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  HeadlessPresentationEffectsBackend,
  type PresentationBurstRequest,
  PresentationEffectsService,
  ThreePresentationEffectsBackend,
} from './presentation-effects.js'

const OPTIONS = {
  burstCapacity: 2,
  burstQueueCapacity: 2,
  trailCapacity: 4,
  trailSampleInterval: 0.05,
  trailLifetime: 0.5,
} as const

describe('presentation effects runtime', () => {
  it('uses fixed burst/trail storage and clears lease-owned effects without advancing on pause', () => {
    const backend = new HeadlessPresentationEffectsBackend(OPTIONS)
    const service = new PresentationEffectsService(backend)
    const world = new World()
    const owner = entityId('b1a00000-0000-4000-8000-000000000010')
    const burst: PresentationBurstRequest = {
      kind: 'landing',
      shape: 'ring',
      position: [0, 1, 2],
      color: '#ffffff',
      duration: 0.25,
      size: 1,
      owner,
    }

    service.emit(burst)
    service.emit(burst)
    service.emit(burst)
    service.sampleTrail([0, 0, 0])
    service.update(world, 0.01)
    expect(service.metrics()).toMatchObject({
      activeBursts: 2,
      queuedBursts: 0,
      trailPoints: 1,
      ownedHandles: 2,
      droppedBursts: 1,
      emitted: { landing: 2 },
    })

    service.update(world, 0)
    expect(service.metrics()).toMatchObject({ activeBursts: 2, trailPoints: 1 })
    service.clearOwner(owner)
    expect(service.metrics()).toMatchObject({ activeBursts: 0, ownedHandles: 0 })

    service.sampleTrail([1, 0, 0])
    service.update(world, 0.1)
    expect(service.metrics().trailPoints).toBe(3)
    service.reset()
    expect(service.metrics()).toMatchObject({ activeBursts: 0, trailPoints: 0 })
  })

  it('owns and disposes the Three objects and shared GPU resources exactly once', () => {
    const scene = new THREE.Scene()
    const backend = new ThreePresentationEffectsBackend(scene, {
      ...OPTIONS,
      trailColor: '#79ecff',
      trailPointSize: 0.16,
    })
    expect(scene.children).toHaveLength(1)
    expect(backend.metrics().renderObjects).toBe(3)

    backend.emit({
      kind: 'bonus',
      shape: 'spark',
      position: [1, 2, 3],
      color: '#ffd84d',
      duration: 0.5,
      size: 0.8,
    })
    backend.update(1 / 60)
    expect(backend.metrics()).toMatchObject({ activeBursts: 1, renderObjects: 3 })

    backend.dispose()
    backend.dispose()
    expect(scene.children).toHaveLength(0)
    expect(backend.metrics()).toMatchObject({
      activeBursts: 0,
      trailPoints: 0,
      renderObjects: 0,
      disposed: true,
    })
  })

  it('rejects invalid capacities before allocating presentation objects', () => {
    expect(
      () => new HeadlessPresentationEffectsBackend({ ...OPTIONS, trailCapacity: 0 }),
    ).toThrow(/trail capacity/i)
    expect(
      () => new HeadlessPresentationEffectsBackend({ ...OPTIONS, trailLifetime: Number.NaN }),
    ).toThrow(/trail lifetime/i)
  })
})
