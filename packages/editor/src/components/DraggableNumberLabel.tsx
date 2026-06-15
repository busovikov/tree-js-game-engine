import { memo, type ReactNode } from 'react'
import { SCRUB_LABEL_HINT, useNumberScrub } from './use-number-scrub.js'
import './scrub-label.css'

export const DraggableNumberLabel = memo(function DraggableNumberLabel({
  children,
  value,
  onChange,
  step = 0.1,
  scrubMultiplier = 1,
  min,
  max,
  disabled,
  hint,
  className,
}: {
  children: ReactNode
  value: number
  onChange: (value: number) => void
  step?: number
  scrubMultiplier?: number
  min?: number
  max?: number
  disabled?: boolean
  hint?: string
  className?: string
}) {
  const scrub = useNumberScrub({ value, onChange, step, scrubMultiplier, min, max, disabled })

  return (
    <span
      className={[
        'haku-scrub-label',
        disabled ? 'haku-scrub-label--disabled' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={disabled ? hint : hint ? `${hint} ${SCRUB_LABEL_HINT}` : SCRUB_LABEL_HINT}
      {...(disabled ? {} : scrub)}
    >
      {children}
    </span>
  )
})
