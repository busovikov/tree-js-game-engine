const DISCARD_MESSAGE = 'Discard unsaved changes?'

export function confirmDiscardChanges(
  isDirty: boolean,
  confirm: (message: string) => boolean,
): boolean {
  return !isDirty || confirm(DISCARD_MESSAGE)
}

export function prepareBeforeUnload(
  event: Pick<BeforeUnloadEvent, 'preventDefault' | 'returnValue'>,
  isDirty: boolean,
): void {
  if (!isDirty) return
  event.preventDefault()
  event.returnValue = ''
}
