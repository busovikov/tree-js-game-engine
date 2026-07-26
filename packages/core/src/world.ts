import type {
  ComponentDefinition,
  ComponentLifecycleHooks,
  ComponentTypeReference,
  EntityId,
  IWorld,
} from './types.js'
import { entityId } from './types.js'

interface StoredComponent {
  definition: ComponentDefinition
  data: unknown
}

interface GameObject {
  name: string
  parent: EntityId | null
  children: EntityId[]
  activeSelf: boolean
  activeInHierarchy: boolean
  components: Map<string, StoredComponent>
}

export class World implements IWorld {
  private readonly entities = new Map<string, GameObject>()
  private roots: EntityId[] = []

  createEntity(name = 'Entity', id?: EntityId, activeSelf = true): EntityId {
    const entityIdValue = id ?? entityId(crypto.randomUUID())
    if (this.entities.has(entityIdValue.value)) {
      throw new Error(`Entity already exists: ${entityIdValue.value}`)
    }
    this.entities.set(entityIdValue.value, {
      name,
      parent: null,
      children: [],
      activeSelf,
      activeInHierarchy: activeSelf,
      components: new Map(),
    })
    this.roots.push(entityIdValue)
    return entityIdValue
  }

  destroyEntity(id: EntityId): void {
    const obj = this.entities.get(id.value)
    if (!obj) return

    for (const component of this.sortedComponents(obj)) {
      if (obj.activeInHierarchy) {
        this.callLifecycleHook(id, component, 'deactivate')
      }
      this.callLifecycleHook(id, component, 'destroy')
    }

    for (const child of [...obj.children]) {
      this.setParent(child, null)
    }

    if (obj.parent) {
      const parentObj = this.entities.get(obj.parent.value)
      if (parentObj) {
        parentObj.children = parentObj.children.filter((c) => c.value !== id.value)
      }
    }

    this.roots = this.roots.filter((root) => root.value !== id.value)
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

  getActiveSelf(id: EntityId): boolean {
    return this.entities.get(id.value)?.activeSelf ?? false
  }

  setActiveSelf(id: EntityId, active: boolean): void {
    const obj = this.entities.get(id.value)
    if (!obj) throw new Error(`Entity not found: ${id.value}`)
    if (obj.activeSelf === active) return

    const subtree = this.collectSubtree(id)
    const previousActivity = this.captureActivity(subtree)
    obj.activeSelf = active
    this.refreshSubtreeActivity(id)
    this.emitActivityChanges(subtree, previousActivity)
  }

  isActiveInHierarchy(id: EntityId): boolean {
    return this.entities.get(id.value)?.activeInHierarchy ?? false
  }

  addComponent<T>(id: EntityId, type: ComponentDefinition<T>, data: T): void {
    const obj = this.entities.get(id.value)
    if (!obj) throw new Error(`Entity not found: ${id.value}`)
    const existing = obj.components.get(type.id)
    if (existing) {
      existing.definition = type as unknown as ComponentDefinition
      existing.data = structuredClone(data)
      return
    }

    const component: StoredComponent = {
      definition: type as unknown as ComponentDefinition,
      data: structuredClone(data),
    }
    obj.components.set(type.id, component)
    this.callLifecycleHook(id, component, 'create')
    if (obj.activeInHierarchy) {
      this.callLifecycleHook(id, component, 'activate')
    }
  }

  removeComponent(id: EntityId, type: ComponentTypeReference): void {
    const obj = this.entities.get(id.value)
    if (!obj) return
    const component = obj.components.get(type.id)
    if (!component) return
    if (obj.activeInHierarchy) {
      this.callLifecycleHook(id, component, 'deactivate')
    }
    this.callLifecycleHook(id, component, 'destroy')
    obj.components.delete(type.id)
  }

  getComponent<T>(id: EntityId, type: ComponentDefinition<T>): T | undefined {
    const obj = this.entities.get(id.value)
    if (!obj) return undefined
    const component = obj.components.get(type.id)
    return component !== undefined ? (structuredClone(component.data) as T) : undefined
  }

  hasComponent(id: EntityId, type: ComponentTypeReference): boolean {
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

    const subtree = this.collectSubtree(child)
    const previousActivity = this.captureActivity(subtree)

    if (childObj.parent) {
      const oldParent = this.entities.get(childObj.parent.value)
      if (oldParent) {
        oldParent.children = oldParent.children.filter((c) => c.value !== child.value)
      }
    } else {
      this.roots = this.roots.filter((root) => root.value !== child.value)
    }

    childObj.parent = parent

    if (parent) {
      const parentObj = this.entities.get(parent.value)!
      if (!parentObj.children.some((c) => c.value === child.value)) {
        parentObj.children.push(child)
      }
    } else if (!this.roots.some((root) => root.value === child.value)) {
      this.roots.push(child)
    }

    this.refreshSubtreeActivity(child)
    this.emitActivityChanges(subtree, previousActivity)
  }

  getParent(id: EntityId): EntityId | null {
    return this.entities.get(id.value)?.parent ?? null
  }

  getChildren(id: EntityId): readonly EntityId[] {
    return this.entities.get(id.value)?.children ?? []
  }

  getRootEntities(): readonly EntityId[] {
    return this.roots.filter((id) => this.entities.has(id.value))
  }

  moveEntityInHierarchy(
    entity: EntityId,
    target: EntityId,
    mode: 'before' | 'after' | 'child',
  ): void {
    if (!this.hasEntity(entity) || !this.hasEntity(target)) {
      throw new Error('Entity not found')
    }
    if (entity.value === target.value) return
    if (this.isDescendant(entity, target)) {
      throw new Error('Cannot move entity into its descendant')
    }

    if (mode === 'child') {
      this.setParent(entity, target)
      return
    }

    const parent = this.getParent(target)
    if (parent && this.isDescendant(entity, parent)) {
      throw new Error('Cannot move entity relative to its descendant')
    }

    const siblings = this.getSiblingList(parent)
    const targetIndex = siblings.findIndex((sibling) => sibling.value === target.value)
    if (targetIndex === -1) return

    let insertIndex = mode === 'before' ? targetIndex : targetIndex + 1

    const oldParent = this.getParent(entity)
    const oldSiblings = this.getSiblingList(oldParent)
    const oldIndex = oldSiblings.findIndex((sibling) => sibling.value === entity.value)

    const sameList =
      (oldParent === null && parent === null) ||
      (oldParent !== null && parent !== null && oldParent.value === parent.value)

    this.setParent(entity, parent)

    if (sameList && oldIndex !== -1 && oldIndex < insertIndex) {
      insertIndex -= 1
    }

    this.insertSiblingAt(entity, parent, insertIndex)
  }

  copyHierarchyOrderFrom(source: World): void {
    this.roots = source.getRootEntities().filter((id) => this.hasEntity(id))
    for (const id of source.getAllEntities()) {
      const obj = this.entities.get(id.value)
      if (!obj) continue
      obj.children = source.getChildren(id).filter((child) => this.hasEntity(child))
    }
  }

  *query(...types: ComponentTypeReference[]): Iterable<EntityId> {
    for (const [idStr, obj] of this.entities) {
      if (obj.activeInHierarchy && types.every((t) => obj.components.has(t.id))) {
        yield entityId(idStr)
      }
    }
  }

  *queryIncludingInactive(...types: ComponentTypeReference[]): Iterable<EntityId> {
    for (const [idStr, obj] of this.entities) {
      if (types.every((t) => obj.components.has(t.id))) {
        yield entityId(idStr)
      }
    }
  }

  getComponentDefinition(id: EntityId, typeId: string): ComponentDefinition | undefined {
    return this.entities.get(id.value)?.components.get(typeId)?.definition
  }

  private getSiblingList(parent: EntityId | null): EntityId[] {
    return parent ? [...this.getChildren(parent)] : [...this.getRootEntities()]
  }

  private insertSiblingAt(entity: EntityId, parent: EntityId | null, index: number): void {
    const list = parent ? this.entities.get(parent.value)!.children : this.roots
    const fromIndex = list.findIndex((sibling) => sibling.value === entity.value)
    if (fromIndex === -1) return

    const [item] = list.splice(fromIndex, 1)
    const clamped = Math.max(0, Math.min(index, list.length))
    list.splice(clamped, 0, item)
  }

  private isDescendant(candidate: EntityId, ancestor: EntityId): boolean {
    let current: EntityId | null = candidate
    while (current) {
      if (current.value === ancestor.value) return true
      current = this.getParent(current)
    }
    return false
  }

  private collectSubtree(root: EntityId): EntityId[] {
    const result: EntityId[] = []
    const visit = (id: EntityId): void => {
      if (!this.entities.has(id.value)) return
      result.push(id)
      for (const child of this.getChildren(id)) visit(child)
    }
    visit(root)
    return result
  }

  private captureActivity(ids: readonly EntityId[]): Map<string, boolean> {
    return new Map(ids.map((id) => [id.value, this.isActiveInHierarchy(id)]))
  }

  private refreshSubtreeActivity(root: EntityId): void {
    const obj = this.entities.get(root.value)
    if (!obj) return
    const parentActive = obj.parent ? this.isActiveInHierarchy(obj.parent) : true
    obj.activeInHierarchy = obj.activeSelf && parentActive
    for (const child of obj.children) {
      this.refreshSubtreeActivity(child)
    }
  }

  private emitActivityChanges(
    subtree: readonly EntityId[],
    previousActivity: ReadonlyMap<string, boolean>,
  ): void {
    for (const id of [...subtree].reverse()) {
      if (previousActivity.get(id.value) && !this.isActiveInHierarchy(id)) {
        this.callEntityLifecycleHook(id, 'deactivate')
      }
    }
    for (const id of subtree) {
      if (!previousActivity.get(id.value) && this.isActiveInHierarchy(id)) {
        this.callEntityLifecycleHook(id, 'activate')
      }
    }
  }

  private callEntityLifecycleHook(
    id: EntityId,
    hook: 'activate' | 'deactivate',
  ): void {
    const obj = this.entities.get(id.value)
    if (!obj) return
    for (const component of this.sortedComponents(obj)) {
      this.callLifecycleHook(id, component, hook)
    }
  }

  private sortedComponents(obj: GameObject): StoredComponent[] {
    return [...obj.components.values()].sort((left, right) =>
      left.definition.id.localeCompare(right.definition.id),
    )
  }

  private callLifecycleHook(
    id: EntityId,
    component: StoredComponent,
    hook: keyof ComponentLifecycleHooks,
  ): void {
    const callback = component.definition.lifecycle?.[hook]
    if (!callback) return
    callback({
      world: this,
      entity: id,
      component: component.definition,
      data: structuredClone(component.data),
    })
  }
}

export function cloneWorld(source: World): World {
  const clone = new World()
  for (const id of source.getAllEntities()) {
    const name = source.getEntityName(id) ?? 'Entity'
    clone.createEntity(name, id, source.getActiveSelf(id))
  }
  for (const id of source.getAllEntities()) {
    clone.setParent(id, source.getParent(id))
  }
  clone.copyHierarchyOrderFrom(source)
  for (const id of source.getAllEntities()) {
    for (const typeId of source.getComponentTypes(id)) {
      const type = source.getComponentDefinition(id, typeId) ?? {
        id: typeId,
      } as ComponentDefinition
      const data = source.getComponent(id, type)
      if (data !== undefined) clone.addComponent(id, type, data)
    }
  }
  return clone
}
