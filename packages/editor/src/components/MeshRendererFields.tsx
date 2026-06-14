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
import './mesh-renderer-fields.css'

function NumberField({
  label,
  value,
  onChange,
  disabled,
  min,
  max,
  step = 0.1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
  min?: number
  max?: number
  step?: number
}) {
  return (
    <label className="mesh-field">
      <span className="mesh-field__label">{label}</span>
      <input
        type="number"
        className="mesh-field__input"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

export const MeshRendererFields = memo(function MeshRendererFields({
  value,
  onChange,
  disabled,
}: {
  value: MeshRenderer
  onChange: (next: MeshRenderer) => void
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

  const patch = (partial: Partial<MeshRenderer>) => onChange({ ...value, ...partial })

  const patchMaterial = (partial: Partial<MeshMaterial>) =>
    onChange({ ...value, material: { ...value.material, ...partial } })

  const patchParam = (key: string, num: number) =>
    onChange({
      ...value,
      geometryParams: { ...value.geometryParams, [key]: num },
    })

  return (
    <div className="mesh-renderer-fields">
      <div className="mesh-renderer-fields__section">
        <div className="mesh-renderer-fields__heading">Geometry</div>
        <label className="mesh-field">
          <span className="mesh-field__label">Type</span>
          <select
            className="mesh-field__input"
            value={value.geometryType}
            disabled={disabled}
            onChange={(e) => {
              const geometryType = e.target.value as MeshGeometryType
              modelLog('inspector.geometry-type', {
                from: value.geometryType,
                to: geometryType,
                modelAsset: value.modelAsset,
              })
              patch({
                geometryType,
                geometryParams: defaultGeometryParams(geometryType),
                modelAsset: geometryType === 'ModelGeometry' ? value.modelAsset : '',
              })
            }}
          >
            {MESH_GEOMETRY_TYPES.map((type) => (
              <option key={type} value={type}>
                {MESH_GEOMETRY_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        {isModel && (
          <label className="mesh-field">
            <span className="mesh-field__label">Model</span>
            <button
              type="button"
              className="mesh-field__model-btn"
              disabled={disabled}
              onClick={() => setPickerOpen(true)}
            >
              {value.modelAsset ? modelAssetFileName(value.modelAsset) : 'Select model…'}
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
                patch({ modelAsset })
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
            onChange={(num) => patchParam(spec.key, num)}
          />
        ))}
      </div>

      <div className="mesh-renderer-fields__section">
        <div className="mesh-renderer-fields__heading">Material</div>
        <label className="mesh-field">
          <span className="mesh-field__label">Color</span>
          <input
            type="color"
            className="mesh-field__color"
            value={value.material.color}
            disabled={disabled}
            onChange={(e) => patchMaterial({ color: e.target.value })}
          />
          <input
            type="text"
            className="mesh-field__input mesh-field__input--hex"
            value={value.material.color}
            disabled={disabled}
            onChange={(e) => patchMaterial({ color: e.target.value })}
          />
        </label>

        <NumberField
          label="Metalness"
          value={value.material.metalness}
          min={0}
          max={1}
          step={0.05}
          disabled={disabled}
          onChange={(num) => patchMaterial({ metalness: num })}
        />
        <NumberField
          label="Roughness"
          value={value.material.roughness}
          min={0}
          max={1}
          step={0.05}
          disabled={disabled}
          onChange={(num) => patchMaterial({ roughness: num })}
        />
        <NumberField
          label="Opacity"
          value={value.material.opacity}
          min={0}
          max={1}
          step={0.05}
          disabled={disabled}
          onChange={(num) =>
            patchMaterial({
              opacity: num,
              transparent: num < 1 ? true : value.material.transparent,
            })
          }
        />

        <label className="mesh-field mesh-field--checkbox">
          <input
            type="checkbox"
            checked={value.material.wireframe}
            disabled={disabled}
            onChange={(e) => patchMaterial({ wireframe: e.target.checked })}
          />
          <span>Wireframe</span>
        </label>
        <label className="mesh-field mesh-field--checkbox">
          <input
            type="checkbox"
            checked={value.material.transparent}
            disabled={disabled}
            onChange={(e) => patchMaterial({ transparent: e.target.checked })}
          />
          <span>Transparent</span>
        </label>
      </div>
    </div>
  )
})
