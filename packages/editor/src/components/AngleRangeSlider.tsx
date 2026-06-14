import { memo, useCallback } from 'react'
import './angle-range-slider.css'

export const AngleRangeSlider = memo(function AngleRangeSlider({
  label,
  inner,
  outer,
  min = 0,
  max = 179,
  step = 0.1,
  disabled,
  onChange,
}: {
  label: string
  inner: number
  outer: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  onChange: (inner: number, outer: number) => void
}) {
  const span = Math.max(max - min, 1)
  const innerPct = ((inner - min) / span) * 100
  const outerPct = ((outer - min) / span) * 100

  const onInnerChange = useCallback(
    (value: number) => {
      const nextInner = Math.min(value, outer)
      onChange(nextInner, outer)
    },
    [onChange, outer],
  )

  const onOuterChange = useCallback(
    (value: number) => {
      const nextOuter = Math.max(value, inner)
      onChange(inner, nextOuter)
    },
    [onChange, inner],
  )

  return (
    <div className="angle-range">
      <span className="angle-range__label">{label}</span>
      <input
        type="number"
        className="angle-range__value"
        value={Number(inner.toFixed(1))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onInnerChange(Number(e.target.value))}
      />
      <div className="angle-range__track">
        <div
          className="angle-range__fill"
          style={{ left: `${innerPct}%`, width: `${Math.max(outerPct - innerPct, 0)}%` }}
        />
        <input
          type="range"
          className="angle-range__thumb angle-range__thumb--inner"
          min={min}
          max={max}
          step={step}
          value={inner}
          disabled={disabled}
          onChange={(e) => onInnerChange(Number(e.target.value))}
        />
        <input
          type="range"
          className="angle-range__thumb angle-range__thumb--outer"
          min={min}
          max={max}
          step={step}
          value={outer}
          disabled={disabled}
          onChange={(e) => onOuterChange(Number(e.target.value))}
        />
      </div>
      <input
        type="number"
        className="angle-range__value"
        value={Number(outer.toFixed(1))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onOuterChange(Number(e.target.value))}
      />
    </div>
  )
})
