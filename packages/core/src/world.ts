import type { ComponentType, EntityId, IWorld } from './types.js'
import { entityId } from './types.js'

interface GameObject {
  name: string
  parent: EntityId | null
  children: EntityId[]
  components: Map<string, unknown>
}

export class World implements IWorld {
  private readonly entities = new Map<string, GameObject>()

  createEntity(name = 'Entity', id?: EntityId): EntityId {
    const entityIdValue = id ?? entityId(crypto.randomUUID())
    if (this.entities.has(entityIdValue.value)) {
      throw new Error(`Entity already exists: ${entityIdValue.value}`)
    }
    this.entities.set(entityIdValue.value, {
      name,
      parent: null,
      children: [],
      components: new Map(),
    })
    return entityIdValue
  }

  destroyEntity(id: EntityId): void {
    const obj = this.entities.get(id.value)
    if (!obj) return

    for (const child of [...obj.children]) {
      this.setParent(child, null)
    }

    if (obj.parent) {
      const parentObj = this.entities.get(obj.parent.value)
      if (parentObj) {
        parentObj.children = parentObj.children.filter((c) => c.value !== id.value)
      }
    }

    this.entities.delete(id.value)
  }

  hasEntity(id: EntityId): boolean {
    return this.entities.has(id.value)
  }

  getEntityName(id: EntityId): string | undefined {
    return this.entities.get(id.value)?.name
  }

  setEntityName(id: EntityId, name: string): void {
    const obj = this.entities.get(id.value)
    if (!obj) throw new Error(`Entity not found: ${id.value}`)
    obj.name = name
  }

  getAllEntities(): readonly EntityId[] {
    return [...this.entities.keys()].map(entityId)
  }

  addComponent<T>(id: EntityId, type: ComponentType<T>, data: T): void {
    const obj = this.entities.get(id.value)
    if (!obj) throw new Error(`Entity not found: ${id.value}`)
    obj.components.set(type.id, structuredClone(data))
  }

  removeComponent(id: EntityId, type: ComponentType): void {
    const obj = this.entities.get(id.value)
    if (!obj) return
    obj.components.delete(type.id)
  }

  getComponent<T>(id: EntityId, type: ComponentType<T>): T | undefined {
    const obj = this.entities.get(id.value)
    if (!obj) return undefined
    const data = obj.components.get(type.id)
    return data !== undefined ? (structuredClone(data) as T) : undefined
  }

  hasComponent(id: EntityId, type: ComponentType): boolean {
    return this.entities.get(id.value)?.components.has(type.id) ?? false
  }

  getComponentTypes(id: EntityId): readonly string[] {
    const obj = this.entities.get(id.value)
    if (!obj) return []
    return [...obj.components.keys()]
  }

  setParent(child: EntityId, parent: EntityId | null): void {
    const childObj = this.entities.get(child.value)
    if (!childObj) throw new Error(`Entity not found: ${child.value}`)

    if (parent && !this.entities.has(parent.value)) {
      throw new Error(`Parent entity not found: ${parent.value}`)
    }

    if (parent && this.isDescendant(parent, child)) {
      throw new Error('Cannot set parent: would create cycle')
    }

    if (childObj.parent) {
      const oldParent = this.entities.get(childObj.parent.value)
      if (oldParent) {
        oldParent.children = oldParent.children.filter((c) => c.value !== child.value)
      }
    }

    childObj.parent = parent

    if (parent) {
      const parentObj = this.entities.get(parent.value)!
      if (!parentObj.children.some((c) => c.value === child.value)) {
        parentObj.children.push(child)
      }
    }
  }

  getParent(id: EntityId): EntityId | null {
    return this.entities.get(id.value)?.parent ?? null
  }

  getChildren(id: EntityId): readonly EntityId[] {
    return this.entities.get(id.value)?.children ?? []
  }

  *query(...types: ComponentType[]): Iterable<EntityId> {
    for (const [idStr, obj] of this.entities) {
      if (types.every((t) => obj.components.has(t.id))) {
        yield entityId(idStr)
      }
    }
  }

  private isDescendant(candidate: EntityId, ancestor: EntityId): boolean {
    let current: EntityId | null = candidate
    while (current) {
      if (current.value === ancestor.value) return true
      current = this.getParent(current)
    }
    return false
  }
}

import { getCoreComponent } from './components.js'

export function cloneWorld(source: World): World {
  const clone = new World()
  for (const id of source.getAllEntities()) {
    const name = source.getEntityName(id) ?? 'Entity'
    clone.createEntity(name, id)
    for (const typeId of source.getComponentTypes(id)) {
      const type = getCoreComponent(typeId)
      if (!type) continue
      const data = source.getComponent(id, type)
      if (data !== undefined) clone.addComponent(id, type, data)
    }
  }
  for (const id of source.getAllEntities()) {
    clone.setParent(id, source.getParent(id))
  }
  return clone
}
