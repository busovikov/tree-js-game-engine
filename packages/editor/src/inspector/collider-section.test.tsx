/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { ColliderComponent, RigidBodyComponent, TransformComponent, World } from '@haku/core'
import { ColliderSchema, defaultPhysicsProjectSettings, type BoxCollider } from '@haku/schema'
import { commitSceneEdit } from '../commands/scene-history.js'
import { globalCommandBus } from '../commands/world-commands.js'
import { useEditorStore } from '../store/editor-store.js'
import { ColliderFields, normalizeCollider } from '../components/ColliderFields.js'

function setupEntity(name = 'Ramp') {
  globalCommandBus.clear()
  const world = new World()
  const id = world.createEntity(name)
  world.addComponent(id, TransformComponent, {
    position: [0, 3, -25],
    rotation: [-0.18, 0, 0, 0.984],
    scale: [1, 1, 1],
  })
  useEditorStore.setState({
    world,
    sceneDocument: null,
    scenePath: null,
    selection: [id],
    worldRevision: 0,
    commandRevision: 0,
    mode: 'edit',
  })
  return id
}

describe('Collider inspector via commitSceneEdit', () => {
  beforeEach(() => {
    setupEntity()
  })

  it('adds default box collider component', () => {
    const id = useEditorStore.getState().selection[0]!

    commitSceneEdit((draft) => {
      draft.world.addComponent(id, ColliderComponent, ColliderComponent.defaults?.() ?? { shape: 'box' })
    })

    const collider = useEditorStore.getState().world!.getComponent(id, ColliderComponent)
    expect(collider?.shape).toBe('box')
    if (collider?.shape === 'box') {
      expect(collider.halfExtents).toEqual([0.5, 0.5, 0.5])
    }
    expect(collider?.enabled).toBe(true)
  })

  it('updates halfExtents and trigger flag', () => {
    const id = useEditorStore.getState().selection[0]!
    const initial = ColliderSchema.parse({
      shape: 'box',
      halfExtents: [12, 0.5, 8],
    }) as BoxCollider

    commitSceneEdit((draft) => {
      draft.world.addComponent(id, ColliderComponent, initial)
    })

    commitSceneEdit((draft) => {
      draft.world.addComponent(id, ColliderComponent, {
        ...initial,
        halfExtents: [14, 0.75, 9],
        isTrigger: true,
      })
    })

    const collider = useEditorStore.getState().world!.getComponent(id, ColliderComponent)
    if (collider?.shape === 'box') {
      expect(collider.halfExtents).toEqual([14, 0.75, 9])
    }
    expect(collider?.isTrigger).toBe(true)
  })

  it('switches shape to sphere via commitSceneEdit', () => {
    const id = useEditorStore.getState().selection[0]!
    commitSceneEdit((draft) => {
      draft.world.addComponent(id, ColliderComponent, ColliderSchema.parse({ shape: 'box' }))
    })

    commitSceneEdit((draft) => {
      const current = draft.world.getComponent(id, ColliderComponent)!
      draft.world.addComponent(
        id,
        ColliderComponent,
        ColliderSchema.parse({
          shape: 'sphere',
          offset: current.offset,
          rotation: current.rotation,
          enabled: current.enabled,
          layer: current.layer,
          isTrigger: current.isTrigger,
        }),
      )
    })

    expect(useEditorStore.getState().world!.getComponent(id, ColliderComponent)?.shape).toBe('sphere')
  })
})

describe('ColliderFields UI', () => {
  afterEach(() => {
    cleanup()
  })

  it('shape picker and trigger toggle call onChange with parsed collider', () => {
    const changes: unknown[] = []
    const value = normalizeCollider({
      shape: 'box',
      halfExtents: [12, 0.5, 8],
    })

    render(
      <ColliderFields
        value={value}
        onChange={(next) => {
          changes.push(next)
        }}
      />,
    )

    fireEvent.change(screen.getByDisplayValue('box'), { target: { value: 'sphere' } })
    expect(changes).toHaveLength(1)
    expect((changes[0] as { shape: string }).shape).toBe('sphere')

    fireEvent.click(screen.getByLabelText('Collider trigger'))
    expect(changes).toHaveLength(2)
    expect((changes[1] as { isTrigger: boolean }).isTrigger).toBe(true)
  })

  it('size fields update box halfExtents', () => {
    const changes: unknown[] = []
    render(
      <ColliderFields
        value={normalizeCollider({ shape: 'box', halfExtents: [1, 1, 1] })}
        onChange={(next) => {
          changes.push(next)
        }}
      />,
    )

    const halfExtentField = screen.getByLabelText('halfExtents[0]')
    fireEvent.change(halfExtentField, { target: { value: '12' } })
    fireEvent.blur(halfExtentField)

    expect(changes.length).toBeGreaterThan(0)
    const last = changes[changes.length - 1] as { halfExtents: number[] }
    expect(last.halfExtents[0]).toBe(12)
  })

  it('material picker lists project physics materials', () => {
    render(
      <ColliderFields
        value={normalizeCollider({ shape: 'box' })}
        physicsSettings={defaultPhysicsProjectSettings()}
      />,
    )

    expect(screen.getByText('Material')).toBeTruthy()
    expect(screen.getByDisplayValue('default')).toBeTruthy()
  })
})
