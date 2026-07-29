import { WORLD_GRAPH_CONTRACTS } from '@haku/graph'
import {
  type CheckpointEffectRecord,
  type NodeExecutionRequest,
  type NodeExecutionResult,
  type NodeRuntimeRegistry,
} from './runtime-adapter.js'

type Vec3 = readonly [number, number, number]

export interface WorldGraphService {
  getTransformPosition(entityId: string): Vec3
  setTransformPosition(entityId: string, position: Vec3): void
  hasComponent(entityId: string, componentType: string): boolean
  spawnPrefab(prefabId: string): string
  raycast(
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
  ): { readonly entity: string; readonly distance: number } | null
  setBodyVelocity(entityId: string, velocity: Vec3): void
}

export function registerWorldRuntimeAdapters(
  registry: NodeRuntimeRegistry,
  service: WorldGraphService,
): void {
  const register = (
    nodeType: string,
    execute: (request: NodeExecutionRequest) => NodeExecutionResult,
  ): void => registry.register({ nodeType, version: '1', execute })

  const getTransform = WORLD_GRAPH_CONTRACTS.getTransform
  register(getTransform.nodeType, (request) => ({
    data: {
      [getTransform.ports.position]: service.getTransformPosition(
        entityId(request.readData(getTransform.ports.entity)),
      ),
    },
  }))

  const setTransform = WORLD_GRAPH_CONTRACTS.setTransform
  register(setTransform.nodeType, (request) => {
    const entity = entityId(request.readData(setTransform.ports.entity))
    const position = vec3(request.readData(setTransform.ports.position), 'Position')
    service.setTransformPosition(entity, position)
    return mutation(
      request,
      setTransform.ports.flowOut,
      'world.set-transform-position',
      { entity, position },
    )
  })

  const hasComponent = WORLD_GRAPH_CONTRACTS.hasComponent
  register(hasComponent.nodeType, (request) => {
    const componentType = request.node.properties.componentType
    if (typeof componentType !== 'string' || componentType.length === 0) {
      throw new TypeError('Component type must be a non-empty string')
    }
    return {
      data: {
        [hasComponent.ports.result]: service.hasComponent(
          entityId(request.readData(hasComponent.ports.entity)),
          componentType,
        ),
      },
    }
  })

  const spawnPrefab = WORLD_GRAPH_CONTRACTS.spawnPrefab
  register(spawnPrefab.nodeType, (request) => {
    const prefabId = uuidProperty(request, 'prefabId')
    const entity = assertUuid(service.spawnPrefab(prefabId), 'Spawned entity')
    return {
      ...mutation(
        request,
        spawnPrefab.ports.flowOut,
        'world.spawn-prefab',
        { prefabId, entity },
      ),
      data: { [spawnPrefab.ports.entity]: entityReference(entity) },
    }
  })

  const raycast = WORLD_GRAPH_CONTRACTS.raycast
  register(raycast.nodeType, (request) => {
    const origin = vec3(request.readData(raycast.ports.origin), 'Ray origin')
    const direction = vec3(request.readData(raycast.ports.direction), 'Ray direction')
    if (direction.every((component) => component === 0)) {
      throw new RangeError('Ray direction must be non-zero')
    }
    const maxDistance = positiveFinite(
      request.readData(raycast.ports.maxDistance),
      'Ray maximum distance',
    )
    const hit = service.raycast(origin, direction, maxDistance)
    if (hit === null) {
      return {
        data: {
          [raycast.ports.entity]: { kind: 'none' },
          [raycast.ports.distance]: { kind: 'none' },
        },
      }
    }
    return {
      data: {
        [raycast.ports.entity]: {
          kind: 'some',
          value: entityReference(assertUuid(hit.entity, 'Raycast entity')),
        },
        [raycast.ports.distance]: {
          kind: 'some',
          value: positiveFinite(hit.distance, 'Raycast distance', true),
        },
      },
    }
  })

  const physicsEvent = WORLD_GRAPH_CONTRACTS.physicsEvent
  register(physicsEvent.nodeType, (request) => {
    const payload = request.input?.value
    if (typeof payload !== 'object' || payload === null) {
      throw new TypeError('Physics event payload must be an object')
    }
    const entity = assertUuid(
      (payload as { readonly entity?: unknown }).entity,
      'Physics event entity',
    )
    return {
      flow: [physicsEvent.ports.flowOut],
      data: { [physicsEvent.ports.entity]: entityReference(entity) },
    }
  })

  const setBodyVelocity = WORLD_GRAPH_CONTRACTS.setBodyVelocity
  register(setBodyVelocity.nodeType, (request) => {
    const entity = entityId(request.readData(setBodyVelocity.ports.entity))
    const velocity = vec3(
      request.readData(setBodyVelocity.ports.velocity),
      'Body velocity',
    )
    service.setBodyVelocity(entity, velocity)
    return mutation(
      request,
      setBodyVelocity.ports.flowOut,
      'physics.set-body-velocity',
      { entity, velocity },
    )
  })
}

function entityId(value: unknown): string {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Entity reference must be an object')
  }
  const reference = (value as { readonly $ref?: unknown }).$ref
  if (typeof reference !== 'string' || !reference.startsWith('entity:')) {
    throw new TypeError('Entity reference must use the entity: UUID format')
  }
  return assertUuid(reference.slice('entity:'.length), 'Entity reference')
}

function entityReference(entity: string): { readonly $ref: string } {
  return { $ref: `entity:${entity}` }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function assertUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new TypeError(`${label} must be a UUID`)
  }
  return value
}

function uuidProperty(request: NodeExecutionRequest, key: string): string {
  return assertUuid(request.node.properties[key], key)
}

function vec3(value: unknown, label: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} must be a three-component vector`)
  }
  return [
    finite(value[0], `${label}[0]`),
    finite(value[1], `${label}[1]`),
    finite(value[2], `${label}[2]`),
  ]
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`)
  }
  return value
}

function positiveFinite(
  value: unknown,
  label: string,
  allowZero = false,
): number {
  const number = finite(value, label)
  if (allowZero ? number < 0 : number <= 0) {
    throw new RangeError(`${label} must be ${allowZero ? 'non-negative' : 'positive'}`)
  }
  return number
}

function mutation(
  request: NodeExecutionRequest,
  flowOut: string,
  kind: string,
  payload: unknown,
): NodeExecutionResult {
  return {
    flow: [flowOut],
    effects: [effect(request, kind, payload)],
  }
}

function effect(
  request: NodeExecutionRequest,
  kind: string,
  payload: unknown,
): CheckpointEffectRecord {
  return {
    id: [
      request.instanceId,
      request.node.id,
      kind,
      request.tickNumber,
      request.frameNumber,
      JSON.stringify(payload),
    ].join(':'),
    kind,
    payload,
  }
}
