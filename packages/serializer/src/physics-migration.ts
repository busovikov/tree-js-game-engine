import {
  ColliderSchema,
  RigidBodySchema,
  stripLegacyColliderFields,
  type ComponentRecord,
  type EntityRecord,
} from '@haku/schema'

const RUNTIME_COLLIDER_FIELDS = [
  'physicsBodyHandle',
  'physicsHandle',
  'physicsVehicleHandle',
] as const

const RUNTIME_RIGID_BODY_FIELDS = ['physicsBodyHandle'] as const

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
 * Migrates legacy Collider (`isStatic`, runtime handles) to Collider v2 + optional RigidBody.
 * Called before component schema parse on scene load.
 */
export function migrateEntityComponents(components: ComponentRecord[]): ComponentRecord[] {
  // The `custom-spring` controller was removed from the schema. Drop it so legacy scenes/prefabs
  // that still reference it load instead of throwing an "invalid discriminator" ZodError.
  const withoutCustomSpring = components.filter(
    (comp) =>
      !(
        comp.type === 'PhysicsController' &&
        (comp.data as Record<string, unknown>)?.type === 'custom-spring'
      ),
  )
  components = withoutCustomSpring

  const colliderRecord = findComponent(components, 'Collider')
  if (!colliderRecord) {
    return components
  }

  const raw = colliderRecord.data as Record<string, unknown>
  const legacyIsStatic = raw.isStatic as boolean | undefined
  const legacyBodyHandle = raw.physicsBodyHandle as string | undefined

  const migratedColliderData = stripLegacyColliderFields(raw)
  const next: ComponentRecord[] = components.map((comp) => {
    if (comp.type !== 'Collider') {
      return comp
    }
    return { type: 'Collider', data: migratedColliderData }
  })

  const hasRigidBody = hasComponent(next, 'RigidBody')
  const hasStaticComponent = hasComponent(next, 'Static')

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
      next.push({ type: 'RigidBody', data: rigidBodyData })
    }
  } else if (legacyBodyHandle) {
    const rbIdx = next.findIndex((c) => c.type === 'RigidBody')
    if (rbIdx >= 0) {
      const rbData = { ...(next[rbIdx].data as Record<string, unknown>) }
      if (!rbData.physicsBodyHandle) {
        rbData.physicsBodyHandle = legacyBodyHandle
        next[rbIdx] = { type: 'RigidBody', data: rbData }
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
  PhysicsController: ['physicsBodyHandle', 'physicsHandle', 'physicsVehicleHandle'],
} as const satisfies Record<string, readonly string[]>
