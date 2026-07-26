import {
  ColliderSchema,
  LEGACY_CONTROLLER_TYPE_TO_COMPONENT_ID,
  PhysicsControllerTypeSchema,
  RigidBodySchema,
  stripLegacyColliderFields,
  type ComponentRecord,
  type EntityRecord,
} from '@haku/schema'
import {
  ColliderComponent,
  RigidBodyComponent,
  StaticComponent,
} from '@haku/core'

const RUNTIME_COLLIDER_FIELDS = [
  'physicsBodyHandle',
  'physicsHandle',
  'physicsVehicleHandle',
] as const

const RUNTIME_RIGID_BODY_FIELDS = ['physicsBodyHandle'] as const

const RUNTIME_CONTROLLER_FIELDS = [
  'physicsBodyHandle',
  'physicsHandle',
  'physicsVehicleHandle',
] as const

function hasComponent(components: ComponentRecord[], type: string): boolean {
  return components.some((c) => c.type === type)
}

function findComponent(
  components: ComponentRecord[],
  type: string,
): ComponentRecord | undefined {
  return components.find((c) => c.type === type)
}

/**
 * Lift legacy `PhysicsController` + nested `data.type` into a dedicated controller component.
 * Drops removed `custom-spring` controllers. Strips the nested `type` field from data.
 */
function migratePhysicsControllers(components: ComponentRecord[]): ComponentRecord[] {
  const next: ComponentRecord[] = []
  for (const comp of components) {
    if (comp.type !== 'PhysicsController') {
      next.push(comp)
      continue
    }

    const raw = { ...(comp.data as Record<string, unknown>) }
    const legacyType = raw.type
    if (legacyType === 'custom-spring') {
      continue
    }

    const parsedType = PhysicsControllerTypeSchema.safeParse(legacyType)
    if (!parsedType.success) {
      continue
    }

    delete raw.type
    next.push({
      type: LEGACY_CONTROLLER_TYPE_TO_COMPONENT_ID[parsedType.data],
      data: raw,
    })
  }
  return next
}

/**
 * Migrates legacy Collider (`isStatic`, runtime handles) to Collider v2 + optional RigidBody,
 * and splits PhysicsController into per-kind controller components.
 * Called before component schema parse on scene load.
 */
export function migrateEntityComponents(components: ComponentRecord[]): ComponentRecord[] {
  components = migratePhysicsControllers(components)

  const colliderRecord = findComponent(components, ColliderComponent.id)
  if (!colliderRecord) {
    return components
  }

  const raw = colliderRecord.data as Record<string, unknown>
  const legacyIsStatic = raw.isStatic as boolean | undefined
  const legacyBodyHandle = raw.physicsBodyHandle as string | undefined

  const migratedColliderData = stripLegacyColliderFields(raw)
  const next: ComponentRecord[] = components.map((comp) => {
    if (comp.type !== ColliderComponent.id) {
      return comp
    }
    return { type: '40000000-0000-4000-8000-000000000009', data: migratedColliderData }
  })

  const hasRigidBody = hasComponent(next, RigidBodyComponent.id)
  const hasStaticComponent = hasComponent(next, StaticComponent.id)

  if (!hasRigidBody) {
    let rigidBodyData: Record<string, unknown> | null = null

    if (legacyIsStatic === false) {
      // Dynamic collider → synthesize RigidBody. StaticComponent forces static (legacy parity).
      rigidBodyData = {
        type: hasStaticComponent ? 'static' : 'dynamic',
      }
    } else if (legacyBodyHandle) {
      // Runtime handle on collider-only static body → store on implicit static RigidBody in memory.
      rigidBodyData = { type: 'static', physicsBodyHandle: legacyBodyHandle }
    }

    if (rigidBodyData) {
      if (legacyBodyHandle && legacyIsStatic === false) {
        rigidBodyData.physicsBodyHandle = legacyBodyHandle
      }
      next.push({ type: '40000000-0000-4000-8000-000000000010', data: rigidBodyData })
    }
  } else if (legacyBodyHandle) {
    const rbIdx = next.findIndex((c) => c.type === RigidBodyComponent.id)
    if (rbIdx >= 0) {
      const rbData = { ...(next[rbIdx].data as Record<string, unknown>) }
      if (!rbData.physicsBodyHandle) {
        rbData.physicsBodyHandle = legacyBodyHandle
        next[rbIdx] = { type: '40000000-0000-4000-8000-000000000010', data: rbData }
      }
    }
  }

  return next
}

export function migrateEntityRecord(record: EntityRecord): EntityRecord {
  return {
    ...record,
    components: migrateEntityComponents(record.components),
  }
}

export function parseMigratedColliderData(data: Record<string, unknown>) {
  return ColliderSchema.parse(stripLegacyColliderFields(data))
}

export function parseMigratedRigidBodyData(data: Record<string, unknown>) {
  return RigidBodySchema.parse(data)
}

export const RUNTIME_COMPONENT_FIELDS = {
  Collider: [...RUNTIME_COLLIDER_FIELDS],
  RigidBody: [...RUNTIME_RIGID_BODY_FIELDS],
  CustomRaycastController: [...RUNTIME_CONTROLLER_FIELDS],
  DynamicRaycastController: [...RUNTIME_CONTROLLER_FIELDS],
  ArcadeVehicleController: [...RUNTIME_CONTROLLER_FIELDS],
  RevoluteJointVehicleController: [...RUNTIME_CONTROLLER_FIELDS],
  KinematicCharacterController: [...RUNTIME_CONTROLLER_FIELDS],
  CharacterBodyController: [...RUNTIME_CONTROLLER_FIELDS],
  PointerControlsController: [...RUNTIME_CONTROLLER_FIELDS],
} as const satisfies Record<string, readonly string[]>
