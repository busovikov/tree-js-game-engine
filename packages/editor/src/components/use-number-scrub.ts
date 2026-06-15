import { useCallback, useRef } from 'react'

function clamp(value: number, min?: number, max?: number): number {
  let next = value
  if (min !== undefined) next = Math.max(min, next)
  if (max !== undefined) next = Math.min(max, next)
  return next
}

function snapToStep(value: number, step: number): number {
  const snapped = Math.round(value / step) * step
  const decimals = String(step).includes('.') ? (String(step).split('.')[1]?.length ?? 0) : 0
  return decimals > 0 ? Number(snapped.toFixed(decimals)) : snapped
}

export const SCRUB_LABEL_HINT = 'Drag left or right to adjust. Hold Shift for finer steps.'

export function useNumberScrub({
  value,
  onChange,
  step = 0.1,
  scrubMultiplier = 1,
  min,
  max,
  disabled,
}: {
  value: number
  onChange: (value: number) => void
  step?: number
  scrubMultiplier?: number
  min?: number
  max?: number
  disabled?: boolean
}) {
  const startRef = useRef<{ x: number; value: number } | null>(null)

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (disabled || event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      startRef.current = { x: event.clientX, value }
      event.currentTarget.setPointerCapture(event.pointerId)
      document.body.style.cursor = 'ew-resize'
    },
    [disabled, value],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!startRef.current) return
      event.preventDefault()
      const pixels = event.clientX - startRef.current.x
      const fine = event.shiftKey ? 0.1 : 1
      const delta = pixels * step * fine * 0.05 * scrubMultiplier
      const next = clamp(snapToStep(startRef.current.value + delta, step), min, max)
      onChange(next)
    },
    [max, min, onChange, scrubMultiplier, step],
  )

  const endScrub = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!startRef.current) return
    startRef.current = null
    document.body.style.cursor = ''
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endScrub,
    onPointerCancel: endScrub,
  }
}
