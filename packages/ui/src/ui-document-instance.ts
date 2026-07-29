import type { AssetRef } from '@haku/schema'
import {
  UIDocumentSchema,
  type UIAnchors,
  type UIDocument,
  type UIElement,
  type UIElementId,
  type UILength,
  type UISizing,
  type UIStyle,
} from './schema.js'

export interface UIAssetResolver {
  resolve(reference: AssetRef): string
}

export interface UIActivationEvent {
  readonly type: 'activate'
  readonly documentId: UIDocument['id']
  readonly elementId: UIElementId
  readonly eventId?: UIElementId
  readonly value?: unknown
}

export type UIEventListener = (event: UIActivationEvent) => void

interface UIElementState {
  text?: string
  visible?: boolean
  enabled?: boolean
}

export interface UIDocumentInstanceOptions {
  readonly assets?: UIAssetResolver
  readonly theme?: UIElementId
}

export class UIDocumentInstance {
  readonly document: UIDocument
  private host: HTMLElement | null = null
  private readonly nodes = new Map<UIElementId, HTMLElement>()
  private readonly listeners = new Set<UIEventListener>()
  private readonly state = new Map<UIElementId, UIElementState>()
  private activeTheme: UIElementId | undefined

  constructor(input: UIDocument, private readonly options: UIDocumentInstanceOptions = {}) {
    this.document = UIDocumentSchema.parse(input)
    this.activeTheme = options.theme ?? this.document.defaultTheme
  }

  mount(host: HTMLElement): void {
    if (this.host) throw new Error('UI document instance is already mounted')
    this.host = host
    this.render()
  }

  destroy(): void {
    if (this.host) this.host.replaceChildren()
    this.nodes.clear()
    this.listeners.clear()
    this.host = null
  }

  getElement(id: UIElementId | string): HTMLElement | null {
    return this.nodes.get(id as UIElementId) ?? null
  }

