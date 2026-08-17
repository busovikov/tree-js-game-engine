import type { AssetId } from '@haku/schema'
import type { UIEventListener, UIValue } from './ui-document-instance.js'
import type { UIThemeId } from './schema.js'
import type { UIElementTarget, UIService } from './ui-service.js'

export interface UISdk {
  setText(target: UIElementTarget, text: string): void
  setVisible(target: UIElementTarget, visible: boolean): void
  setEnabled(target: UIElementTarget, enabled: boolean): void
  getValue(target: UIElementTarget): UIValue
  setValue(target: UIElementTarget, value: UIValue): void
  resetValue(target: UIElementTarget): void
  setTheme(document: AssetId, theme: UIThemeId | string | undefined): void
  onEvent(listener: UIEventListener): () => void
}

export function createUISdk(service: UIService): UISdk {
  return {
    setText: (target, text) => service.setText(target, text),
    setVisible: (target, visible) => service.setVisible(target, visible),
    setEnabled: (target, enabled) => service.setEnabled(target, enabled),
    getValue: (target) => service.getValue(target),
    setValue: (target, value) => service.setValue(target, value),
    resetValue: (target) => service.resetValue(target),
    setTheme: (document, theme) => service.setTheme(document, theme),
    onEvent: (listener) => service.subscribe(listener),
  }
}
