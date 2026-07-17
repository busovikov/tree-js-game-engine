import { memo, useEffect, useState } from 'react'
import {
  GEOMETRY_PARAM_SPECS,
  MATERIAL_TYPE_LABELS,
  MATERIAL_TYPES,
  MESH_GEOMETRY_TYPES,
  MESH_GEOMETRY_TYPE_LABELS,
  defaultGeometryParams,
  switchMaterialType,
  type MaterialType,
  type MeshGeometryType,
  type MeshMaterial,
  type MeshRenderer,
} from '@haku/schema'
import { modelLog } from '@haku/engine'
import { projectService } from '../services/project-service.js'
import { MaterialPropertiesPanel, type MaterialMixedValues } from './MaterialPropertiesPanel.js'
import { ModelPickerDialog } from './ModelPickerDialog.js'
import { modelAssetFileName } from './model-picker-utils.js'
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
  mixedMaterialType,
  mixedMaterial,
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
  mixedMaterialType?: string | null
  mixedMaterial?: MaterialMixedValues
  disabled?: boolean
}) {
  const paramSpecs = GEOMETRY_PARAM_SPECS[value.geometryType]
  const isModel = value.geometryType === 'ModelGeometry'
  const materialType = value.material.materialType
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
    onChange?.({ ...value, material: { ...value.material, ...partial } as MeshMaterial })
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

  const setMaterialType = (nextType: MaterialType) => {
    patchMaterial(switchMaterialType(value.material, nextType))
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
              hint={spec.hint ?? `${spec.label} geometry parameter.`}
              onChange={(num) => patchParam(spec.key, num)}
            />
          ))}
      </div>

      <div className="mesh-renderer-fields__section">
        <div className="mesh-renderer-fields__heading">Material</div>
        <label className="mesh-field">
          <span className="mesh-field__label" title="Shader / material model used for rendering.">
            Type
          </span>
          <select
            className={`mesh-field__input${mixedMaterialType === null ? ' mesh-field__input--mixed' : ''}`}
            value={mixedMaterialType === null ? '' : materialType}
            disabled={disabled}
            onChange={(e) => setMaterialType(e.target.value as MaterialType)}
          >
            {mixedMaterialType === null && <option value="">—</option>}
            {MATERIAL_TYPES.map((type) => (
              <option key={type} value={type}>
                {MATERIAL_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        <MaterialPropertiesPanel
          materialType={materialType}
          material={value.material}
          onPatch={patchMaterial}
          mixed={mixedMaterial}
          disabled={disabled}
        />

        <label className="mesh-field mesh-field--checkbox" title="This mesh casts shadows onto other objects.">
          <input
            type="checkbox"
            checked={value.castShadow}
            disabled={disabled}
            onChange={(e) => patch({ castShadow: e.target.checked })}
          />
          <span>Cast Shadow</span>
        </label>
        <label className="mesh-field mesh-field--checkbox" title="Shadows from other objects are drawn on this mesh.">
          <input
            type="checkbox"
            checked={value.receiveShadow}
            disabled={disabled}
            onChange={(e) => patch({ receiveShadow: e.target.checked })}
          />
          <span>Receive Shadow</span>
        </label>
      </div>
    </div>
  )
})
