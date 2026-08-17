import type { UIElement, UIElementId, UIInstanceOverride } from './schema.js'

export interface UIInstanceLocatorLike {
  readonly instancePath: readonly UIElementId[]
  readonly sourceElementId: UIElementId
}

export function uiInstanceLocatorKey(locator: UIInstanceLocatorLike): string {
  if (locator.instancePath.length === 0) {
    throw new Error('UI instance locator requires at least one instance in its path')
  }
  return `${locator.instancePath.join('/')}:${locator.sourceElementId}`
}

export function applyUIInstanceOverride(
  element: UIElement,
  override: UIInstanceOverride | undefined,
): UIElement {
  if (!override) return element
  return {
    ...element,
    ...(override.name !== undefined ? { name: override.name } : {}),
    ...(override.text !== undefined ? { text: override.text } : {}),
    ...(override.value !== undefined ? { value: override.value } : {}),
    ...(override.visible !== undefined ? { visible: override.visible } : {}),
    ...(override.enabled !== undefined ? { enabled: override.enabled } : {}),
    ...(override.style ? { style: { ...element.style, ...override.style } } : {}),
    ...(override.accessibility
      ? { accessibility: { ...element.accessibility, ...override.accessibility } }
      : {}),
    ...(override.events ? { events: { ...element.events, ...override.events } } : {}),
  } as UIElement
}
