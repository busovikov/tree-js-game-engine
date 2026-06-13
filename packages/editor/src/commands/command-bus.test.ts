import { describe, expect, it, beforeEach } from 'vitest'
import { TransformComponent, World } from '@haku/core'
import { CommandBus } from './command-bus.js'
import { SetTransformCommand } from './world-commands.js'
import { useEditorStore } from '../store/editor-store.js'

describe('CommandBus undo', () => {
  beforeEach(() => {
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
})
