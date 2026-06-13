import { describe, expect, it, beforeEach } from 'vitest'
import { MeshRendererComponent, TransformComponent, World } from '@haku/core'
import { commitSceneEdit, commitTransformChange } from './scene-history.js'
import { globalCommandBus } from './world-commands.js'
import { useEditorStore } from '../store/editor-store.js'

describe('scene history', () => {
  beforeEach(() => {
    globalCommandBus.clear()

    const world = new World()
    const id = world.createEntity('Box')
    world.addComponent(id, TransformComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    useEditorStore.setState({
      world,
      sceneDocument: null,
      scenePath: null,
      selection: id,
      worldRevision: 0,
      commandRevision: 0,
    })
  })

  it('undoes transform edits one step at a time', () => {
    const id = useEditorStore.getState().selection!
    const initial = useEditorStore.getState().world!.getComponent(id, TransformComponent)!
    const stepOne = {
      position: [1, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      scale: [1, 1, 1] as [number, number, number],
    }
    const stepTwo = {
      position: [2, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      scale: [1, 1, 1] as [number, number, number],
    }

    useEditorStore.getState().world!.addComponent(id, TransformComponent, stepOne)
    commitTransformChange(id, initial, stepOne)

    useEditorStore.getState().world!.addComponent(id, TransformComponent, stepTwo)
    commitTransformChange(id, stepOne, stepTwo)

    expect(useEditorStore.getState().world!.getComponent(id, TransformComponent)!.position).toEqual([2, 0, 0])

    globalCommandBus.undo()
    expect(useEditorStore.getState().world!.getComponent(id, TransformComponent)!.position).toEqual([1, 0, 0])

    globalCommandBus.undo()
    expect(useEditorStore.getState().world!.getComponent(id, TransformComponent)!.position).toEqual([0, 0, 0])
  })

  it('undoes inspector component edits as scene snapshots', () => {
    const id = useEditorStore.getState().selection!

    commitSceneEdit((draft) => {
      draft.world.addComponent(id, MeshRendererComponent, {
        geometryType: 'BoxGeometry',
        geometryParams: { width: 1, height: 1, depth: 1 },
        material: {
          color: '#ff0000',
          metalness: 0,
          roughness: 0.5,
          wireframe: false,
          opacity: 1,
          transparent: false,
        },
      })
    })

    expect(useEditorStore.getState().world!.hasComponent(id, MeshRendererComponent)).toBe(true)

    globalCommandBus.undo()

    expect(useEditorStore.getState().world!.hasComponent(id, MeshRendererComponent)).toBe(false)
  })
})
