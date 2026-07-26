import { World, PrefabInstanceComponent, entityId, type ComponentRegistry, type ComponentDefinition, type EntityId, type IWorld } from '@haku/core'
import {
  AssetDiagnosticError,
  PREFAB_ASSET_TYPE,
  type AssetId,
  type AssetRef,
} from '@haku/assets'
import {
  ColliderComponent,
  RigidBodyComponent,
  validateEntityPhysicsComponents,
} from '@haku/physics'
import {
  PrefabInstanceSchema,
  SceneDocumentSchema,
  defaultPhysicsProjectSettings,
  defaultRenderSettings,
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

export * from './asset-types.js'

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

function getComponentType(registry: ComponentRegistry, typeId: string): ComponentDefinition {
  return registry.require(typeId)
}

function parseComponentData(type: ComponentDefinition, data: Record<string, unknown>): unknown {
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
  prefabReference: AssetRef,
  overrides: Record<string, Record<string, unknown>> | undefined,
  prefabAssets: ReadonlyMap<AssetId, PrefabDefinition>,
  idMap: Map<string, EntityId>,
  registry: ComponentRegistry,
): void {
  if (prefabReference.type !== PREFAB_ASSET_TYPE) {
    throw new AssetDiagnosticError([
      {
        code: 'asset.type-mismatch',
        severity: 'error',
        message: `Asset ${prefabReference.$ref} has type ${prefabReference.type}; expected ${PREFAB_ASSET_TYPE}`,
        assetId: prefabReference.$ref,
        expectedType: PREFAB_ASSET_TYPE,
        actualType: prefabReference.type,
      },
    ])
  }
  const prefab = prefabAssets.get(prefabReference.$ref)
  if (!prefab) {
    throw new AssetDiagnosticError([
      {
        code: 'asset.unknown-id',
        severity: 'error',
        message: `Unknown prefab asset ID: ${prefabReference.$ref}`,
        assetId: prefabReference.$ref,
        expectedType: PREFAB_ASSET_TYPE,
      },
    ])
  }

  for (const record of prefab.entities) {
    const newId = entityId(crypto.randomUUID())
    idMap.set(record.id, newId)
  }

  for (const record of prefab.entities) {
    const newId = idMap.get(record.id)!
    world.createEntity(record.name, newId, record.activeSelf)
  }

  for (const record of prefab.entities) {
    const newId = idMap.get(record.id)!
    const parentId = record.parent ? idMap.get(record.parent) ?? null : parent
    world.setParent(newId, parentId)
  }

  for (const record of prefab.entities) {
    addMigratedComponents(world, idMap.get(record.id)!, record.components, registry)
  }

  const root = prefab.entities.find((e) => e.parent === null)
  if (root) {
    applyOverrides(idMap.get(root.id)!, world, overrides, registry)
  }
}

function loadEntityRecords(
  world: World,
  records: EntityRecord[],
  prefabAssets: ReadonlyMap<AssetId, PrefabDefinition>,
  expandPrefabs: boolean,
  registry: ComponentRegistry,
): void {
  for (const record of records) {
    world.createEntity(record.name, entityId(record.id), record.activeSelf)
  }

  for (const record of records) {
    world.setParent(entityId(record.id), record.parent ? entityId(record.parent) : null)
  }

  for (const record of records) {
    const id = entityId(record.id)
    const migratedRecord = migrateEntityRecord(record)
    for (const comp of migratedRecord.components) {
      if (comp.type === PrefabInstanceComponent.id) {
        const data = PrefabInstanceSchema.parse(comp.data)
        if (expandPrefabs) {
          expandPrefabInstance(
            world,
            id,
            data.prefab,
            data.overrides,
            prefabAssets,
            new Map(),
            registry,
          )
        } else {
          const type = getComponentType(registry, PrefabInstanceComponent.id)
          world.addComponent(id, type, data)
        }
        continue
      }
    }
    addMigratedComponents(world, id, migratedRecord.components, registry)
  }
}

export function loadSceneDocument(
  input: unknown,
  options: {
    expandPrefabs?: boolean
    componentRegistry: ComponentRegistry
    prefabAssets?: ReadonlyMap<AssetId, PrefabDefinition>
  },
): World {
  const expandPrefabs = options.expandPrefabs ?? true
  const componentRegistry = options.componentRegistry
  const doc = validateSceneDocument(input)
  const world = new World()
  loadEntityRecords(
    world,
    doc.entities,
    options.prefabAssets ?? new Map(),
    expandPrefabs,
    componentRegistry,
  )
  return world
}

export function saveSceneDocument(
  world: IWorld,
  metadata: SceneDocument['metadata'] = { name: 'Untitled' },
  prototypes: SceneDocument['prototypes'] = {},
  renderSettings: SceneDocument['renderSettings'] = defaultRenderSettings(),
  physicsSettings: SceneDocument['physicsSettings'] = defaultPhysicsProjectSettings(),
  componentRegistry: ComponentRegistry,
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
      activeSelf: world.getActiveSelf(id),
      components,
    })
  }

  return SceneDocumentSchema.parse({
    schemaVersion: 1,
    metadata,
    entities,
    prototypes,
    renderSettings,
    physicsSettings,
  })
}

export function roundtripSceneDocument(
  doc: SceneDocument,
  componentRegistry: ComponentRegistry,
): SceneDocument {
  const world = loadSceneDocument(doc, { componentRegistry, expandPrefabs: false })
  return saveSceneDocument(
    world,
    doc.metadata,
    doc.prototypes,
    doc.renderSettings,
    doc.physicsSettings,
    componentRegistry,
  )
}

export { validateSceneDocument }
