import { describe, expect, it } from 'vitest'
import { resolveActiveCameraId, listCameraEntityIds } from '../src/scene-camera.js'
import { validateSceneDocument } from '../src/index.js'

describe('scene-camera', () => {
  const baseDoc = validateSceneDocument({
    schemaVersion: 1,
    metadata: { name: 'Cameras' },
    entities: [
      {
        id: 'a0000000-0000-4000-8000-000000000001',
        name: 'A',
        parent: null,
        components: [
          { type: 'Transform', data: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
          { type: 'Camera', data: { fov: 60, near: 0.1, far: 1000 } },
        ],
      },
      {
        id: 'b0000000-0000-4000-8000-000000000002',
        name: 'B',
        parent: null,
        components: [
          { type: 'Transform', data: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
          { type: 'Camera', data: { fov: 45, near: 0.1, far: 500 } },
        ],
      },
    ],
  })

  it('lists camera entity ids', () => {
    expect(listCameraEntityIds(baseDoc)).toEqual([
      'a0000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000002',
    ])
  })

  it('uses metadata.activeCameraId when valid', () => {
    const doc = validateSceneDocument({
      ...baseDoc,
      metadata: { name: 'Cameras', activeCameraId: 'b0000000-0000-4000-8000-000000000002' },
    })
    expect(resolveActiveCameraId(doc)).toBe('b0000000-0000-4000-8000-000000000002')
  })

  it('falls back to first camera when active id missing or invalid', () => {
    expect(resolveActiveCameraId(baseDoc)).toBe('a0000000-0000-4000-8000-000000000001')
    const doc = validateSceneDocument({
      ...baseDoc,
      metadata: { name: 'Cameras', activeCameraId: 'missing' },
    })
    expect(resolveActiveCameraId(doc)).toBe('a0000000-0000-4000-8000-000000000001')
  })
})
