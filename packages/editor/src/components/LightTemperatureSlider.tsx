import { memo, useCallback } from 'react'
import {
  LIGHT_TEMPERATURE_DEFAULT,
  LIGHT_TEMPERATURE_MAX,
  LIGHT_TEMPERATURE_MIN,
  kelvinToHex,
} from '@haku/schema'
import './light-temperature-slider.css'

export const LightTemperatureSlider = memo(function LightTemperatureSlider({
  value,
  disabled,
  onChange,
}: {
  value: number
  disabled?: boolean
  onChange: (kelvin: number) => void
}) {
  const span = LIGHT_TEMPERATURE_MAX - LIGHT_TEMPERATURE_MIN
  const fillPct = ((value - LIGHT_TEMPERATURE_MIN) / span) * 100

  const onSliderChange = useCallback(
    (next: number) => {
      onChange(Math.max(LIGHT_TEMPERATURE_MIN, Math.min(LIGHT_TEMPERATURE_MAX, next)))
    },
    [onChange],
  )

  return (
    <div className="light-temperature">
      <span className="light-temperature__label">Temperature</span>
      <input
        type="number"
        className="light-temperature__value"
        value={Math.round(value)}
        min={LIGHT_TEMPERATURE_MIN}
        max={LIGHT_TEMPERATURE_MAX}
        step={50}
        disabled={disabled}
        onChange={(e) => onSliderChange(Number(e.target.value))}
      />
      <div className="light-temperature__track">
        <div className="light-temperature__gradient" aria-hidden="true" />
        <div
          className="light-temperature__swatch"
          style={{ left: `${fillPct}%`, backgroundColor: kelvinToHex(value) }}
          aria-hidden="true"
        />
        <input
          type="range"
          className="light-temperature__slider"
          min={LIGHT_TEMPERATURE_MIN}
          max={LIGHT_TEMPERATURE_MAX}
          step={50}
          value={value}
          disabled={disabled}
          onChange={(e) => onSliderChange(Number(e.target.value))}
        />
      </div>
      <span className="light-temperature__unit">K</span>
    </div>
  )
})

export { LIGHT_TEMPERATURE_DEFAULT }
