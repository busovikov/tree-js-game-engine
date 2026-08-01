import {
  entityId,
  type ComponentDefinition,
  type ComponentRegistry,
  type EntityId,
  type IWorld,
} from '@haku/core'
import type { PrefabDefinition } from '@haku/schema'

/** Runtime prefab resolver used by the public EntityPool composition seam. */
export function instantiatePrefabDefinition(options: {
  readonly world: IWorld
  readonly registry: ComponentRegistry
  readonly definition: PrefabDefinition
}): EntityId {
  const roots = options.definition.entities.filter((record) => record.parent === null)
  if (roots.length !== 1) {
    throw new Error('Prefab must contain exactly one root entity')
  }

  const ids = new Map(
    options.definition.entities.map((record) => [record.id, entityId(crypto.randomUUID())]),
  )
  for (const record of options.definition.entities) {
    options.world.createEntity(record.name, ids.get(record.id), record.activeSelf)
  }
  for (const record of options.definition.entities) {
    const id = ids.get(record.id)!
    const parent = record.parent === null ? null : ids.get(record.parent)
    if (record.parent !== null && !parent) {
      throw new Error(`Prefab entity ${record.id} has unknown parent ${record.parent}`)
    }
    options.world.setParent(id, parent ?? null)
    for (const component of record.components) {
      const definition = options.registry.require(component.type) as ComponentDefinition<unknown>
      options.world.addComponent(id, definition, definition.schema.parse(component.data))
    }
  }
  return ids.get(roots[0]!.id)!
}
