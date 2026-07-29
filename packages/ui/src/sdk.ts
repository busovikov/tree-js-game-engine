import type { AssetId } from '@haku/schema'
import type { UIEventListener } from './ui-document-instance.js'
import type { UIElementId } from './schema.js'
import type { UIElementTarget, UIService } from './ui-service.js'

export interface UISdk {
  setText(target: UIElementTarget, text: string): void
  setVisible(target: UIElementTarget, visible: boolean): void
  setEnabled(target: UIElementTarget, enabled: boolean): void
  setTheme(document: AssetId, theme: UIElementId | string | undefined): void
  onEvent(listener: UIEventListener): () => void
}

export function createUISdk(service: UIService): UISdk {
  return {
    setText: (target, text) => service.setText(target, text),
    setVisible: (target, visible) => service.setVisible(target, visible),
    setEnabled: (target, enabled) => service.setEnabled(target, enabled),
    setTheme: (document, theme) => service.setTheme(document, theme),
    onEvent: (listener) => service.subscribe(listener),
  }
}
