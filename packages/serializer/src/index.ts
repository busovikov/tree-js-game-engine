import {
  World,
  ColliderComponent,
  RigidBodyComponent,
  PrefabInstanceComponent,
  createCoreComponentRegistry,
  entityId,
  type ComponentRegistry,
  type ComponentType,
  type EntityId,
  type IWorld,
} from '@haku/core'
import {
  PrefabInstanceSchema,
  SceneDocumentSchema,
  defaultPhysicsProjectSettings,
  defaultRenderSettings,
  validateEntityPhysicsComponents,
  validateSceneDocument,
  type ComponentRecord,
  type EntityRecord,
  type PrefabDefinition,
  type SceneDocument,
} from '@haku/schema'
import {
  RUNTIME_COMPONENT_FIELDS,
  migrateEntityComponents,
  migrateEntityRecord,
  parseMigratedColliderData,
  parseMigratedRigidBodyData,
} from './physics-migration.js'

export function sanitizeComponentDataForPersistence(
  typeName: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const fields = RUNTIME_COMPONENT_FIELDS[typeName as keyof typeof RUNTIME_COMPONENT_FIELDS]
  if (!fields) return data

  const sanitized = { ...data }
  for (const field of fields) {
    delete sanitized[field]
  }
  return sanitized
}

function getComponentType(registry: ComponentRegistry, typeId: string): ComponentType {
  return registry.require(typeId)
}

function parseComponentData(type: ComponentType, data: Record<string, unknown>): unknown {
  if (type.id === ColliderComponent.id) {
    return parseMigratedColliderData(data)
  }
  if (type.id === RigidBodyComponent.id) {
    return parseMigratedRigidBodyData(data)
  }
  return type.schema.parse(data)
}

function validateEntityPhysics(world: IWorld, id: EntityId): void {
  const collider = world.getComponent(id, ColliderComponent)
  if (!collider) return
  validateEntityPhysicsComponents({
    collider,
    rigidBody: world.getComponent(id, RigidBodyComponent),
  })
}

function addMigratedComponents(
  world: IWorld,
  id: EntityId,
  components: ComponentRecord[],
  registry: ComponentRegistry,
): void {
  const migrated = migrateEntityComponents(components)
  for (const comp of migrated) {
    if (comp.type === PrefabInstanceComponent.id) continue
    const type = getComponentType(registry, comp.type)
    world.addComponent(id, type, parseComponentData(type, comp.data as Record<string, unknown>))
  }
  validateEntityPhysics(world, id)
}

function applyOverrides(
  entity: EntityId,
  world: IWorld,
  overrides: Record<string, Record<string, unknown>> | undefined,
  registry: ComponentRegistry,
): void {
  if (!overrides) return
  for (const [typeId, patch] of Object.entries(overrides)) {
    const type = getComponentType(registry, typeId)
    const existing = world.getComponent(entity, type) ?? type.defaults?.() ?? {}
    world.addComponent(entity, type, { ...existing, ...patch })
  }
}

function expandPrefabInstance(
  world: IWorld,
  parent: EntityId | null,
  prefabId: string,
  overrides: Record<string, Record<string, unknown>> | undefined,
  prefabs: Record<string, PrefabDefinition>,
  idMap: Map<string, EntityId>,
  registry: ComponentRegistry,
): void {
  const prefab = prefabs[prefabId]
  if (!prefab) throw new Error(`Prefab not found: ${prefabId}`)

  for (const record of prefab.entities) {
    const newId = entityId(crypto.randomUUID())
    idMap.set(record.id, newId)
  }

  for (const record of prefab.entities) {
    const newId = idMap.get(record.id)!
    world.createEntity(record.name, newId)
    addMigratedComponents(world, newId, record.components, registry)
  }

  for (const record of prefab.entities) {
    const newId = idMap.get(record.id)!
    const parentId = record.parent ? idMap.get(record.parent) ?? null : parent
    world.setParent(newId, parentId)
  }

  const root = prefab.entities.find((e) => e.parent === null)
  if (root) {
    applyOverrides(idMap.get(root.id)!, world, overrides, registry)
  }
}

function loadEntityRecords(
  world: World,
  records: EntityRecord[],
  prefabs: Record<string, PrefabDefinition>,
  expandPrefabs: boolean,
  registry: ComponentRegistry,
): void {
  for (const record of records) {
    world.createEntity(record.name, entityId(record.id))
  }

  for (const record of records) {
    const id = entityId(record.id)
    const migratedRecord = migrateEntityRecord(record)
    for (const comp of migratedRecord.components) {
      if (comp.type === PrefabInstanceComponent.id) {
        const data = PrefabInstanceSchema.parse(comp.data)
        if (expandPrefabs) {
          expandPrefabInstance(world, id, data.prefabId, data.overrides, prefabs, new Map(), registry)
        } else {
          const type = getComponentType(registry, PrefabInstanceComponent.id)
          world.addComponent(id, type, data)
        }
        continue
      }
    }
    addMigratedComponents(world, id, migratedRecord.components, registry)
  }

  for (const record of records) {
    world.setParent(entityId(record.id), record.parent ? entityId(record.parent) : null)
  }
}

export function loadSceneDocument(
  input: unknown,
  options: { expandPrefabs?: boolean; componentRegistry?: ComponentRegistry } = {},
): World {
  const expandPrefabs = options.expandPrefabs ?? true
  const componentRegistry = options.componentRegistry ?? createCoreComponentRegistry()
  const doc = validateSceneDocument(input)
  const world = new World()
  loadEntityRecords(world, doc.entities, doc.prefabs, expandPrefabs, componentRegistry)
  return world
}

export function saveSceneDocument(
  world: IWorld,
  metadata: SceneDocument['metadata'] = { name: 'Untitled' },
  prototypes: SceneDocument['prototypes'] = {},
  prefabs: SceneDocument['prefabs'] = {},
  renderSettings: SceneDocument['renderSettings'] = defaultRenderSettings(),
  physicsSettings: SceneDocument['physicsSettings'] = defaultPhysicsProjectSettings(),
  componentRegistry: ComponentRegistry = createCoreComponentRegistry(),
): SceneDocument {
  const entities: EntityRecord[] = []

  for (const id of world.getAllEntities()) {
    const components: ComponentRecord[] = []
    for (const typeId of world.getComponentTypes(id)) {
      const type = getComponentType(componentRegistry, typeId)
      const data = world.getComponent(id, type)
      if (data !== undefined) {
        const parsed = type.schema.parse(data) as Record<string, unknown>
        components.push({
          type: typeId,
          data: sanitizeComponentDataForPersistence(type.name, parsed),
        })
      }
    }
    entities.push({
      id: id.value,
      name: world.getEntityName(id) ?? 'Entity',
      parent: world.getParent(id)?.value ?? null,
      components,
    })
  }

  return SceneDocumentSchema.parse({
    schemaVersion: 1,
    metadata,
    entities,
    prototypes,
    prefabs,
    renderSettings,
    physicsSettings,
  })
}

export function roundtripSceneDocument(
  doc: SceneDocument,
  componentRegistry: ComponentRegistry = createCoreComponentRegistry(),
): SceneDocument {
  const world = loadSceneDocument(doc, { componentRegistry })
  return saveSceneDocument(
    world,
    doc.metadata,
    doc.prototypes,
    doc.prefabs,
    doc.renderSettings,
    doc.physicsSettings,
    componentRegistry,
  )
}

export { validateSceneDocument }
