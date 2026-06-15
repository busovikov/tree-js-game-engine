import { memo } from 'react'
import type { MixedNumber } from '../inspector/multi-edit.js'
import { DraggableNumberLabel } from './DraggableNumberLabel.js'

export const NumberField = memo(function NumberField({
  label,
  value,
  onChange,
  disabled,
  mixed,
  min,
  max,
  step = 0.1,
  hint,
  labelClassName = 'mesh-field__label',
  inputClassName = 'mesh-field__input',
}: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
  mixed?: MixedNumber
  min?: number
  max?: number
  step?: number
  hint?: string
  labelClassName?: string
  inputClassName?: string
}) {
  const isMixed = mixed === null
  const isDisabled = disabled || isMixed

  return (
    <label className="mesh-field">
      <DraggableNumberLabel
        className={labelClassName}
        value={value}
        onChange={onChange}
        step={step}
        min={min}
        max={max}
        disabled={isDisabled}
        hint={hint}
      >
        {label}
      </DraggableNumberLabel>
      <input
        type="number"
        className={`${inputClassName}${isMixed ? ` ${inputClassName}--mixed` : ''}`}
        value={isMixed ? '' : value}
        placeholder={isMixed ? '—' : undefined}
        min={min}
        max={max}
        step={step}
        disabled={isDisabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
})
