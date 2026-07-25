interface SaveShortcutEvent {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  repeat: boolean
  preventDefault(): void
}

export function handleSaveShortcut(
  event: SaveShortcutEvent,
  canSave: boolean,
  save: () => void,
): boolean {
  if (
    !canSave ||
    event.repeat ||
    event.altKey ||
    !(event.metaKey || event.ctrlKey) ||
    event.key.toLowerCase() !== 's'
  ) {
    return false
  }

  event.preventDefault()
  save()
  return true
}
