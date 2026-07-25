import { World } from '@haku/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { globalCommandBus } from './command-bus.js'
import { createEmptyEntity, createMeshPrimitive } from './world-commands.js'
import { useEditorStore } from '../store/editor-store.js'

describe('entity creation visibility', () => {
  beforeEach(() => {
    globalCommandBus.clear()
    useEditorStore.setState({
      world: new World(),
      sceneDocument: null,
      scenePath: 'public/assets/scenes/main.scene.json',
      selection: [],
      hierarchyFilterQuery: 'does-not-match',
    })
  })

  it.each([
    ['empty entity', () => createEmptyEntity()],
    ['mesh primitive', () => createMeshPrimitive('BoxGeometry')],
  ])('reveals a newly created %s by clearing the hierarchy query', (_label, create) => {
    create()

    const state = useEditorStore.getState()
    expect(state.hierarchyFilterQuery).toBe('')
    expect(state.selection).toHaveLength(1)
    expect(state.world?.hasEntity(state.selection[0]!)).toBe(true)
  })
})
