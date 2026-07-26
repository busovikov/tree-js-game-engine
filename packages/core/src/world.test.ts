import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  TransformComponent,
  World,
  cloneWorld,
  entityId,
  type ComponentLifecycleContext,
  type ComponentDefinition,
} from '../src/index.js'

const CameraComponent = {
  id: '40000000-0000-4000-8000-000000000002',
  name: 'TestCamera',
  schema: z.object({ fov: z.number(), near: z.number(), far: z.number() }),
}

describe('@haku/core World', () => {
  it('creates entity with Transform + Camera and query works', () => {
    const world = new World()
    const id = world.createEntity('MainCamera')

    world.addComponent(id, TransformComponent, {
      position: [0, 2, 5],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(id, CameraComponent, { fov: 60, near: 0.1, far: 1000 })

    expect(world.hasEntity(id)).toBe(true)
    expect(world.getComponent(id, TransformComponent)?.position).toEqual([0, 2, 5])

    const results = [...world.query(TransformComponent, CameraComponent)]
    expect(results).toHaveLength(1)
    expect(results[0].value).toBe(id.value)
  })

  it('supports hierarchy', () => {
    const world = new World()
    const parent = world.createEntity('Parent')
    const child = world.createEntity('Child')
    world.setParent(child, parent)
    expect(world.getParent(child)?.value).toBe(parent.value)
    expect(world.getChildren(parent)).toHaveLength(1)
  })

  it('reorders siblings and roots', () => {
    const world = new World()
    const a = world.createEntity('A')
    const b = world.createEntity('B')
    const c = world.createEntity('C')
    world.setParent(c, a)

    world.moveEntityInHierarchy(c, b, 'before')
    expect(world.getParent(c)).toBeNull()
    expect(world.getRootEntities().map((id) => id.value)).toEqual([a.value, c.value, b.value])

    world.moveEntityInHierarchy(c, a, 'child')
    expect(world.getParent(c)?.value).toBe(a.value)
    expect(world.getChildren(a).map((id) => id.value)).toEqual([c.value])
  })

  it('accepts explicit entity id', () => {
    const world = new World()
    const id = entityId('a0000000-0000-4000-8000-000000000001')
    world.createEntity('Named', id)
    expect(world.hasEntity(id)).toBe(true)
  })

  it('derives inactive hierarchy state for a subtree without mutating child activeSelf', () => {
    const world = new World()
    const parent = world.createEntity('Parent')
    const child = world.createEntity('Child')
    const grandchild = world.createEntity('Grandchild')
    world.setParent(child, parent)
    world.setParent(grandchild, child)

    world.setActiveSelf(parent, false)

    expect(world.getActiveSelf(parent)).toBe(false)
    expect(world.getActiveSelf(child)).toBe(true)
    expect(world.getActiveSelf(grandchild)).toBe(true)
    expect(world.isActiveInHierarchy(parent)).toBe(false)
    expect(world.isActiveInHierarchy(child)).toBe(false)
    expect(world.isActiveInHierarchy(grandchild)).toBe(false)
  })

  it('updates derived activity when an authored-active subtree is reparented', () => {
    const world = new World()
    const inactiveParent = world.createEntity('Inactive parent')
    const activeParent = world.createEntity('Active parent')
    const child = world.createEntity('Child')
    const grandchild = world.createEntity('Grandchild')
    world.setActiveSelf(inactiveParent, false)
    world.setParent(child, inactiveParent)
    world.setParent(grandchild, child)

    expect(world.isActiveInHierarchy(child)).toBe(false)
    expect(world.isActiveInHierarchy(grandchild)).toBe(false)

    world.setParent(child, activeParent)

    expect(world.getActiveSelf(child)).toBe(true)
    expect(world.getActiveSelf(grandchild)).toBe(true)
    expect(world.isActiveInHierarchy(child)).toBe(true)
    expect(world.isActiveInHierarchy(grandchild)).toBe(true)
  })

  it('excludes inactive entities from normal queries with an explicit diagnostic opt-in', () => {
    const world = new World()
    const active = world.createEntity('Active')
    const inactive = world.createEntity('Inactive')
    world.addComponent(active, TransformComponent, TransformComponent.defaults())
    world.addComponent(inactive, TransformComponent, TransformComponent.defaults())
    world.setActiveSelf(inactive, false)

    expect([...world.query(TransformComponent)].map((id) => id.value)).toEqual([active.value])
    expect([...world.queryIncludingInactive(TransformComponent)].map((id) => id.value)).toEqual([
      active.value,
      inactive.value,
    ])
  })

  it('handles empty activity changes and rejects a missing parent without changing activity', () => {
    const world = new World()
    const child = world.createEntity('Child')
    const missingParent = entityId('a0000000-0000-4000-8000-000000000099')

    expect([...world.query()]).toEqual([child])
    expect(() => world.setParent(child, missingParent)).toThrow(
      `Parent entity not found: ${missingParent.value}`,
    )
    expect(world.getParent(child)).toBeNull()
    expect(world.isActiveInHierarchy(child)).toBe(true)

    world.destroyEntity(child)
    expect([...world.query()]).toEqual([])
  })

  it('runs component lifecycle hooks in deterministic hierarchy and component ID order', () => {
    const events: string[] = []
    const lifecycleComponent = (
      id: string,
      label: string,
    ): ComponentDefinition<{ label: string }> => ({
      id,
      name: label,
      schema: z.object({ label: z.string() }),
      lifecycle: {
        create: ({ entity }: ComponentLifecycleContext<{ label: string }>) => {
          events.push(`create:${entity.value}:${label}`)
        },
        activate: ({ entity }) => {
          events.push(`activate:${entity.value}:${label}`)
        },
        deactivate: ({ entity }) => {
          events.push(`deactivate:${entity.value}:${label}`)
        },
        destroy: ({ entity }) => {
          events.push(`destroy:${entity.value}:${label}`)
        },
      },
    })
    const first = lifecycleComponent('10000000-0000-4000-8000-000000000001', 'first')
    const second = lifecycleComponent('20000000-0000-4000-8000-000000000001', 'second')
    const world = new World()
    const parent = world.createEntity('Parent', entityId('a0000000-0000-4000-8000-000000000001'))
    const child = world.createEntity('Child', entityId('a0000000-0000-4000-8000-000000000002'))
    world.setParent(child, parent)
    world.addComponent(parent, second, { label: 'parent-second' })
    world.addComponent(parent, first, { label: 'parent-first' })
    world.addComponent(child, second, { label: 'child-second' })
    world.addComponent(child, first, { label: 'child-first' })
    events.length = 0

    world.setActiveSelf(parent, false)
    expect(events).toEqual([
      `deactivate:${child.value}:first`,
      `deactivate:${child.value}:second`,
      `deactivate:${parent.value}:first`,
      `deactivate:${parent.value}:second`,
    ])

    events.length = 0
    world.setActiveSelf(parent, true)
    expect(events).toEqual([
      `activate:${parent.value}:first`,
      `activate:${parent.value}:second`,
      `activate:${child.value}:first`,
      `activate:${child.value}:second`,
    ])

    events.length = 0
    world.removeComponent(parent, first)
    expect(events).toEqual([
      `deactivate:${parent.value}:first`,
      `destroy:${parent.value}:first`,
    ])
  })

  it('clones authored and derived activity without transient child activation', () => {
    const events: string[] = []
    const component: ComponentDefinition<{ value: number }> = {
      id: '30000000-0000-4000-8000-000000000001',
      name: 'CloneLifecycle',
      schema: z.object({ value: z.number() }),
      lifecycle: {
        activate: ({ entity }) => events.push(`activate:${entity.value}`),
      },
    }
    const world = new World()
    const parent = world.createEntity('Parent')
    const child = world.createEntity('Child')
    world.setParent(child, parent)
    world.setActiveSelf(parent, false)
    world.addComponent(child, component, { value: 1 })

    const clone = cloneWorld(world)

    expect(clone.getActiveSelf(child)).toBe(true)
    expect(clone.isActiveInHierarchy(child)).toBe(false)
    expect(events).toEqual([])
  })
})
