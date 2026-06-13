import { describe, expect, it, beforeEach } from 'vitest'
import { MeshRendererComponent, TransformComponent, World } from '@haku/core'
import { CommandBus } from './command-bus.js'
import { SetTransformCommand, globalCommandBus, recordCommand } from './world-commands.js'
import { commitSceneEdit } from './scene-history.js'
import { mutateWorld } from './world-mutations.js'
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

  it('restores only the last transform change', () => {
    const id = useEditorStore.getState().selection!
    const world = useEditorStore.getState().world!
    const before = world.getComponent(id, TransformComponent)!
    const after = {
      position: [3, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      scale: [1, 1, 1] as [number, number, number],
    }

    const bus = new CommandBus()
    bus.execute(new SetTransformCommand(id, before, after))

    expect(useEditorStore.getState().world!.getComponent(id, TransformComponent)!.position).toEqual([3, 0, 0])

    bus.undo()

    expect(useEditorStore.getState().world!.getComponent(id, TransformComponent)!.position).toEqual([0, 0, 0])
    expect(useEditorStore.getState().world).not.toBe(world)
  })

  it('records gizmo drags without re-applying the edit', () => {
    const id = useEditorStore.getState().selection!
    const before = useEditorStore.getState().world!.getComponent(id, TransformComponent)!
    const after = {
      position: [0, 2, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      scale: [1, 1, 1] as [number, number, number],
    }

    useEditorStore.getState().world!.addComponent(id, TransformComponent, after)
    mutateWorld(() => {})
    recordCommand(new SetTransformCommand(id, before, after))

    expect(globalCommandBus.canUndo()).toBe(true)

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
