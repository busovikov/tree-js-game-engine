import type { PhysicsMaterialCombine } from './physics-material.js'

/** Rapier `CoefficientCombineRule` numeric values. */
export type RapierMaterialCombineRule = 0 | 1 | 2 | 3

export function physicsMaterialCombineToRapier(
  rule: PhysicsMaterialCombine,
): RapierMaterialCombineRule {
  switch (rule) {
    case 'average':
      return 0
    case 'min':
      return 1
    case 'multiply':
      return 2
    case 'max':
      return 3
  }
}
