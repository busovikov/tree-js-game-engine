/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { World, createCustomComponentDefinition } from '@haku/core'
import { validateSceneDocument } from '@haku/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { globalCommandBus } from '../commands/command-bus.js'
import { projectService } from '../services/project-service.js'
import { useEditorStore } from '../store/editor-store.js'
import { InspectorPanel } from './InspectorPanel.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  globalCommandBus.clear()
})

describe('InspectorPanel project components', () => {
  it('adds, renders, edits, and undoes a declarative custom component', () => {
    const mover = createCustomComponentDefinition({
      schemaVersion: 1,
      id: '42000000-0000-4000-8000-000000000072',
      name: 'Mover',
      version: 1,
      fields: [
        {
          name: 'speed',
          type: 'number',
          default: 4,
          inspector: { label: 'Move Speed', min: 0, max: 10 },
        },
      ],
    })
    vi.spyOn(projectService, 'getCustomComponentTypes').mockReturnValue([
      mover,
    ])
    const world = new World()
    const entity = world.createEntity('Runner')
    useEditorStore.getState().setScene(
      'public/assets/scenes/main.scene.json',
      validateSceneDocument({
        schemaVersion: 1,
        metadata: { name: 'Main' },
        entities: [],
      }),
      world,
    )
    useEditorStore.getState().setSelection([entity])
    render(<InspectorPanel />)

    fireEvent.click(screen.getByLabelText('Add Component'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mover' }))

    expect(
      useEditorStore.getState().world!.getComponent(entity, mover),
    ).toEqual({ speed: 4 })
    expect(screen.getByText('Mover')).toBeTruthy()
    expect(screen.getByLabelText('Move Speed')).toBeTruthy()

    globalCommandBus.undo()

    expect(
      useEditorStore.getState().world!.hasComponent(entity, mover),
    ).toBe(false)
  })
})