  subscribe(listener: UIEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setText(id: UIElementId | string, text: string): void {
    const element = this.requireElement(id)
    if (element.type !== 'text' && element.type !== 'button') {
      throw new Error(`UI element ${id} does not contain text`)
    }
    this.updateState(element.id, { text })
  }

  setVisible(id: UIElementId | string, visible: boolean): void {
    const element = this.requireElement(id)
    this.updateState(element.id, { visible })
  }

  setEnabled(id: UIElementId | string, enabled: boolean): void {
    const element = this.requireElement(id)
    this.updateState(element.id, { enabled })
  }

  setTheme(theme: UIElementId | string | undefined): void {
    if (theme !== undefined && !this.document.themes.some((candidate) => candidate.id === theme)) {
      throw new Error(`Unknown UI theme: ${theme}`)
    }
    this.activeTheme = theme as UIElementId | undefined
    if (this.host) this.render()
  }

  private updateState(id: UIElementId, patch: UIElementState): void {
    this.state.set(id, { ...this.state.get(id), ...patch })
    const element = this.requireElement(id)
    const node = this.nodes.get(id)
    if (!node) return
    const state = this.state.get(id)
    if (patch.text !== undefined) node.textContent = state?.text ?? ''
    if (patch.visible !== undefined) {
      node.hidden = state?.visible === false || element.visible === false
    }
    if (patch.enabled !== undefined) {
      const enabled = state?.enabled ?? element.enabled
      const ownerDocument = node.ownerDocument
      if (node instanceof ownerDocument.defaultView!.HTMLButtonElement) node.disabled = !enabled
      else node.inert = !enabled
    }
  }

  private render(): void {
    const host = this.host
    if (!host) return
    this.nodes.clear()
    const byId = new Map(this.document.elements.map((element) => [element.id, element]))
    const renderElement = (id: UIElementId): HTMLElement => {
      const element = byId.get(id)
      if (!element) throw new Error(`Unknown UI element: ${id}`)
      const node = this.createNode(element)
      this.nodes.set(id, node)
      if (element.type === 'container') {
        for (const child of element.children) node.append(renderElement(child))
      }
      return node
    }
    host.replaceChildren(renderElement(this.document.root))
  }

  private createNode(element: UIElement): HTMLElement {
    const ownerDocument = this.host?.ownerDocument ?? document
    let node: HTMLElement
    if (element.type === 'container') {
      node = ownerDocument.createElement('div')
      node.style.display = 'flex'
      node.style.flexDirection = element.layout.direction
      node.style.flexWrap = element.layout.wrap ? 'wrap' : 'nowrap'
      node.style.justifyContent = flexAlignment(element.layout.justify)
      node.style.alignItems = flexAlignment(element.layout.align)
      node.style.gap = `${element.layout.gap}px`
    } else if (element.type === 'text') {
      node = ownerDocument.createElement('span')
      node.textContent = this.state.get(element.id)?.text ?? element.text
    } else if (element.type === 'button') {
      const button = ownerDocument.createElement('button')
      button.type = 'button'
      button.textContent = this.state.get(element.id)?.text ?? element.text
      button.addEventListener('click', () => {
        const event: UIActivationEvent = {
          type: 'activate',
          documentId: this.document.id,
          elementId: element.id,
          ...(element.activateEvent ? { eventId: element.activateEvent } : {}),
        }
        for (const listener of this.listeners) listener(event)
      })
      node = button
    } else {
      const image = ownerDocument.createElement('img')
      image.alt = element.alt
      if (!this.options.assets) {
        throw new Error(`UI image ${element.id} requires an asset resolver`)
      }
      image.src = this.options.assets.resolve(element.source)
      node = image
    }

    node.dataset.hakuUiId = element.id
    node.hidden = this.state.get(element.id)?.visible === false || element.visible === false
    const enabled = this.state.get(element.id)?.enabled ?? element.enabled
    if (node instanceof ownerDocument.defaultView!.HTMLButtonElement) node.disabled = !enabled
    else node.inert = !enabled
    applySizing(node.style, element.sizing)
    applyAnchors(node.style, element.anchors)
    applyStyle(node.style, {
      ...element.style,
      ...this.document.themes.find((theme) => theme.id === this.activeTheme)?.styles[element.id],
    })
    applyAccessibility(node, element)
    if (element.id === this.document.root && node.style.position === '') {
      node.style.position = 'relative'
    }
    return node
  }

  private requireElement(id: UIElementId | string): UIElement {
    const element = this.document.elements.find((candidate) => candidate.id === id)
    if (!element) throw new Error(`Unknown UI element: ${id}`)
    return element
  }
}

function flexAlignment(value: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'stretch'): string {
  if (value === 'start' || value === 'end') return `flex-${value}`
  return value
}

function cssLength(value: UILength): string {
  return typeof value === 'number' ? `${value}px` : value
}

function applySizing(style: CSSStyleDeclaration, sizing: UISizing): void {
  for (const property of ['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'] as const) {
    const value = sizing[property]
    if (value !== undefined) style[property] = cssLength(value)
  }
  if (sizing.grow !== undefined) style.flexGrow = String(sizing.grow)
  if (sizing.shrink !== undefined) style.flexShrink = String(sizing.shrink)
  if (sizing.basis !== undefined) style.flexBasis = cssLength(sizing.basis)
}

function applyAnchors(style: CSSStyleDeclaration, anchors: UIAnchors): void {
  if (Object.values(anchors).every((value) => value === undefined)) return
  style.position = 'absolute'
  for (const property of ['left', 'right', 'top', 'bottom'] as const) {
    const value = anchors[property]
    if (value !== undefined) style[property] = cssLength(value)
  }
}

function applyStyle(style: CSSStyleDeclaration, value: UIStyle): void {
  if (value.color !== undefined) style.color = value.color
  if (value.backgroundColor !== undefined) style.backgroundColor = value.backgroundColor
  if (value.fontFamily !== undefined) style.fontFamily = value.fontFamily
  if (value.fontSize !== undefined) style.fontSize = `${value.fontSize}px`
  if (value.fontWeight !== undefined) style.fontWeight = String(value.fontWeight)
  if (value.textAlign !== undefined) style.textAlign = value.textAlign
  if (value.padding !== undefined) style.padding = `${value.padding}px`
  if (value.margin !== undefined) style.margin = `${value.margin}px`
  if (value.borderColor !== undefined) style.borderColor = value.borderColor
  if (value.borderWidth !== undefined) {
    style.borderWidth = `${value.borderWidth}px`
    style.borderStyle = 'solid'
  }
  if (value.borderRadius !== undefined) style.borderRadius = `${value.borderRadius}px`
  if (value.opacity !== undefined) style.opacity = String(value.opacity)
  if (value.cursor !== undefined) style.cursor = value.cursor
  if (value.objectFit !== undefined) style.objectFit = value.objectFit
}

function applyAccessibility(node: HTMLElement, element: UIElement): void {
  const accessibility = element.accessibility
  if (accessibility.label) node.setAttribute('aria-label', accessibility.label)
  if (accessibility.description) node.setAttribute('aria-description', accessibility.description)
  if (accessibility.role) node.setAttribute('role', accessibility.role)
  if (accessibility.live) node.setAttribute('aria-live', accessibility.live)
}
