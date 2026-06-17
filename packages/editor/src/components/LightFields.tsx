import { memo } from 'react'
import { LightSchema, kelvinToHex, type Light } from '@haku/schema'
import { AngleRangeSlider } from './AngleRangeSlider.js'
import { LightTemperatureSlider, LIGHT_TEMPERATURE_DEFAULT } from './LightTemperatureSlider.js'
import { NumberField } from './NumberField.js'
import './mesh-renderer-fields.css'

const LIGHT_TYPES: Light['type'][] = ['directional', 'point', 'spot']

export function normalizeLight(data: unknown): Light {
  return LightSchema.parse(data)
}

function switchLightType(current: Light, type: Light['type']): Light {
  if (current.type === type) return current
  return LightSchema.parse({
    color: current.color,
    intensity: current.intensity,
    colorTemperature: current.colorTemperature,
    castShadow: 'castShadow' in current ? current.castShadow : false,
    type,
    ...(type === 'point'
      ? {
          distance: current.type === 'point' ? current.distance : 10,
          decay: current.type === 'point' ? current.decay : 2,
        }
      : {}),
    ...(type === 'spot'
      ? {
          distance: current.type === 'spot' ? current.distance : 15,
          decay: current.type === 'spot' ? current.decay : 2,
          outerAngle: current.type === 'spot' ? current.outerAngle : 45,
          innerAngle: current.type === 'spot' ? current.innerAngle : 22.5,
        }
      : {}),
  })
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
  const temperature = value.colorTemperature ?? LIGHT_TEMPERATURE_DEFAULT
  const displayColor =
    value.colorTemperature !== undefined ? kelvinToHex(value.colorTemperature) : value.color

  const onTemperatureChange = (colorTemperature: number) => {
    patch({
      colorTemperature,
      color: kelvinToHex(colorTemperature),
    })
  }

  const onManualColorChange = (color: string) => {
    patch({ color, colorTemperature: undefined })
  }

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

        <LightTemperatureSlider
          value={temperature}
          disabled={disabled}
          onChange={onTemperatureChange}
        />

        <label className="mesh-field">
          <span className="mesh-field__label">Color</span>
          <input
            type="color"
            className="mesh-field__color"
            value={displayColor}
            disabled={disabled}
            onChange={(e) => onManualColorChange(e.target.value)}
          />
          <input
            type="text"
            className="mesh-field__input mesh-field__input--hex"
            value={displayColor}
            disabled={disabled}
            onChange={(e) => onManualColorChange(e.target.value)}
          />
        </label>

        <NumberField
          label="Intensity"
          value={value.intensity}
          min={0}
          step={0.05}
          hint="Light brightness multiplier."
          disabled={disabled}
          onChange={(intensity) => patch({ intensity: Math.max(0, intensity) })}
        />

        <label className="mesh-field mesh-field--checkbox">
          <input
            type="checkbox"
            checked={'castShadow' in value ? value.castShadow : false}
            disabled={disabled}
            onChange={(e) => patch({ castShadow: e.target.checked })}
          />
          <span>Cast Shadow</span>
        </label>
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
            hint="Maximum light range. 0 = infinite."
            onChange={(distance) => patch({ distance: Math.max(0, distance) })}
          />
          <NumberField
            label="Decay"
            value={value.decay}
            min={0}
            step={0.1}
            disabled={disabled}
            hint="Physical light falloff exponent."
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
            hint="Maximum light range. 0 = infinite."
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
            hint="Physical light falloff exponent."
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
