import type { EntityId, World } from '@haku/core'
import { TransformComponent } from '@haku/core'
import type { Transform } from '@haku/schema'

export type EntityPlacement = 'root' | 'child' | 'parent'

export function uniqueEntityName(world: World, base: string): string {
  const names = new Set(world.getAllEntities().map((id) => world.getEntityName(id)))
  if (!names.has(base)) return base
  let i = 2
  while (names.has(`${base} ${i}`)) i++
  return `${base} ${i}`
}

function rootSpawnPosition(world: World): [number, number, number] {
  const roots = world.getRootEntities()
  const index = Math.max(0, roots.length - 1)
  return [index * 1.5, 0, 0]
}

const IDENTITY_TRANSFORM: Transform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
}

export function createEntityWithPlacement(
  world: World,
  name: string,
  placement: EntityPlacement,
  selection: EntityId | null,
): EntityId {
  const defaults = TransformComponent.defaults!()
  const id = world.createEntity(name)

  if (placement === 'parent') {
    if (!selection || !world.hasEntity(selection)) {
      throw new Error('Selection required to create a parent entity')
    }

    const childTransform = world.getComponent(selection, TransformComponent) ?? defaults
    const grandparent = world.getParent(selection)

    world.addComponent(id, TransformComponent, structuredClone(childTransform))
    world.setParent(id, grandparent)
    world.setParent(selection, id)
    world.addComponent(selection, TransformComponent, structuredClone(IDENTITY_TRANSFORM))
    return id
  }

  if (placement === 'child') {
    if (!selection || !world.hasEntity(selection)) {
      throw new Error('Selection required to create a child entity')
    }

    world.addComponent(id, TransformComponent, structuredClone(defaults))
    world.setParent(id, selection)
    return id
  }

  world.addComponent(id, TransformComponent, {
    ...defaults,
    position: rootSpawnPosition(world),
  })
  return id
}
