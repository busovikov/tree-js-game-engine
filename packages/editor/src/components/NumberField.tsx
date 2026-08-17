import { memo, useEffect, useState } from 'react'
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
  onScrubStart,
  onScrubEnd,
  inputAriaLabel,
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
  onScrubStart?: () => void
  onScrubEnd?: () => void
  inputAriaLabel?: string
}) {
  const isMixed = mixed === null
  const isDisabled = disabled || isMixed
  const [draft, setDraft] = useState(isMixed ? '' : String(value))

  useEffect(() => {
    setDraft(isMixed ? '' : String(value))
  }, [isMixed, value])

  const parsedDraft = draft.trim() === '' ? Number.NaN : Number(draft)
  const isDraftInvalid =
    draft.trim() !== '' &&
    (!Number.isFinite(parsedDraft) ||
      (min !== undefined && parsedDraft < min) ||
      (max !== undefined && parsedDraft > max))

  const commitDraft = () => {
    if (!Number.isFinite(parsedDraft)) {
      setDraft(String(value))
      return
    }

    const nextValue = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsedDraft))
    setDraft(String(nextValue))
    if (nextValue !== value) onChange(nextValue)
  }

  return (
    <label className="mesh-field" title={hint}>
      <DraggableNumberLabel
        className={labelClassName}
        value={value}
        onChange={onChange}
        step={step}
        min={min}
        max={max}
        disabled={isDisabled}
        hint={hint}
        onScrubStart={onScrubStart}
        onScrubEnd={onScrubEnd}
      >
        {label}
      </DraggableNumberLabel>
      <input
        type="number"
        aria-label={inputAriaLabel}
        className={`${inputClassName}${isMixed ? ` ${inputClassName}--mixed` : ''}`}
        value={draft}
        placeholder={isMixed ? '—' : undefined}
        min={min}
        max={max}
        step={step}
        disabled={isDisabled}
        aria-invalid={isDraftInvalid || undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(String(value))
            event.currentTarget.blur()
          }
        }}
      />
    </label>
  )
})
