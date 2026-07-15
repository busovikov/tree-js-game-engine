import { describe, expect, it } from 'vitest'
import {
  MAX_PHYSICS_LAYERS,
  bakeLayerCollisionGroups,
  setLayerCollisionSymmetric,
  defaultLayerCollisionMatrix,
  defaultPhysicsLayerNames,
  defaultPhysicsProjectSettings,
  isValidPhysicsLayer,
  resolveColliderPhysicsMaterial,
} from './physics-project-settings.js'

describe('PhysicsProjectSettings', () => {
  it('defaults to 16 named layers and full collision matrix', () => {
    const settings = defaultPhysicsProjectSettings()
    expect(settings.layers).toHaveLength(MAX_PHYSICS_LAYERS)
    expect(settings.layers[0]).toBe('Default')
    expect(settings.layerCollisionMatrix).toHaveLength(MAX_PHYSICS_LAYERS)
    expect(settings.layerCollisionMatrix[0]).toHaveLength(MAX_PHYSICS_LAYERS)
    expect(settings.layerCollisionMatrix[0][0]).toBe(true)
  })

  it('validates layer indices within Rapier limit', () => {
    expect(isValidPhysicsLayer(0)).toBe(true)
    expect(isValidPhysicsLayer(15)).toBe(true)
    expect(isValidPhysicsLayer(16)).toBe(false)
    expect(isValidPhysicsLayer(-1)).toBe(false)
  })

  it('provides symmetric default matrix factory', () => {
    const matrix = defaultLayerCollisionMatrix()
    expect(matrix[3][7]).toBe(matrix[7][3])
  })

  it('updates collision matrix symmetrically', () => {
    const matrix = defaultLayerCollisionMatrix()
    const next = setLayerCollisionSymmetric(matrix, 2, 5, false)
    expect(next[2][5]).toBe(false)
    expect(next[5][2]).toBe(false)
    expect(next[2][2]).toBe(true)
  })

  it('provides 16 default layer names', () => {
    expect(defaultPhysicsLayerNames()).toHaveLength(MAX_PHYSICS_LAYERS)
  })

  it('defaults materials registry with a default asset', () => {
    const settings = defaultPhysicsProjectSettings()
    expect(settings.materials.default).toBeDefined()
    expect(settings.materials.default?.friction).toBe(0.5)
  })

  it('resolves collider material with inline overrides', () => {
    const settings = defaultPhysicsProjectSettings()
    const resolved = resolveColliderPhysicsMaterial(settings, {
      materialId: '',
      friction: 0.9,
    })
    expect(resolved.friction).toBe(0.9)
    expect(resolved.density).toBe(1)
  })

  it('bakes layer index and symmetric matrix into Rapier collision groups', () => {
    const matrix = defaultLayerCollisionMatrix()
    matrix[1][0] = false
    matrix[0][1] = false

    const layer0 = bakeLayerCollisionGroups(0, matrix)
    const layer1 = bakeLayerCollisionGroups(1, matrix)

    expect(layer0 & 0xffff).toBe(0xfffd)
    expect(layer0 >> 16).toBe(1)
    expect(layer1 & 0xffff).toBe(0xfffe)
    expect(layer1 >> 16).toBe(2)
  })
})
