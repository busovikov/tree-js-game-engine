import type { EntityId } from '@haku/core'
import { MeshRendererComponent } from '@haku/core'
import type { ColliderBakeSource, MeshRenderer } from '@haku/schema'
import { meshRendererKey, normalizeMeshRenderer } from '@haku/schema'
import * as THREE from 'three'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const MODEL_ROOT_NAME = 'haku-model-root'
const POSITION_EPSILON = 1e-4

function vecKey(x: number, y: number, z: number): string {
  return `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`
}

export type ColliderBakeMode = 'convexHull' | 'trimesh'

function dedupePositions(positions: THREE.Vector3[]): THREE.Vector3[] {
  const seen = new Set<string>()
  const unique: THREE.Vector3[] = []
  for (const point of positions) {
    const key = vecKey(point.x, point.y, point.z)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(point)
  }
  return unique
}

function samplePositions(positions: THREE.Vector3[], maxCount: number): THREE.Vector3[] {
  if (positions.length <= maxCount) {
    return positions
  }
  const step = positions.length / maxCount
  const sampled: THREE.Vector3[] = []
  for (let index = 0; index < maxCount; index += 1) {
    sampled.push(positions[Math.floor(index * step)]!)
  }
  return sampled
}

export interface ColliderMeshBakeOptions {
  maxConvexHullVertices?: number
  collisionMeshAsset?: string
  modelGeometryOnly?: boolean
}

export interface ColliderMeshBakeResult {
  mode: ColliderBakeMode
  points?: number[]
  vertices?: number[]
  indices?: number[]
  bakeSource: ColliderBakeSource
  sourceVertexCount: number
  warnings: string[]
}

export interface ColliderMeshBakeContext {
  getObject3D(entityId: EntityId): THREE.Object3D | undefined
  getMeshRenderer?(entityId: EntityId): MeshRenderer | undefined
}

function collectMeshGeometries(
  rootObject: THREE.Object3D,
  options: { collisionMeshAsset?: string; modelGeometryOnly?: boolean } = {},
): THREE.BufferGeometry[] {
  rootObject.updateMatrixWorld(true)
  const geometries: THREE.BufferGeometry[] = []
  const modelRoot = rootObject.getObjectByName(MODEL_ROOT_NAME)
  const sourceRoot =
    options.collisionMeshAsset || options.modelGeometryOnly ? modelRoot ?? rootObject : rootObject

  sourceRoot.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return
    const geometry = node.geometry
    if (!geometry?.attributes.position) return
    const clone = geometry.clone()
    clone.applyMatrix4(node.matrixWorld)
    geometries.push(clone)
  })

  return geometries
}

function toLocalPositions(
  positions: readonly number[],
  rootInverse: THREE.Matrix4,
): number[] {
  const local: number[] = []
  const point = new THREE.Vector3()
  for (let index = 0; index < positions.length; index += 3) {
    point.set(positions[index]!, positions[index + 1]!, positions[index + 2]!)
    point.applyMatrix4(rootInverse)
    local.push(point.x, point.y, point.z)
  }
  return local
}

function flatPositionsFromAttribute(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): number[] {
  const positions: number[] = []
  const vector = new THREE.Vector3()
  for (let index = 0; index < attribute.count; index += 1) {
    vector.fromBufferAttribute(attribute as THREE.BufferAttribute, index)
    positions.push(vector.x, vector.y, vector.z)
  }
  return positions
}

function computeAabb(positions: readonly number[]): {
  min: [number, number, number]
  max: [number, number, number]
} {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index]!
    const y = positions[index + 1]!
    const z = positions[index + 2]!
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    maxZ = Math.max(maxZ, z)
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  }
}

export function hullContainsSourceAabb(source: readonly number[], hull: readonly number[]): boolean {
  const sourceAabb = computeAabb(source)
  const hullAabb = computeAabb(hull)
  return (
    hullAabb.min[0] <= sourceAabb.min[0] + POSITION_EPSILON &&
    hullAabb.min[1] <= sourceAabb.min[1] + POSITION_EPSILON &&
    hullAabb.min[2] <= sourceAabb.min[2] + POSITION_EPSILON &&
    hullAabb.max[0] + POSITION_EPSILON >= sourceAabb.max[0] &&
    hullAabb.max[1] + POSITION_EPSILON >= sourceAabb.max[1] &&
    hullAabb.max[2] + POSITION_EPSILON >= sourceAabb.max[2]
  )
}

export function meshRevisionForRenderer(meshRenderer: MeshRenderer): string {
  return meshRendererKey(meshRenderer)
}

export function isBakeSourceStale(
  bakeSource: ColliderBakeSource | undefined,
  currentRevision: string,
): boolean {
  if (!bakeSource?.meshRevision) return false
  return bakeSource.meshRevision !== currentRevision
}

function buildBakeSource(
  meshRenderer: MeshRenderer | undefined,
  collisionMeshAsset?: string,
): ColliderBakeSource {
  const normalized = meshRenderer ? normalizeMeshRenderer(meshRenderer) : undefined
  return {
    kind: 'meshRenderer',
    geometryType: normalized?.geometryType,
    modelAsset: normalized?.modelAsset || undefined,
    collisionMeshAsset: collisionMeshAsset?.trim() || undefined,
    meshRevision: normalized ? meshRevisionForRenderer(normalized) : undefined,
  }
}

