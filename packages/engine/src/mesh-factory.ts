import {
  GEOMETRY_PARAM_SPECS,
  defaultGeometryParams,
  defaultMaterialProperties,
  normalizeMeshMaterial,
  type MaterialType,
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
  clearcoat?: number
  clearcoatRoughness?: number
  thickness?: number
  ior?: number
  attenuationColor?: THREE.Color
  attenuationDistance?: number
  flatShading?: boolean
  depthPacking?: THREE.DepthPackingStrategies
}

function applyCommonMaterialProps(m: EditableMaterial, data: MeshMaterial): void {
  const transparent =
    ('transparent' in data && data.transparent) || ('opacity' in data && data.opacity < 1)

  if ('color' in data && m.color) m.color.set(data.color)
  if ('opacity' in data) m.opacity = data.opacity
  if ('transparent' in data) m.transparent = transparent
  if ('wireframe' in data && typeof m.wireframe === 'boolean') m.wireframe = data.wireframe

  m.transparent = transparent
  m.depthWrite = !transparent
  m.side = transparent ? THREE.DoubleSide : THREE.FrontSide
  m.needsUpdate = true
}

function createStandardMaterial(data: MeshMaterial): THREE.MeshStandardMaterial {
  const normalized = normalizeMeshMaterial(data)
  if (normalized.materialType !== 'standard') {
    return createMaterial(defaultMaterialProperties('standard')) as THREE.MeshStandardMaterial
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

function createBasicMaterial(data: MeshMaterial): THREE.MeshBasicMaterial {
  const normalized = normalizeMeshMaterial(data)
  if (normalized.materialType !== 'basic') {
    return createBasicMaterial(defaultMaterialProperties('basic'))
  }
  const result = new THREE.MeshBasicMaterial({
    color: normalized.color,
    wireframe: normalized.wireframe,
    opacity: normalized.opacity,
    transparent: normalized.transparent || normalized.opacity < 1,
  })
  applyMaterial(result, normalized)
  return result
}

function createPhysicalMaterial(data: MeshMaterial): THREE.MeshPhysicalMaterial {
  const normalized = normalizeMeshMaterial(data)
  if (normalized.materialType !== 'physical') {
    return createPhysicalMaterial(defaultMaterialProperties('physical'))
  }
  const result = new THREE.MeshPhysicalMaterial({
    color: normalized.color,
    metalness: normalized.metalness,
    roughness: normalized.roughness,
    wireframe: normalized.wireframe,
    opacity: normalized.opacity,
    transparent: normalized.transparent || normalized.opacity < 1,
    clearcoat: normalized.clearcoat,
    clearcoatRoughness: normalized.clearcoatRoughness,
    transmission: normalized.transmission,
    thickness: normalized.thickness,
    ior: normalized.ior,
    attenuationColor: normalized.attenuationColor,
    attenuationDistance: normalized.attenuationDistance,
  })
  applyMaterial(result, normalized)
  return result
}

function createToonMaterial(data: MeshMaterial): THREE.MeshToonMaterial {
  const normalized = normalizeMeshMaterial(data)
  if (normalized.materialType !== 'toon') {
    return createToonMaterial(defaultMaterialProperties('toon'))
  }
  const result = new THREE.MeshToonMaterial({
    color: normalized.color,
    opacity: normalized.opacity,
    transparent: normalized.transparent || normalized.opacity < 1,
  })
  applyMaterial(result, normalized)
  return result
}

function createMatcapMaterial(data: MeshMaterial): THREE.MeshMatcapMaterial {
  const normalized = normalizeMeshMaterial(data)
  if (normalized.materialType !== 'matcap') {
    return createMatcapMaterial(defaultMaterialProperties('matcap'))
  }
  const result = new THREE.MeshMatcapMaterial({
    color: normalized.color,
    opacity: normalized.opacity,
  })
  applyMaterial(result, normalized)
  return result
}

function createNormalMaterial(data: MeshMaterial): THREE.MeshNormalMaterial {
  const normalized = normalizeMeshMaterial(data)
  if (normalized.materialType !== 'normal') {
    return createNormalMaterial(defaultMaterialProperties('normal'))
  }
  const result = new THREE.MeshNormalMaterial({
    flatShading: normalized.flatShading,
    opacity: normalized.opacity,
    transparent: normalized.transparent || normalized.opacity < 1,
  })
  applyMaterial(result, normalized)
  return result
}

function createDepthMaterial(data: MeshMaterial): THREE.MeshDepthMaterial {
  const normalized = normalizeMeshMaterial(data)
  if (normalized.materialType !== 'depth') {
    return createDepthMaterial(defaultMaterialProperties('depth'))
  }
  const packing =
    normalized.depthPacking === 'rgba' ? THREE.RGBADepthPacking : THREE.BasicDepthPacking
  const result = new THREE.MeshDepthMaterial({
    depthPacking: packing,
    opacity: normalized.opacity,
  })
  applyMaterial(result, normalized)
  return result
}

const MATERIAL_FACTORIES: Record<MaterialType, (data: MeshMaterial) => THREE.Material> = {
  standard: createStandardMaterial,
  basic: createBasicMaterial,
  physical: createPhysicalMaterial,
  toon: createToonMaterial,
  matcap: createMatcapMaterial,
  normal: createNormalMaterial,
  depth: createDepthMaterial,
}

export function applyMaterial(material: THREE.Material, data: MeshMaterial): void {
  const normalized = normalizeMeshMaterial(data)
  const m = material as EditableMaterial

  switch (normalized.materialType) {
    case 'standard':
      if (m.color) m.color.set(normalized.color)
      if (typeof m.metalness === 'number') m.metalness = normalized.metalness
      if (typeof m.roughness === 'number') m.roughness = normalized.roughness
      applyCommonMaterialProps(m, normalized)
      break
    case 'basic':
      if (m.color) m.color.set(normalized.color)
      applyCommonMaterialProps(m, normalized)
      break
    case 'physical':
      if (m.color) m.color.set(normalized.color)
      if (typeof m.metalness === 'number') m.metalness = normalized.metalness
      if (typeof m.roughness === 'number') m.roughness = normalized.roughness
      if (typeof m.clearcoat === 'number') m.clearcoat = normalized.clearcoat
      if (typeof m.clearcoatRoughness === 'number') m.clearcoatRoughness = normalized.clearcoatRoughness
      if (typeof m.transmission === 'number') m.transmission = normalized.transmission
      if (typeof m.thickness === 'number') m.thickness = normalized.thickness
      if (typeof m.ior === 'number') m.ior = normalized.ior
      if (m.attenuationColor) m.attenuationColor.set(normalized.attenuationColor)
      if (typeof m.attenuationDistance === 'number') m.attenuationDistance = normalized.attenuationDistance
      applyCommonMaterialProps(m, normalized)
      break
    case 'toon':
      if (m.color) m.color.set(normalized.color)
      applyCommonMaterialProps(m, normalized)
      break
    case 'matcap':
      if (m.color) m.color.set(normalized.color)
      if ('opacity' in normalized) m.opacity = normalized.opacity
      m.needsUpdate = true
      break
    case 'normal':
      if (typeof m.flatShading === 'boolean') m.flatShading = normalized.flatShading
      applyCommonMaterialProps(m, normalized)
      break
    case 'depth':
      if (typeof m.depthPacking === 'number') {
        m.depthPacking =
          normalized.depthPacking === 'rgba' ? THREE.RGBADepthPacking : THREE.BasicDepthPacking
      }
      if ('opacity' in normalized) m.opacity = normalized.opacity
      m.needsUpdate = true
      break
  }
}

export function createMaterial(material: MeshMaterial): THREE.Material {
  const normalized = normalizeMeshMaterial(material)
  return MATERIAL_FACTORIES[normalized.materialType](normalized)
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
  const normalized = normalizeMeshMaterial(meshRenderer.material)
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  let applied = false

  for (const material of materials) {
    if (material.type === getThreeMaterialType(normalized.materialType)) {
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

  mesh.renderOrder = materialHasTransparency(meshRenderer.material) ? 1 : 0
}

function materialHasTransparency(material: MeshMaterial): boolean {
  const transparent = 'transparent' in material && material.transparent
  const opacity = 'opacity' in material ? material.opacity : 1
  return transparent || opacity < 1
}

function getThreeMaterialType(type: MaterialType): string {
  const map: Record<MaterialType, string> = {
    standard: 'MeshStandardMaterial',
    basic: 'MeshBasicMaterial',
    physical: 'MeshPhysicalMaterial',
    toon: 'MeshToonMaterial',
    matcap: 'MeshMatcapMaterial',
    normal: 'MeshNormalMaterial',
    depth: 'MeshDepthMaterial',
  }
  return map[type]
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

export { GEOMETRY_PARAM_SPECS, defaultGeometryParams, normalizeMeshRenderer, MATERIAL_FACTORIES }
