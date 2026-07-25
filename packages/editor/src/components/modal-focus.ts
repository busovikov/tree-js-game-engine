import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useModalFocus(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const initialFocus = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? dialog
    initialFocus?.focus()

    return () => {
      previouslyFocused?.focus()
    }
  }, [open])

  const onDialogKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeRef.current()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])]
    if (focusable.length === 0) {
      event.preventDefault()
      dialogRef.current?.focus()
      return
    }

    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    } else if (!dialogRef.current?.contains(document.activeElement)) {
      event.preventDefault()
      first.focus()
    }
  }, [])

  return { dialogRef, onDialogKeyDown }
}
