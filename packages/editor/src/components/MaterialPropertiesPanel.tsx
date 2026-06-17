import { memo } from 'react'
import {
  MATERIAL_PROPERTY_SPECS,
  type MaterialPropertySpec,
  type MaterialType,
  type MeshMaterial,
} from '@haku/schema'
import { mergeBooleans, mergeNumbers, mergeStrings, type MixedBool, type MixedNumber } from '../inspector/multi-edit.js'
import { NumberField } from './NumberField.js'
import './mesh-renderer-fields.css'

export type MaterialMixedValues = {
  color?: string | null
  numbers?: Partial<Record<string, MixedNumber>>
  booleans?: Partial<Record<string, MixedBool>>
}

export function buildMaterialMixedValues(materials: MeshMaterial[]): {
  mixedMaterialType: string | null
  mixedMaterial: MaterialMixedValues
} {
  const mixedMaterialType = mergeStrings(materials.map((material) => material.materialType))
  const referenceType = materials[0]?.materialType ?? 'standard'
  const specs = MATERIAL_PROPERTY_SPECS[referenceType]
  const mixedMaterial: MaterialMixedValues = {}

  for (const spec of specs) {
    const values = materials.map(
      (material) => (material as Record<string, string | number | boolean>)[spec.key],
    )
    if (spec.kind === 'color') {
      mixedMaterial.color = mergeStrings(values as string[])
    } else if (spec.kind === 'number') {
      mixedMaterial.numbers ??= {}
      mixedMaterial.numbers[spec.key] = mergeNumbers(values as number[])
    } else {
      mixedMaterial.booleans ??= {}
      mixedMaterial.booleans[spec.key] = mergeBooleans(values as boolean[])
    }
  }

  return { mixedMaterialType, mixedMaterial }
}

function materialValue(
  material: MeshMaterial,
  spec: MaterialPropertySpec,
): string | number | boolean {
  return (material as Record<string, string | number | boolean>)[spec.key] ?? spec.default
}

export const MaterialPropertiesPanel = memo(function MaterialPropertiesPanel({
  materialType,
  material,
  onPatch,
  mixed,
  disabled,
}: {
  materialType: MaterialType
  material: MeshMaterial
  onPatch: (patch: Partial<MeshMaterial>) => void
  mixed?: MaterialMixedValues
  disabled?: boolean
}) {
  const specs = MATERIAL_PROPERTY_SPECS[materialType]
  const basicSpecs = specs.filter((s) => s.group !== 'advanced')
  const advancedSpecs = specs.filter((s) => s.group === 'advanced')

  const patchField = (key: string, value: string | number | boolean) => {
    if (key === 'opacity' && typeof value === 'number') {
      onPatch({
        opacity: value,
        transparent: value < 1 ? true : false,
      } as Partial<MeshMaterial>)
      return
    }
    onPatch({ [key]: value } as Partial<MeshMaterial>)
  }

  const renderSpec = (spec: MaterialPropertySpec) => {
    if (spec.kind === 'color') {
      const mixedColor = mixed?.color
      const colorValue = mixedColor ?? (materialValue(material, spec) as string)
      return (
        <label key={spec.key} className="mesh-field">
          <span className="mesh-field__label" title={spec.hint}>
            {spec.label}
          </span>
          <input
            type="color"
            className="mesh-field__color"
            value={colorValue}
            disabled={disabled || mixedColor === null}
            onChange={(e) => patchField(spec.key, e.target.value)}
          />
          <input
            type="text"
            className={`mesh-field__input mesh-field__input--hex${mixedColor === null ? ' mesh-field__input--mixed' : ''}`}
            value={mixedColor === null ? '' : colorValue}
            placeholder={mixedColor === null ? '—' : undefined}
            disabled={disabled}
            onChange={(e) => patchField(spec.key, e.target.value)}
          />
        </label>
      )
    }

    if (spec.kind === 'number') {
      return (
        <NumberField
          key={spec.key}
          label={spec.label}
          value={materialValue(material, spec) as number}
          mixed={mixed?.numbers?.[spec.key]}
          min={spec.min}
          max={spec.max}
          step={spec.step ?? 0.05}
          hint={spec.hint}
          disabled={disabled}
          onChange={(num) => patchField(spec.key, num)}
        />
      )
    }

    const mixedBool = mixed?.booleans?.[spec.key]
    return (
      <label key={spec.key} className="mesh-field mesh-field--checkbox" title={spec.hint}>
        <input
          type="checkbox"
          checked={mixedBool ?? (materialValue(material, spec) as boolean)}
          ref={(input) => {
            if (input) input.indeterminate = mixedBool === null
          }}
          disabled={disabled}
          onChange={(e) => patchField(spec.key, e.target.checked)}
        />
        <span>{spec.label}</span>
      </label>
    )
  }

  return (
    <>
      {basicSpecs.map(renderSpec)}
      {advancedSpecs.length > 0 && (
        <details className="mesh-renderer-fields__section" style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', color: '#aaa', marginBottom: 8 }}>Advanced</summary>
          {advancedSpecs.map(renderSpec)}
        </details>
      )}
    </>
  )
})
