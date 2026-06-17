import {
  GEOMETRY_PARAM_SPECS,
  defaultGeometryParams,
  defaultMaterialProperties,
  normalizeMeshMaterial,
  type MeshGeometryType,
  type MeshMaterial,
  type MeshRenderer,
  normalizeMeshRenderer,
} from '@haku/schema'
import * as THREE from 'three'

function resolveParams(type: MeshGeometryType, params: Record<string, number>): Record<string, number> {
  return { ...defaultGeometryParams(type), ...params }
}

export function createGeometry(type: MeshGeometryType, params: Record<string, number> = {}): THREE.BufferGeometry {
  const p = resolveParams(type, params)

  switch (type) {
    case 'ModelGeometry':
      return new THREE.BoxGeometry(0.001, 0.001, 0.001)
    case 'BoxGeometry':
      return new THREE.BoxGeometry(p.width, p.height, p.depth)
    case 'SphereGeometry':
      return new THREE.SphereGeometry(p.radius, p.widthSegments, p.heightSegments)
    case 'PlaneGeometry':
      return new THREE.PlaneGeometry(p.width, p.height)
    case 'CylinderGeometry':
      return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, p.radialSegments)
    case 'ConeGeometry':
      return new THREE.ConeGeometry(p.radius, p.height, p.radialSegments)
    case 'TorusGeometry':
      return new THREE.TorusGeometry(p.radius, p.tube, p.radialSegments, p.tubularSegments)
    case 'RingGeometry':
      return new THREE.RingGeometry(p.innerRadius, p.outerRadius, p.thetaSegments)
    case 'CapsuleGeometry':
      return new THREE.CapsuleGeometry(p.radius, p.length, p.capSegments, p.radialSegments)
    default:
      return new THREE.BoxGeometry(1, 1, 1)
  }
}

type EditableMaterial = THREE.Material & {
  color?: THREE.Color
  metalness?: number
  roughness?: number
  wireframe?: boolean
  opacity?: number
  transparent?: boolean
  depthWrite?: boolean
  transmission?: number
  side?: THREE.Side
}

export function applyMaterial(material: THREE.Material, data: MeshMaterial): void {
  const normalized = normalizeMeshMaterial(data)
  if (normalized.materialType !== 'standard') return
  const m = material as EditableMaterial
  const transparent = normalized.transparent || normalized.opacity < 1

  if (m.color) m.color.set(normalized.color)
  if (typeof m.metalness === 'number') m.metalness = normalized.metalness
  if (typeof m.roughness === 'number') m.roughness = normalized.roughness
  if (typeof m.wireframe === 'boolean') m.wireframe = normalized.wireframe

  m.opacity = normalized.opacity
  m.transparent = transparent
  m.depthWrite = !transparent
  m.side = transparent ? THREE.DoubleSide : THREE.FrontSide

  if (transparent && typeof m.transmission === 'number' && m.transmission > 0) {
    m.transmission = 0
  }

  m.needsUpdate = true
}

export function createMaterial(material: MeshMaterial): THREE.MeshStandardMaterial {
  const normalized = normalizeMeshMaterial(material)
  if (normalized.materialType !== 'standard') {
    return createMaterial(defaultMaterialProperties('standard'))
  }
  const result = new THREE.MeshStandardMaterial({
    color: normalized.color,
    metalness: normalized.metalness,
    roughness: normalized.roughness,
    wireframe: normalized.wireframe,
    opacity: normalized.opacity,
    transparent: normalized.transparent || normalized.opacity < 1,
  })
  applyMaterial(result, normalized)
  return result
}

export function createMeshFromRenderer(data: MeshRenderer | unknown): THREE.Object3D {
  const meshRenderer = normalizeMeshRenderer(data)
  if (meshRenderer.geometryType === 'ModelGeometry') {
    return new THREE.Group()
  }
  return new THREE.Mesh(
    createGeometry(meshRenderer.geometryType, meshRenderer.geometryParams),
    createMaterial(meshRenderer.material),
  )
}

function applyMaterialToMesh(mesh: THREE.Mesh, meshRenderer: MeshRenderer): void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  let applied = false

  for (const material of materials) {
    if ('color' in material) {
      applyMaterial(material, meshRenderer.material)
      applied = true
    }
  }

  if (!applied) {
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => material.dispose())
    } else {
      mesh.material.dispose()
    }
    mesh.material = createMaterial(meshRenderer.material)
  }

  mesh.renderOrder =
    meshRenderer.material.transparent || meshRenderer.material.opacity < 1 ? 1 : 0
}

export function rebuildMesh(mesh: THREE.Mesh, data: MeshRenderer | unknown): void {
  const meshRenderer = normalizeMeshRenderer(data)
  mesh.geometry.dispose()
  mesh.geometry = createGeometry(meshRenderer.geometryType, meshRenderer.geometryParams)
  applyMaterialToMesh(mesh, meshRenderer)
}

export function updateMeshMaterial(mesh: THREE.Mesh, data: MeshRenderer | unknown): void {
  applyMaterialToMesh(mesh, normalizeMeshRenderer(data))
}

export { GEOMETRY_PARAM_SPECS, defaultGeometryParams, normalizeMeshRenderer }
