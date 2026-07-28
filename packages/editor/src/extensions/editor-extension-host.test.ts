/**
 * @vitest-environment happy-dom
 */
import { World, createCustomComponentDefinition } from '@haku/core'
import { validateSceneDocument } from '@haku/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { globalCommandBus } from '../commands/command-bus.js'
import { useEditorStore } from '../store/editor-store.js'
import {
  applyGizmoComponentEdit,
  createExampleSpeedGizmoProvider,
  resolveEditorExtension,
} from './editor-extension-host.js'

afterEach(() => {
  globalCommandBus.clear()
  vi.restoreAllMocks()
})

const extendedMover = createCustomComponentDefinition({
  schemaVersion: 1,
  id: '42000000-0000-4000-8000-000000000091',
  name: 'Extended Mover',
  version: 1,
  editorExtension: {
    gizmoProvider: 'speed-radius',
    customWidget: 'speed-slider',
  },
  fields: [{ name: 'speed', type: 'number', default: 1 }],
})

describe('editor extension host', () => {
  it('keeps untrusted extensions visibly unresolved without loading code', async () => {
    const loadBundle = vi.fn(async () => ({ bundleId: 'editor-bundle' }))

    await expect(
      resolveEditorExtension(extendedMover, 'imported-untrusted', loadBundle),
    ).resolves.toEqual({
      status: 'unresolved',
      inert: true,
      message:
        'Editor extension for Extended Mover is unresolved because this project is untrusted.',
    })
    expect(loadBundle).not.toHaveBeenCalled()
  })

  it('returns only JSON-safe gizmo primitives and applies edits through undo history', () => {
    const world = new World()
    const entity = world.createEntity('Runner')
    world.addComponent(entity, extendedMover, { speed: 2 })
    useEditorStore.getState().setScene(
      'public/assets/scenes/main.scene.json',
      validateSceneDocument({
        schemaVersion: 1,
        metadata: { name: 'Main' },
        entities: [],
      }),
      world,
    )
    const provider = createExampleSpeedGizmoProvider()
    const primitives = provider.draw({
      entityId: entity.value,
      componentType: extendedMover.id,
      data: { speed: 2 },
    })

    expect(JSON.parse(JSON.stringify(primitives))).toEqual(primitives)
    expect(primitives).toEqual([
      {
        kind: 'sphere',
        center: [0, 0, 0],
        radius: 2,
        color: '#58a6ff',
      },
    ])

    applyGizmoComponentEdit({
      entityId: entity.value,
      componentType: extendedMover.id,
      patch: { speed: 6 },
    })
    expect(useEditorStore.getState().world!.getComponent(entity, extendedMover)).toEqual({
      speed: 6,
    })

    globalCommandBus.undo()
    expect(useEditorStore.getState().world!.getComponent(entity, extendedMover)).toEqual({
      speed: 2,
    })
  })
})
