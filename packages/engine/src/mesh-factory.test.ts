import { describe, expect, it } from 'vitest'
import { defaultMaterialProperties } from '@haku/schema'
import * as THREE from 'three'
import { createMaterial } from './mesh-factory.js'

const MATERIAL_TYPES = ['standard', 'basic', 'physical', 'toon', 'matcap', 'normal', 'depth'] as const

describe('mesh-factory createMaterial', () => {
  for (const type of MATERIAL_TYPES) {
    it(`creates ${type} material`, () => {
      const data = defaultMaterialProperties(type)
      const material = createMaterial(data)
      const expectedClass = {
        standard: THREE.MeshStandardMaterial,
        basic: THREE.MeshBasicMaterial,
        physical: THREE.MeshPhysicalMaterial,
        toon: THREE.MeshToonMaterial,
        matcap: THREE.MeshMatcapMaterial,
        normal: THREE.MeshNormalMaterial,
        depth: THREE.MeshDepthMaterial,
      }[type]
      expect(material).toBeInstanceOf(expectedClass)
    })
  }
})
