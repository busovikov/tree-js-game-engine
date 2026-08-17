import type { AssetId } from '@haku/schema'
import {
  UIDocumentInstance,
  type UIDocumentInstanceOptions,
  type UIEventListener,
  type UIRuntimeEvent,
  type UIRuntimeTarget,
  type UIValue,
} from './ui-document-instance.js'
import { UIDocumentSchema, type UIDocument, type UIThemeId } from './schema.js'

export interface UIElementTarget {
  readonly document: AssetId
  readonly element: UIRuntimeTarget
}

export class UIService {
  private readonly documents = new Map<AssetId, UIDocument>()
  private readonly instances = new Map<AssetId, UIDocumentInstance>()
  private readonly instanceCleanups = new Map<AssetId, () => void>()
  private readonly listeners = new Set<UIEventListener>()

  register(input: UIDocument): UIDocument {
    const document = UIDocumentSchema.parse(input)
    if (this.documents.has(document.id)) {
      throw new Error(`UI document already registered: ${document.id}`)
    }
    this.documents.set(document.id, document)
    return document
  }

  mount(
    documentId: AssetId,
    host: HTMLElement,
    options: UIDocumentInstanceOptions = {},
  ): UIDocumentInstance {
    if (this.instances.has(documentId)) {
      throw new Error(`UI document is already mounted: ${documentId}`)
    }
    const document = this.documents.get(documentId)
    if (!document) throw new Error(`Unknown UI document: ${documentId}`)
    const instance = new UIDocumentInstance(document, options)
    const unsubscribe = instance.subscribe((event) => this.emit(event))
    try {
      instance.mount(host)
    } catch (error) {
      unsubscribe()
      instance.destroy()
      throw error
    }
    this.instances.set(documentId, instance)
    this.instanceCleanups.set(documentId, unsubscribe)
    return instance
  }

  require(documentId: AssetId): UIDocumentInstance {
    const instance = this.instances.get(documentId)
    if (!instance) throw new Error(`UI document is not mounted: ${documentId}`)
    return instance
  }

  setText(target: UIElementTarget, text: string): void {
    this.require(target.document).setText(target.element, text)
  }

  setVisible(target: UIElementTarget, visible: boolean): void {
    this.require(target.document).setVisible(target.element, visible)
  }

  setEnabled(target: UIElementTarget, enabled: boolean): void {
    this.require(target.document).setEnabled(target.element, enabled)
  }

  getValue(target: UIElementTarget): UIValue {
    return this.require(target.document).getValue(target.element)
  }

  setValue(target: UIElementTarget, value: UIValue): void {
    this.require(target.document).setValue(target.element, value)
  }

  resetValue(target: UIElementTarget): void {
    this.require(target.document).resetValue(target.element)
  }

  setTheme(documentId: AssetId, theme: UIThemeId | string | undefined): void {
    this.require(documentId).setTheme(theme)
  }

  subscribe(listener: UIEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  destroy(documentId: AssetId): void {
    this.instanceCleanups.get(documentId)?.()
    this.instanceCleanups.delete(documentId)
    this.instances.get(documentId)?.destroy()
    this.instances.delete(documentId)
  }

  destroyAll(): void {
    for (const documentId of [...this.instances.keys()]) this.destroy(documentId)
    this.listeners.clear()
  }

  private emit(event: UIRuntimeEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}
