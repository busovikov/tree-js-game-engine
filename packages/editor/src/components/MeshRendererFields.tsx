import { memo, useEffect, useState } from 'react'
import {
  GEOMETRY_PARAM_SPECS,
  MESH_GEOMETRY_TYPES,
  MESH_GEOMETRY_TYPE_LABELS,
  defaultGeometryParams,
  type MeshGeometryType,
  type MeshMaterial,
  type MeshRenderer,
} from '@haku/schema'
import { modelLog } from '@haku/engine'
import { projectService } from '../services/project-service.js'
import { ModelPickerDialog } from './ModelPickerDialog.js'
import { modelAssetFileName } from './model-picker-utils.js'
import type { MixedBool, MixedNumber } from '../inspector/multi-edit.js'
import { NumberField } from './NumberField.js'
import './mesh-renderer-fields.css'

export const MeshRendererFields = memo(function MeshRendererFields({
  value,
  onChange,
  onPatch,
  onMaterialPatch,
  onGeometryTypeChange,
  onModelAssetChange,
  onGeometryParamChange,
  mixedGeometryType,
  mixedModelAsset,
  mixedMaterialColor,
  mixedMaterialNumber,
  mixedMaterialBool,
  disabled,
}: {
  value: MeshRenderer
  onChange?: (next: MeshRenderer) => void
  onPatch?: (patch: Partial<MeshRenderer>) => void
  onMaterialPatch?: (patch: Partial<MeshMaterial>) => void
  onGeometryTypeChange?: (geometryType: MeshGeometryType) => void
  onModelAssetChange?: (modelAsset: string) => void
  onGeometryParamChange?: (key: string, value: number) => void
  mixedGeometryType?: string | null
  mixedModelAsset?: string | null
  mixedMaterialColor?: string | null
  mixedMaterialNumber?: {
    metalness?: MixedNumber
    roughness?: MixedNumber
    opacity?: MixedNumber
  }
  mixedMaterialBool?: {
    wireframe?: MixedBool
    transparent?: MixedBool
  }
  disabled?: boolean
}) {
  const paramSpecs = GEOMETRY_PARAM_SPECS[value.geometryType]
  const isModel = value.geometryType === 'ModelGeometry'
  const [modelAssets, setModelAssets] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void projectService.listModelAssets().then((assets) => {
      if (!cancelled) setModelAssets(assets)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!pickerOpen) return
    void projectService.listModelAssets().then(setModelAssets)
  }, [pickerOpen])

  const patch = (partial: Partial<MeshRenderer>) => {
    if (onPatch) {
      onPatch(partial)
      return
    }
    onChange?.({ ...value, ...partial })
  }

  const patchMaterial = (partial: Partial<MeshMaterial>) => {
    if (onMaterialPatch) {
      onMaterialPatch(partial)
      return
    }
    onChange?.({ ...value, material: { ...value.material, ...partial } })
  }

  const patchParam = (key: string, num: number) => {
    if (onGeometryParamChange) {
      onGeometryParamChange(key, num)
      return
    }
    onChange?.({
      ...value,
      geometryParams: { ...value.geometryParams, [key]: num },
    })
  }

  const setGeometryType = (geometryType: MeshGeometryType) => {
    modelLog('inspector.geometry-type', {
      from: value.geometryType,
      to: geometryType,
      modelAsset: value.modelAsset,
    })
    if (onGeometryTypeChange) {
      onGeometryTypeChange(geometryType)
      return
    }
    patch({
      geometryType,
      geometryParams: defaultGeometryParams(geometryType),
      modelAsset: geometryType === 'ModelGeometry' ? value.modelAsset : '',
    })
  }

  return (
    <div className="mesh-renderer-fields">
      <div className="mesh-renderer-fields__section">
        <div className="mesh-renderer-fields__heading">Geometry</div>
        <label className="mesh-field">
          <span className="mesh-field__label" title="Mesh primitive or imported model.">
            Type
          </span>
          <select
            className={`mesh-field__input${mixedGeometryType === null ? ' mesh-field__input--mixed' : ''}`}
            value={mixedGeometryType === null ? '' : value.geometryType}
            disabled={disabled}
            onChange={(e) => setGeometryType(e.target.value as MeshGeometryType)}
          >
            {mixedGeometryType === null && <option value="">—</option>}
            {MESH_GEOMETRY_TYPES.map((type) => (
              <option key={type} value={type}>
                {MESH_GEOMETRY_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        {isModel && (
          <label className="mesh-field">
            <span className="mesh-field__label" title="GLTF model asset from the project.">
              Model
            </span>
            <button
              type="button"
              className={`mesh-field__model-btn${mixedModelAsset === null ? ' mesh-field__model-btn--mixed' : ''}`}
              disabled={disabled}
              onClick={() => setPickerOpen(true)}
            >
              {mixedModelAsset === null
                ? '—'
                : value.modelAsset
                  ? modelAssetFileName(value.modelAsset)
                  : 'Select model…'}
            </button>
            <ModelPickerDialog
              open={pickerOpen}
              assets={modelAssets}
              selected={value.modelAsset}
              onSelect={(modelAsset) => {
                modelLog('inspector.model-selected', {
                  previous: value.modelAsset,
                  next: modelAsset,
                })
                if (onModelAssetChange) {
                  onModelAssetChange(modelAsset)
                } else {
                  patch({ modelAsset })
                }
              }}
              onClose={() => setPickerOpen(false)}
            />
          </label>
        )}

        {!isModel &&
          paramSpecs.map((spec) => (
            <NumberField
              key={spec.key}
              label={spec.label}
              value={value.geometryParams[spec.key] ?? spec.default}
              min={spec.min}
              max={spec.max}
              step={spec.step ?? (Number.isInteger(spec.default) ? 1 : 0.1)}
              disabled={disabled}
              hint={`${spec.label} geometry parameter.`}
              onChange={(num) => patchParam(spec.key, num)}
            />
          ))}
      </div>

      <div className="mesh-renderer-fields__section">
        <div className="mesh-renderer-fields__heading">Material</div>
        <label className="mesh-field">
          <span className="mesh-field__label" title="Base color of the material.">
            Color
          </span>
          <input
            type="color"
            className="mesh-field__color"
            value={mixedMaterialColor ?? value.material.color}
            disabled={disabled || mixedMaterialColor === null}
            onChange={(e) => patchMaterial({ color: e.target.value })}
          />
          <input
            type="text"
            className={`mesh-field__input mesh-field__input--hex${mixedMaterialColor === null ? ' mesh-field__input--mixed' : ''}`}
            value={mixedMaterialColor === null ? '' : value.material.color}
            placeholder={mixedMaterialColor === null ? '—' : undefined}
            disabled={disabled}
            onChange={(e) => patchMaterial({ color: e.target.value })}
          />
        </label>

        <NumberField
          label="Metalness"
          value={value.material.metalness}
          mixed={mixedMaterialNumber?.metalness}
          min={0}
          max={1}
          step={0.05}
          hint="How metallic the surface appears (0–1)."
          disabled={disabled}
          onChange={(num) => patchMaterial({ metalness: num })}
        />
        <NumberField
          label="Roughness"
          value={value.material.roughness}
          mixed={mixedMaterialNumber?.roughness}
          min={0}
          max={1}
          step={0.05}
          disabled={disabled}
          hint="Surface roughness (0 = mirror, 1 = fully rough)."
          onChange={(num) => patchMaterial({ roughness: num })}
        />
        <NumberField
          label="Opacity"
          value={value.material.opacity}
          mixed={mixedMaterialNumber?.opacity}
          min={0}
          max={1}
          step={0.05}
          hint="Material opacity (0 = transparent, 1 = opaque)."
          disabled={disabled}
          onChange={(num) =>
            patchMaterial({
              opacity: num,
              transparent: num < 1 ? true : false,
            })
          }
        />

        <label className="mesh-field mesh-field--checkbox" title="Render mesh edges only.">
          <input
            type="checkbox"
            checked={mixedMaterialBool?.wireframe ?? value.material.wireframe}
            ref={(input) => {
              if (input) input.indeterminate = mixedMaterialBool?.wireframe === null
            }}
            disabled={disabled}
            onChange={(e) => patchMaterial({ wireframe: e.target.checked })}
          />
          <span>Wireframe</span>
        </label>
        <label className="mesh-field mesh-field--checkbox" title="Enable alpha blending for transparency.">
          <input
            type="checkbox"
            checked={mixedMaterialBool?.transparent ?? value.material.transparent}
            ref={(input) => {
              if (input) input.indeterminate = mixedMaterialBool?.transparent === null
            }}
            disabled={disabled}
            onChange={(e) => patchMaterial({ transparent: e.target.checked })}
          />
          <span>Transparent</span>
        </label>
      </div>
    </div>
  )
})