export function bakeColliderMeshFromObject3D(
  rootObject: THREE.Object3D,
  mode: ColliderBakeMode,
  options: ColliderMeshBakeOptions = {},
  bakeSourceInput?: ColliderBakeSource,
): ColliderMeshBakeResult | null {
  const geometries = collectMeshGeometries(rootObject, {
    collisionMeshAsset: options.collisionMeshAsset,
    modelGeometryOnly: options.modelGeometryOnly,
  })
  if (geometries.length === 0) {
    return null
  }

  const merged = mergeGeometries(geometries, false)
  for (const geometry of geometries) {
    geometry.dispose()
  }
  if (!merged?.attributes.position) {
    merged?.dispose()
    return null
  }

  const rootInverse = new THREE.Matrix4().copy(rootObject.matrixWorld).invert()
  const warnings: string[] = []

  if (mode === 'convexHull') {
    const worldPositions = flatPositionsFromAttribute(merged.attributes.position)
    merged.dispose()

    const unique = dedupePositions(
      worldPositions.reduce<THREE.Vector3[]>((points, _, index) => {
        if (index % 3 !== 0) return points
        points.push(
          new THREE.Vector3(
            worldPositions[index]!,
            worldPositions[index + 1]!,
            worldPositions[index + 2]!,
          ),
        )
        return points
      }, []),
    )

    const maxVertices = options.maxConvexHullVertices ?? 1024
    const sampled = samplePositions(unique, maxVertices)
    if (unique.length > maxVertices) {
      warnings.push(
        `Convex hull input sampled from ${unique.length} to ${sampled.length} vertices (max ${maxVertices}).`,
      )
    }

    if (sampled.length < 4) {
      return null
    }

    const hullGeometry = new ConvexGeometry(sampled)
    const hullPositions = flatPositionsFromAttribute(hullGeometry.attributes.position)
    hullGeometry.dispose()

    const points = toLocalPositions(hullPositions, rootInverse)
    if (!hullContainsSourceAabb(toLocalPositions(worldPositions, rootInverse), points)) {
      warnings.push('Convex hull AABB does not fully contain the source mesh AABB.')
    }

    if (points.length / 3 > maxVertices) {
      warnings.push(`Convex hull has ${points.length / 3} vertices (max recommended ${maxVertices}).`)
    }

    warnings.push(
      'Convex hull wraps the mesh and may leave gaps in concave areas — use trimesh for accurate static collision.',
    )

    return {
      mode,
      points,
      bakeSource: bakeSourceInput ?? { kind: 'meshRenderer' },
      sourceVertexCount: unique.length,
      warnings,
    }
  }

  const welded = mergeVertices(merged)
  merged.dispose()
  if (!welded.index || !welded.attributes.position) {
    welded.dispose()
    return null
  }

  const vertices = toLocalPositions(
    flatPositionsFromAttribute(welded.attributes.position),
    rootInverse,
  )
  const indices = Array.from(welded.index.array as ArrayLike<number>, (value) => Number(value))
  welded.dispose()

  return {
    mode,
    vertices,
    indices,
    bakeSource: bakeSourceInput ?? { kind: 'meshRenderer' },
    sourceVertexCount: vertices.length / 3,
    warnings,
  }
}

export interface ColliderBakeService {
  bakeFromEntity(
    entityId: EntityId,
    mode: ColliderBakeMode,
    options?: ColliderMeshBakeOptions,
  ): ColliderMeshBakeResult | null
}

export function bakeColliderFromEntity(
  entityId: EntityId,
  mode: ColliderBakeMode,
  context: ColliderMeshBakeContext,
  options: ColliderMeshBakeOptions = {},
): ColliderMeshBakeResult | null {
  const rootObject = context.getObject3D(entityId)
  if (!rootObject) return null

  const meshRenderer = context.getMeshRenderer?.(entityId)
  const normalized = meshRenderer ? normalizeMeshRenderer(meshRenderer) : undefined
  const bakeSource = buildBakeSource(
    meshRenderer,
    options.collisionMeshAsset ?? normalized?.modelAsset,
  )

  return bakeColliderMeshFromObject3D(
    rootObject,
    mode,
    {
      ...options,
      modelGeometryOnly: normalized?.geometryType === 'ModelGeometry',
    },
    bakeSource,
  )
}

export function resolveEntityMeshRenderer(
  world: { getComponent<T>(id: EntityId, type: { id: string }): T | undefined },
  entityId: EntityId,
): MeshRenderer | undefined {
  const data = world.getComponent(entityId, MeshRendererComponent)
  return data ? normalizeMeshRenderer(data) : undefined
}

export function currentMeshRevision(
  world: { getComponent<T>(id: EntityId, type: { id: string }): T | undefined },
  entityId: EntityId,
): string | undefined {
  const meshRenderer = resolveEntityMeshRenderer(world, entityId)
  return meshRenderer ? meshRevisionForRenderer(meshRenderer) : undefined
}
