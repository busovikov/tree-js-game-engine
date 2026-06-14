import { memo } from 'react'
import { LightSchema, type Light } from '@haku/schema'
import { AngleRangeSlider } from './AngleRangeSlider.js'
import './mesh-renderer-fields.css'

const LIGHT_TYPES: Light['type'][] = ['directional', 'point', 'spot']

function NumberField({
  label,
  value,
  onChange,
  disabled,
  min,
  max,
  step = 0.1,
  hint,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  hint?: string
}) {
  return (
    <label className="mesh-field" title={hint}>
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

export function normalizeLight(data: unknown): Light {
  return LightSchema.parse(data)
}

function switchLightType(current: Light, type: Light['type']): Light {
  const base = { color: current.color, intensity: current.intensity }
  switch (type) {
    case 'directional':
      return { ...base, type: 'directional' }
    case 'point':
      return {
        ...base,
        type: 'point',
        distance: current.type === 'point' ? current.distance : 10,
        decay: current.type === 'point' ? current.decay : 2,
      }
    case 'spot':
      return {
        ...base,
        type: 'spot',
        distance: current.type === 'spot' ? current.distance : 15,
        decay: current.type === 'spot' ? current.decay : 2,
        outerAngle: current.type === 'spot' ? current.outerAngle : 45,
        innerAngle: current.type === 'spot' ? current.innerAngle : 22.5,
      }
  }
}

export const LightFields = memo(function LightFields({
  value,
  onChange,
  disabled,
}: {
  value: Light
  onChange: (next: Light) => void
  disabled?: boolean
}) {
  const patch = (partial: Partial<Light>) => onChange({ ...value, ...partial } as Light)

  return (
    <div className="mesh-renderer-fields">
      <div className="mesh-renderer-fields__section">
        <label className="mesh-field">
          <span className="mesh-field__label">Type</span>
          <select
            className="mesh-field__input"
            value={value.type}
            disabled={disabled}
            onChange={(e) => onChange(switchLightType(value, e.target.value as Light['type']))}
          >
            {LIGHT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label className="mesh-field">
          <span className="mesh-field__label">Color</span>
          <input
            type="color"
            className="mesh-field__color"
            value={value.color}
            disabled={disabled}
            onChange={(e) => patch({ color: e.target.value })}
          />
          <input
            type="text"
            className="mesh-field__input mesh-field__input--hex"
            value={value.color}
            disabled={disabled}
            onChange={(e) => patch({ color: e.target.value })}
          />
        </label>

        <NumberField
          label="Intensity"
          value={value.intensity}
          min={0}
          step={0.05}
          disabled={disabled}
          onChange={(intensity) => patch({ intensity: Math.max(0, intensity) })}
        />
      </div>

      {value.type === 'directional' && (
        <div className="mesh-renderer-fields__section">
          <div className="mesh-renderer-fields__heading">Directional</div>
          <p style={{ margin: 0, fontSize: 11, color: '#888', lineHeight: 1.4 }}>
            Direction follows entity rotation. Use the rotate gizmo or rotation in Transform.
          </p>
        </div>
      )}

      {value.type === 'point' && (
        <div className="mesh-renderer-fields__section">
          <div className="mesh-renderer-fields__heading">Point</div>
          <NumberField
            label="Distance"
            value={value.distance}
            min={0}
            step={0.5}
            disabled={disabled}
            hint="0 = infinite range"
            onChange={(distance) => patch({ distance: Math.max(0, distance) })}
          />
          <NumberField
            label="Decay"
            value={value.decay}
            min={0}
            step={0.1}
            disabled={disabled}
            onChange={(decay) => patch({ decay: Math.max(0, decay) })}
          />
        </div>
      )}

      {value.type === 'spot' && (
        <div className="mesh-renderer-fields__section">
          <div className="mesh-renderer-fields__heading">Spot</div>
          <NumberField
            label="Distance"
            value={value.distance}
            min={0}
            step={0.5}
            disabled={disabled}
            hint="0 = infinite range"
            onChange={(distance) => patch({ distance: Math.max(0, distance) })}
          />
          <AngleRangeSlider
            label="Inner / Outer"
            inner={value.innerAngle}
            outer={value.outerAngle}
            min={0}
            max={179}
            step={0.1}
            disabled={disabled}
            onChange={(innerAngle, outerAngle) => patch({ innerAngle, outerAngle })}
          />
          <NumberField
            label="Decay"
            value={value.decay}
            min={0}
            step={0.1}
            disabled={disabled}
            onChange={(decay) => patch({ decay: Math.max(0, decay) })}
          />
          <p style={{ margin: 0, fontSize: 11, color: '#888', lineHeight: 1.4 }}>
            Gizmo shows a sphere sector. Green ring = inner/outer cone boundary. Direction: local -Z.
          </p>
        </div>
      )}
    </div>
  )
})
