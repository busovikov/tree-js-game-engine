import {
  GEOMETRY_PARAM_SPECS,
  defaultGeometryParams,
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

export function createMaterial(material: MeshMaterial): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: material.color,
    metalness: material.metalness,
    roughness: material.roughness,
    wireframe: material.wireframe,
    opacity: material.opacity,
    transparent: material.transparent || material.opacity < 1,
  })
}

export function applyMaterial(material: THREE.MeshStandardMaterial, data: MeshMaterial): void {
  material.color.set(data.color)
  material.metalness = data.metalness
  material.roughness = data.roughness
  material.wireframe = data.wireframe
  material.opacity = data.opacity
  material.transparent = data.transparent || data.opacity < 1
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

export function rebuildMesh(mesh: THREE.Mesh, data: MeshRenderer | unknown): void {
  const meshRenderer = normalizeMeshRenderer(data)
  mesh.geometry.dispose()
  mesh.geometry = createGeometry(meshRenderer.geometryType, meshRenderer.geometryParams)

  if (mesh.material instanceof THREE.MeshStandardMaterial) {
    applyMaterial(mesh.material, meshRenderer.material)
  } else {
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => m.dispose())
    } else {
      mesh.material.dispose()
    }
    mesh.material = createMaterial(meshRenderer.material)
  }
}

export function updateMeshMaterial(mesh: THREE.Mesh, data: MeshRenderer | unknown): void {
  const meshRenderer = normalizeMeshRenderer(data)
  if (mesh.material instanceof THREE.MeshStandardMaterial) {
    applyMaterial(mesh.material, meshRenderer.material)
    return
  }
  rebuildMesh(mesh, meshRenderer)
}

export { GEOMETRY_PARAM_SPECS, defaultGeometryParams, normalizeMeshRenderer }
