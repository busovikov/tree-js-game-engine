/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { ColliderComponent, TransformComponent, PhysicsControllerComponent, World } from '@haku/core'
import { commitSceneEdit } from '../commands/scene-history.js'
import { globalCommandBus } from '../commands/world-commands.js'
import { useEditorStore } from '../store/editor-store.js'
import { InspectorComponentSection } from '../components/InspectorComponentSection.js'
import { VehicleFields, normalizeVehicle } from '../components/VehicleFields.js'

function setupEntity(name = 'Vehicle') {
  globalCommandBus.clear()
  const world = new World()
  const id = world.createEntity(name)
  world.addComponent(id, TransformComponent, {
    position: [0, 2.77, 5],
    rotation: [0, 0, 0, 1],
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

describe('Vehicle inspector via commitSceneEdit', () => {
  beforeEach(() => {
    setupEntity()
  })

  it('adds default vehicle component', () => {
    const id = useEditorStore.getState().selection[0]!

    commitSceneEdit((draft) => {
      draft.world.addComponent(id, PhysicsControllerComponent, PhysicsControllerComponent.defaults?.() ?? {})
    })

    const vehicle = useEditorStore.getState().world!.getComponent(id, PhysicsControllerComponent)
    expect(vehicle?.chassis.mass).toBe(250)
    expect(vehicle?.wheels.radius).toBe(0.42)
    expect(vehicle?.enabled).toBe(true)
  })

  it('removes vehicle component', () => {
    const id = useEditorStore.getState().selection[0]!
    commitSceneEdit((draft) => {
      draft.world.addComponent(id, PhysicsControllerComponent, PhysicsControllerComponent.defaults?.() ?? {})
    })

    commitSceneEdit((draft) => {
      draft.world.removeComponent(id, PhysicsControllerComponent)
    })

    expect(useEditorStore.getState().world!.hasComponent(id, PhysicsControllerComponent)).toBe(false)
  })

  it('removes collider component', () => {
    const id = useEditorStore.getState().selection[0]!
    commitSceneEdit((draft) => {
      draft.world.addComponent(id, ColliderComponent, ColliderComponent.defaults?.() ?? { shape: 'box' })
    })

    commitSceneEdit((draft) => {
      draft.world.removeComponent(id, ColliderComponent)
    })

    expect(useEditorStore.getState().world!.hasComponent(id, ColliderComponent)).toBe(false)
  })
})

describe('VehicleFields UI', () => {
  afterEach(() => {
    cleanup()
  })

  it('updates chassis mass and lift', () => {
    const changes: unknown[] = []
    const value = normalizeVehicle({})

    render(
      <VehicleFields
        value={value}
        onChange={(next) => {
          changes.push(next)
        }}
      />,
    )

    const massField = screen.getByLabelText('mass')
    fireEvent.change(massField, { target: { value: '300' } })
    fireEvent.blur(massField)

    expect(changes.length).toBeGreaterThan(0)
    const last = changes[changes.length - 1] as { chassis: { mass: number } }
    expect(last.chassis.mass).toBe(300)
  })
})

describe('InspectorComponentSection delete button', () => {
  afterEach(() => {
    cleanup()
  })

  it('calls onDelete when delete button is clicked', () => {
    let deleted = false
    render(
      <InspectorComponentSection
        title="Collider"
        collapsed={false}
        onToggleCollapsed={() => {}}
        onDelete={() => {
          deleted = true
        }}
      >
        <div>fields</div>
      </InspectorComponentSection>,
    )

    fireEvent.click(screen.getByLabelText('Delete component'))
    expect(deleted).toBe(true)
  })
})
