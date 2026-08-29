import type { AssetRef } from '@haku/schema'
import { applyUIInstanceOverride, uiInstanceLocatorKey } from './component-instance.js'
import {
  UIDocumentSchema,
  type UIDocument,
  type UIElement,
  type UIElementId,
  type UIEventId,
  type UIPlacement,
  type UISize,
  type UISizing,
  type UIStyle,
  type UIThemeId,
} from './schema.js'

export interface UIAssetResolver {
  resolve(reference: AssetRef): string
}

export type UIEventType = 'activate' | 'input' | 'change' | 'submit' | 'focus' | 'blur'
export type UIValue = string | number | boolean | null

export interface UIInstanceLocator {
  readonly instancePath: readonly UIElementId[]
  readonly sourceElementId: UIElementId
}

export type UIRuntimeTarget = UIElementId | string | UIInstanceLocator

export interface UIRuntimeEvent {
  readonly type: UIEventType
  readonly documentId: UIDocument['id']
  readonly elementId: UIElementId
  readonly bindingId?: UIEventId
  readonly value?: UIValue
  readonly instancePath?: readonly UIElementId[]
  readonly sourceElementId?: UIElementId
}

export type UIEventListener = (event: UIRuntimeEvent) => void

interface RuntimeEntry {
  readonly element: UIElement
  readonly node: HTMLElement
  readonly mountNode: HTMLElement
  readonly key: string
  readonly topLevelId: UIElementId
  readonly instancePath?: readonly UIElementId[]
  readonly sourceElementId?: UIElementId
  readonly defaultValue?: UIValue
  readonly radioGroupKey?: string
  appearanceRoot?: RuntimeEntry
  instanceAliases?: RuntimeEntry[]
}

interface PendingInstanceAlias {
  readonly element: Extract<UIElement, { type: 'instance' }>
  readonly key: string
  readonly topLevelId: UIElementId
  readonly instancePath?: readonly UIElementId[]
  readonly sourceElementId?: UIElementId
}

interface UIElementState {
  text?: string
  visible?: boolean
  enabled?: boolean
  value?: UIValue
}

export interface UIDocumentInstanceOptions {
  readonly assets?: UIAssetResolver
  readonly theme?: UIThemeId | string
}

const NATIVE_CONTROL_TAGS = new Set(['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'])

export class UIDocumentInstance {
  readonly document: UIDocument
  private host: HTMLElement | null = null
  private readonly nodes = new Map<UIElementId, HTMLElement>()
  private readonly instanceNodes = new Map<string, HTMLElement>()
  private readonly entries = new Map<string, RuntimeEntry>()
  private readonly listeners = new Set<UIEventListener>()
  private readonly state = new Map<string, UIElementState>()
  private readonly radioValues = new Map<string, string | null>()
  private activeTheme: UIThemeId | undefined

  constructor(
    input: UIDocument,
    private readonly options: UIDocumentInstanceOptions = {},
  ) {
    this.document = UIDocumentSchema.parse(input)
    const theme = options.theme ?? this.document.defaultTheme
    if (theme !== undefined && !this.document.themes.some((candidate) => candidate.id === theme)) {
      throw new Error(`Unknown UI theme: ${theme}`)
    }
    this.activeTheme = theme as UIThemeId | undefined
  }

  mount(host: HTMLElement): void {
    if (this.host) throw new Error('UI document instance is already mounted')
    const stagedNodes = new Map<UIElementId, HTMLElement>()
    const stagedInstanceNodes = new Map<string, HTMLElement>()
    const stagedEntries = new Map<string, RuntimeEntry>()
    try {
      const root = this.renderDocument(host.ownerDocument, stagedNodes, stagedInstanceNodes, stagedEntries)
      host.replaceChildren(root)
      this.host = host
      copyMap(stagedNodes, this.nodes)
      copyMap(stagedInstanceNodes, this.instanceNodes)
      copyMap(stagedEntries, this.entries)
      this.syncAllRadioGroups()
    } catch (error) {
      this.state.clear()
      this.radioValues.clear()
      throw error
    }
  }

  destroy(): void {
    if (this.host) this.host.replaceChildren()
    this.nodes.clear()
    this.instanceNodes.clear()
    this.entries.clear()
    this.listeners.clear()
    this.state.clear()
    this.radioValues.clear()
    this.host = null
    this.activeTheme = (this.options.theme ?? this.document.defaultTheme) as UIThemeId | undefined
  }

  getElement(id: UIElementId | string): HTMLElement | null {
    return this.nodes.get(id as UIElementId) ?? null
  }

  getInstanceElement(locator: UIInstanceLocator): HTMLElement | null {
    return this.instanceNodes.get(uiInstanceLocatorKey(locator)) ?? null
  }

  subscribe(listener: UIEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setText(target: UIRuntimeTarget, text: string): void {
    const entry = this.requireEntry(target)
    if (entry.element.type !== 'text' && entry.element.type !== 'button') {
      throw new Error(`UI element ${entry.element.id} does not contain text`)
    }
    this.patchState(entry, { text })
    entry.node.textContent = text
  }

  setVisible(target: UIRuntimeTarget, visible: boolean): void {
    const entry = this.requireEntry(target)
    this.patchState(entry, { visible })
    if (!visible && entry.node.ownerDocument.activeElement === entry.node) entry.node.blur()
    this.syncAppearanceVisibility(entry)
  }

  setEnabled(target: UIRuntimeTarget, enabled: boolean): void {
    const entry = this.requireEntry(target)
    this.patchState(entry, { enabled })
    this.syncAppearanceEnabled(entry)
  }

  getValue(target: UIRuntimeTarget): UIValue {
    const entry = this.requireValueEntry(target)
    if (entry.radioGroupKey) return this.radioValues.get(entry.radioGroupKey) ?? null
    return this.state.get(entry.key)?.value ?? entry.defaultValue ?? null
  }

  setValue(target: UIRuntimeTarget, value: UIValue): void {
    const entry = this.requireValueEntry(target)
    this.validateValue(entry, value)
    this.commitValue(entry, value)
  }

  resetValue(target: UIRuntimeTarget): void {
    const entry = this.requireValueEntry(target)
    this.commitValue(entry, entry.defaultValue ?? null)
  }

  setTheme(theme: UIThemeId | string | undefined): void {
    if (theme !== undefined && !this.document.themes.some((candidate) => candidate.id === theme)) {
      throw new Error(`Unknown UI theme: ${theme}`)
    }
    this.activeTheme = theme as UIThemeId | undefined
    const styled = new Set<RuntimeEntry>()
    for (const entry of this.entries.values()) {
      const root = entry.appearanceRoot ?? entry
      if (!styled.has(root)) {
        styled.add(root)
        this.applyVisualStyle(root)
      }
    }
  }

  private renderDocument(
    ownerDocument: Document,
    nodes: Map<UIElementId, HTMLElement>,
    instanceNodes: Map<string, HTMLElement>,
    entries: Map<string, RuntimeEntry>,
  ): HTMLElement {
    const byId = new Map(this.document.elements.map((element) => [element.id, element]))
    const render = (id: UIElementId): HTMLElement => {
      const element = byId.get(id)
      if (!element) throw new Error(`Unknown UI element: ${id}`)
      const node = element.type === 'instance'
        ? this.renderInstance(ownerDocument, element, [element.id], element.id, instanceNodes, entries)
        : this.renderElement(ownerDocument, element, element.id, element.id, undefined, undefined, nodes, instanceNodes, entries)
      if (element.type === 'instance') nodes.set(element.id, node)
      if (isContainer(element)) for (const child of element.children) node.append(render(child))
      return node
    }
    return render(this.document.root)
  }

  private renderInstance(
    ownerDocument: Document,
    instance: Extract<UIElement, { type: 'instance' }>,
    path: readonly UIElementId[],
    topLevelId: UIElementId,
    instanceNodes: Map<string, HTMLElement>,
    entries: Map<string, RuntimeEntry>,
    outerAliases: readonly PendingInstanceAlias[] = [],
  ): HTMLElement {
    const component = this.document.components.find((candidate) => candidate.id === instance.component)
    if (!component) throw new Error(`Unknown UI component: ${instance.component}`)
    const byId = new Map(component.elements.map((element) => [element.id, element]))
    const aliasKey = path.length > 1
      ? uiInstanceLocatorKey({ instancePath: path.slice(0, -1), sourceElementId: instance.id })
      : instance.id
    const alias: PendingInstanceAlias = {
      element: instance,
      key: aliasKey,
      topLevelId,
      ...(path.length > 1
        ? { instancePath: path.slice(0, -1), sourceElementId: instance.id }
        : {}),
    }
    const aliases = [alias, ...outerAliases]
    const renderSource = (sourceId: UIElementId, componentRoot = false): HTMLElement => {
      const source = byId.get(sourceId)
      if (!source) throw new Error(`Unknown UI component element: ${sourceId}`)
      const override = instance.overrides[source.id]
      const effective = applyUIInstanceOverride(source, override)
      if (effective.type === 'instance') {
        return this.renderInstance(
          ownerDocument,
          effective,
          [...path, effective.id],
          topLevelId,
          instanceNodes,
          entries,
          componentRoot ? aliases : [],
        )
      }
      const key = uiInstanceLocatorKey({ instancePath: path, sourceElementId: source.id })
      const node = this.renderElement(
        ownerDocument,
        effective,
        key,
        topLevelId,
        path,
        source.id,
        undefined,
        instanceNodes,
        entries,
      )
      if (componentRoot) {
        const rootEntry = entries.get(key)
        if (!rootEntry) throw new Error(`Missing UI component root runtime entry: ${source.id}`)
        const runtimeAliases: RuntimeEntry[] = aliases.map((instanceAlias) => ({
          ...instanceAlias,
          node: rootEntry.node,
          mountNode: rootEntry.mountNode,
          appearanceRoot: rootEntry,
        }))
        rootEntry.instanceAliases = runtimeAliases
        for (const instanceAlias of runtimeAliases) {
          entries.set(instanceAlias.key, instanceAlias)
          if (instanceAlias.instancePath && instanceAlias.sourceElementId) {
            instanceNodes.set(
              uiInstanceLocatorKey({
                instancePath: instanceAlias.instancePath,
                sourceElementId: instanceAlias.sourceElementId,
              }),
              rootEntry.node,
            )
          }
        }
        this.applyEntryBase(rootEntry)
      }
      if (isContainer(effective)) for (const child of effective.children) node.append(renderSource(child))
      return node
    }
    return renderSource(component.root, true)
  }

  private renderElement(
    ownerDocument: Document,
    element: UIElement,
    key: string,
    topLevelId: UIElementId,
    instancePath: readonly UIElementId[] | undefined,
    sourceElementId: UIElementId | undefined,
    nodes: Map<UIElementId, HTMLElement> | undefined,
    instanceNodes: Map<string, HTMLElement>,
    entries: Map<string, RuntimeEntry>,
  ): HTMLElement {
    const node = createNativeNode(ownerDocument, element, this.options.assets)
    const mountNode = createMountNode(ownerDocument, node, element, key)
    const defaultValue = valueOf(element)
    const radioGroupKey = element.type === 'radio'
      ? `${instancePath?.join('/') ?? 'document'}:${element.group}`
      : undefined
    const entry: RuntimeEntry = {
      element,
      node,
      mountNode,
      key,
      topLevelId,
      ...(instancePath ? { instancePath } : {}),
      ...(sourceElementId ? { sourceElementId } : {}),
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      ...(radioGroupKey ? { radioGroupKey } : {}),
    }
    entries.set(key, entry)
    if (sourceElementId && instancePath) instanceNodes.set(uiInstanceLocatorKey({ instancePath, sourceElementId }), node)
    else nodes?.set(element.id, node)
    if (radioGroupKey && !this.radioValues.has(radioGroupKey)) {
      this.radioValues.set(radioGroupKey, element.type === 'radio' ? element.value : null)
    }
    if (defaultValue !== undefined && !this.state.has(key)) this.state.set(key, { value: defaultValue })
    node.dataset.hakuUiId = topLevelId
    if (sourceElementId && instancePath) {
      node.dataset.hakuUiSourceId = sourceElementId
      node.dataset.hakuUiInstancePath = instancePath.join('/')
    }
    if (element.type !== 'instance') this.applyEntryBase(entry)
    this.bindEvents(entry)
    return mountNode
  }

  private applyEntryBase(entry: RuntimeEntry): void {
    const root = entry.appearanceRoot ?? entry
    const { element, node } = root
    const outer = root.instanceAliases?.at(-1)?.element
    applyLayout(node.style, element)
    applySizing(node.style, outer?.sizing ?? element.sizing)
    applyPlacement(node.style, outer?.placement ?? element.placement, outer?.sizing ?? element.sizing)
    this.applyVisualStyle(root)
    applyAccessibility(
      node,
      Object.assign(
        {},
        element.accessibility,
        ...(root.instanceAliases ?? []).map((alias) => alias.element.accessibility),
      ),
    )
    this.syncAppearanceVisibility(root)
    this.syncAppearanceEnabled(root)
    if (element.id === this.document.root) node.style.position = 'relative'
    this.syncNodeValue(root)
  }

  private applyVisualStyle(entry: RuntimeEntry): void {
    const root = entry.appearanceRoot ?? entry
    clearVisualStyle(root.node.style)
    applyLayout(root.node.style, root.element)
    const themed = this.document.themes.find((theme) => theme.id === this.activeTheme)?.styles[
      root.sourceElementId ?? root.element.id
    ]
    applyStyle(root.node.style, { ...root.element.style, ...themed })
    const theme = this.document.themes.find((candidate) => candidate.id === this.activeTheme)
    for (const alias of root.instanceAliases ?? []) {
      applyStyle(root.node.style, { ...alias.element.style, ...theme?.styles[alias.element.id] })
    }
  }

  private syncAppearanceVisibility(entry: RuntimeEntry): void {
    const root = entry.appearanceRoot ?? entry
    const visible = [root, ...(root.instanceAliases ?? [])].every(
      (candidate) => this.state.get(candidate.key)?.visible ?? candidate.element.visible,
    )
    root.node.hidden = !visible
    root.mountNode.hidden = !visible
  }

  private syncAppearanceEnabled(entry: RuntimeEntry): void {
    const root = entry.appearanceRoot ?? entry
    const enabled = [root, ...(root.instanceAliases ?? [])].every(
      (candidate) => this.state.get(candidate.key)?.enabled ?? candidate.element.enabled,
    )
    applyEnabled(root.node, enabled)
  }

  private bindEvents(entry: RuntimeEntry): void {
    const element = entry.element
    const node = entry.node
    if (element.type === 'button') {
      node.addEventListener('click', () => this.emit(entry, 'activate'))
    } else if (element.type === 'text-input' || element.type === 'text-area') {
      const control = node as HTMLInputElement | HTMLTextAreaElement
      control.addEventListener('input', () => this.userValue(entry, control.value, 'input'))
      control.addEventListener('change', () => this.userValue(entry, control.value, 'change'))
      control.addEventListener('focus', () => this.emit(entry, 'focus'))
      control.addEventListener('blur', () => this.emit(entry, 'blur'))
      if (element.type === 'text-input') {
        control.addEventListener('keydown', (event: Event) => {
          const keyboardEvent = event as KeyboardEvent
          if (keyboardEvent.key === 'Enter') this.emit(entry, 'submit', control.value)
        })
      }
    } else if (element.type === 'checkbox' || element.type === 'switch') {
      const control = node as HTMLInputElement
      control.addEventListener('click', () => this.userValue(entry, control.checked, 'change'))
    } else if (element.type === 'radio') {
      const control = node as HTMLInputElement
      control.addEventListener('click', () => {
        if (control.checked) this.userValue(entry, element.optionValue, 'change')
      })
    } else if (element.type === 'select') {
      const control = node as HTMLSelectElement
      control.addEventListener('change', () => {
        const value = control.value === '' ? null : control.value
        this.commitValue(entry, value)
        if (value !== null) this.emit(entry, 'change', value)
      })
    } else if (element.type === 'slider') {
      const control = node as HTMLInputElement
      control.addEventListener('input', () => this.userValue(entry, Number(control.value), 'input'))
      control.addEventListener('change', () => this.userValue(entry, Number(control.value), 'change'))
    } else if (element.type === 'frame' && element.accessibility.tabIndex !== undefined) {
      node.addEventListener('focus', () => this.emit(entry, 'focus'))
      node.addEventListener('blur', () => this.emit(entry, 'blur'))
    }
  }

  private userValue(entry: RuntimeEntry, value: UIValue, eventType: UIEventType): void {
    this.validateValue(entry, value)
    this.commitValue(entry, value)
    this.emit(entry, eventType, value)
  }

  private emit(entry: RuntimeEntry, type: UIEventType, value?: UIValue): void {
    const binding = (entry.element.events as Partial<Record<UIEventType, UIEventId>>)[type]
    if (!binding) return
    const event: UIRuntimeEvent = {
      type,
      documentId: this.document.id,
      elementId: entry.topLevelId,
      bindingId: binding,
      ...(value !== undefined ? { value } : {}),
      ...(entry.instancePath ? { instancePath: entry.instancePath } : {}),
      ...(entry.sourceElementId ? { sourceElementId: entry.sourceElementId } : {}),
    }
    for (const listener of this.listeners) listener(event)
  }

  private commitValue(entry: RuntimeEntry, value: UIValue): void {
    if (entry.radioGroupKey) this.radioValues.set(entry.radioGroupKey, value as string | null)
    else this.patchState(entry, { value })
    if (entry.radioGroupKey) this.syncRadioGroup(entry.radioGroupKey)
    else this.syncNodeValue(entry)
  }

  private syncNodeValue(entry: RuntimeEntry): void {
    const value = entry.radioGroupKey
      ? this.radioValues.get(entry.radioGroupKey) ?? null
      : this.state.get(entry.key)?.value ?? entry.defaultValue
    const { element, node } = entry
    if (element.type === 'text-input' || element.type === 'text-area') {
      ;(node as HTMLInputElement | HTMLTextAreaElement).value = value as string
    } else if (element.type === 'checkbox' || element.type === 'switch') {
      ;(node as HTMLInputElement).checked = value as boolean
    } else if (element.type === 'radio') {
      ;(node as HTMLInputElement).checked = value === element.optionValue
    } else if (element.type === 'select') {
      ;(node as HTMLSelectElement).value = value === null ? '' : String(value)
    } else if (element.type === 'slider') {
      ;(node as HTMLInputElement).value = String(value)
    } else if (element.type === 'progress') {
      const progress = node as HTMLProgressElement
      if (value === null) progress.removeAttribute('value')
      else progress.value = value as number
    }
  }

  private syncAllRadioGroups(): void {
    for (const key of this.radioValues.keys()) this.syncRadioGroup(key)
  }

  private syncRadioGroup(groupKey: string): void {
    for (const entry of this.entries.values()) {
      if (entry.radioGroupKey === groupKey) this.syncNodeValue(entry)
    }
  }

  private validateValue(entry: RuntimeEntry, value: UIValue): void {
    const element = entry.element
    let valid = false
    if (element.type === 'text-input' || element.type === 'text-area') {
      valid = typeof value === 'string' && (element.maxLength === undefined || value.length <= element.maxLength)
    } else if (element.type === 'checkbox' || element.type === 'switch') valid = typeof value === 'boolean'
    else if (element.type === 'radio') {
      valid = value === null || (typeof value === 'string' && [...this.entries.values()].some((candidate) => candidate.radioGroupKey === entry.radioGroupKey && candidate.element.type === 'radio' && candidate.element.optionValue === value))
    } else if (element.type === 'select') {
      valid = value === null || (typeof value === 'string' && element.options.some((option) => option.value === value && !option.disabled))
    } else if (element.type === 'slider') {
      valid = typeof value === 'number' && Number.isFinite(value) && value >= element.min && value <= element.max && Math.abs((value - element.min) / element.step - Math.round((value - element.min) / element.step)) < 1e-9
    } else if (element.type === 'progress') {
      valid = value === null || (typeof value === 'number' && Number.isFinite(value) && value >= element.min && value <= element.max)
    }
    if (!valid) throw new Error(`Invalid UI value for ${element.id}`)
  }

  private requireValueEntry(target: UIRuntimeTarget): RuntimeEntry {
    const entry = this.requireEntry(target)
    if (valueOf(entry.element) === undefined) {
      throw new Error(`UI element ${entry.element.id} does not have a runtime value`)
    }
    return entry
  }

  private requireEntry(target: UIRuntimeTarget): RuntimeEntry {
    const key = typeof target === 'object'
      ? uiInstanceLocatorKey(target)
      : target
    const entry = this.entries.get(key)
    if (!entry) throw new Error(`Unknown UI element: ${typeof target === 'string' ? target : key}`)
    return entry
  }

  private patchState(entry: RuntimeEntry, patch: UIElementState): void {
    this.state.set(entry.key, { ...this.state.get(entry.key), ...patch })
  }
}

function copyMap<K, V>(source: Map<K, V>, target: Map<K, V>): void {
  target.clear()
  for (const [key, value] of source) target.set(key, value)
}

function isContainer(element: UIElement): element is Extract<UIElement, { type: 'frame' | 'scroll-container' | 'list' }> {
  return element.type === 'frame' || element.type === 'scroll-container' || element.type === 'list'
}

function valueOf(element: UIElement): UIValue | undefined {
  if (
    element.type === 'text-input' ||
    element.type === 'text-area' ||
    element.type === 'checkbox' ||
    element.type === 'radio' ||
    element.type === 'switch' ||
    element.type === 'select' ||
    element.type === 'slider' ||
    element.type === 'progress'
  ) return element.value
  return undefined
}

function createNativeNode(
  ownerDocument: Document,
  element: UIElement,
  assets: UIAssetResolver | undefined,
): HTMLElement {
  if (element.type === 'text') {
    const node = ownerDocument.createElement('span')
    node.textContent = element.text
    node.style.whiteSpace = element.wrap ? 'pre-wrap' : 'nowrap'
    return node
  }
  if (element.type === 'image') {
    if (!assets) throw new Error(`UI image ${element.id} requires an asset resolver`)
    const node = ownerDocument.createElement('img')
    node.alt = element.alt
    node.src = assets.resolve(element.source)
    return node
  }
  if (element.type === 'button') {
    const node = ownerDocument.createElement('button')
    node.type = 'button'
    node.textContent = element.text
    return node
  }
  if (element.type === 'text-input') {
    const node = ownerDocument.createElement('input')
    node.type = 'text'
    node.placeholder = element.placeholder ?? ''
    node.required = element.required
    node.readOnly = element.readOnly
    if (element.maxLength !== undefined) node.maxLength = element.maxLength
    node.inputMode = element.inputMode
    return node
  }
  if (element.type === 'text-area') {
    const node = ownerDocument.createElement('textarea')
    node.placeholder = element.placeholder ?? ''
    node.required = element.required
    node.readOnly = element.readOnly
    node.rows = element.rows
    if (element.maxLength !== undefined) node.maxLength = element.maxLength
    node.style.resize = element.resize
    return node
  }
  if (element.type === 'checkbox' || element.type === 'switch' || element.type === 'radio') {
    const node = ownerDocument.createElement('input')
    node.type = element.type === 'radio' ? 'radio' : 'checkbox'
    node.setAttribute('aria-label', element.label)
    if (element.type === 'switch') node.setAttribute('role', 'switch')
    if (element.type === 'radio') {
      node.name = element.group
      node.value = element.optionValue
    }
    return node
  }
  if (element.type === 'select') {
    const node = ownerDocument.createElement('select')
    if (element.placeholder !== undefined) {
      const option = ownerDocument.createElement('option')
      option.value = ''
      option.textContent = element.placeholder
      node.append(option)
    }
    for (const authored of element.options) {
      const option = ownerDocument.createElement('option')
      option.value = authored.value
      option.textContent = authored.label
      option.disabled = authored.disabled
      node.append(option)
    }
    return node
  }
  if (element.type === 'slider') {
    const node = ownerDocument.createElement('input')
    node.type = 'range'
    node.min = String(element.min)
    node.max = String(element.max)
    node.step = String(element.step)
    return node
  }
  if (element.type === 'progress') {
    const node = ownerDocument.createElement('progress')
    node.max = element.max
    return node
  }
  if (element.type === 'divider') {
    const node = ownerDocument.createElement('div')
    node.setAttribute('role', 'separator')
    node.setAttribute('aria-orientation', element.orientation)
    if (element.orientation === 'horizontal') node.style.height = `${element.thickness}px`
    else node.style.width = `${element.thickness}px`
    return node
  }
  if (element.type === 'spacer') {
    const node = ownerDocument.createElement('div')
    node.setAttribute('aria-hidden', 'true')
    return node
  }
  if (element.type === 'list') return ownerDocument.createElement(element.ordered ? 'ol' : 'ul')
  return ownerDocument.createElement('div')
}

function createMountNode(
  ownerDocument: Document,
  node: HTMLElement,
  element: UIElement,
  key: string,
): HTMLElement {
  if (element.type !== 'checkbox' && element.type !== 'radio' && element.type !== 'switch') return node
  const label = ownerDocument.createElement('label')
  const text = ownerDocument.createElement('span')
  const controlId = `haku-ui-control-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  node.id = controlId
  label.htmlFor = controlId
  label.style.display = 'contents'
  text.textContent = element.label
  label.append(node, text)
  return label
}

function applyEnabled(node: HTMLElement, enabled: boolean): void {
  if (NATIVE_CONTROL_TAGS.has(node.tagName)) (node as HTMLButtonElement).disabled = !enabled
  else node.inert = !enabled
}

function applyLayout(style: CSSStyleDeclaration, element: UIElement): void {
  if (!isContainer(element)) return
  const layout = element.layout
  if (layout.mode === 'free') {
    style.display = 'block'
    style.position = 'relative'
  } else if (layout.mode === 'grid') {
    style.display = 'grid'
    style.gridTemplateColumns = `repeat(${layout.columns}, minmax(0, 1fr))`
    style.justifyContent = alignmentValue(layout.distribution)
    style.alignItems = alignmentValue(layout.alignment)
    style.rowGap = `${layout.rowGap}px`
    style.columnGap = `${layout.columnGap}px`
  } else {
    style.display = 'flex'
    style.flexDirection = layout.mode === 'horizontal' ? 'row' : 'column'
    style.flexWrap = layout.wrap ? 'wrap' : 'nowrap'
    style.justifyContent = alignmentValue(layout.distribution)
    style.alignItems = alignmentValue(layout.alignment)
    style.rowGap = `${layout.rowGap}px`
    style.columnGap = `${layout.columnGap}px`
  }
  style.padding = `${layout.padding.top}px ${layout.padding.right}px ${layout.padding.bottom}px ${layout.padding.left}px`
  if ('overflowX' in element) style.overflowX = element.overflowX
  if ('overflowY' in element) style.overflowY = element.overflowY
}

function alignmentValue(value: string): string {
  if (value === 'start' || value === 'end') return `flex-${value}`
  return value
}

function sizeToCss(value: UISize): string {
  if (value.mode === 'hug') return 'fit-content'
  if (value.mode === 'fill') return '100%'
  return `${value.value}${value.unit}`
}

function applySizing(style: CSSStyleDeclaration, sizing: UISizing): void {
  style.width = sizeToCss(sizing.width)
  style.height = sizeToCss(sizing.height)
  if (sizing.width.mode === 'fill' || sizing.height.mode === 'fill') style.flexGrow = '1'
  if (sizing.minWidth) style.minWidth = `${sizing.minWidth.value}${sizing.minWidth.unit}`
  if (sizing.maxWidth) style.maxWidth = `${sizing.maxWidth.value}${sizing.maxWidth.unit}`
  if (sizing.minHeight) style.minHeight = `${sizing.minHeight.value}${sizing.minHeight.unit}`
  if (sizing.maxHeight) style.maxHeight = `${sizing.maxHeight.value}${sizing.maxHeight.unit}`
}

function applyPlacement(style: CSSStyleDeclaration, placement: UIPlacement, sizing: UISizing): void {
  if (placement.positioning === 'flow') return
  style.position = 'absolute'
  if (placement.positioning === 'absolute') {
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      if (placement[side] !== undefined) style[side] = `${placement[side]}px`
    }
    return
  }
  applyConstraint(style, 'horizontal', placement, sizing.width)
  applyConstraint(style, 'vertical', placement, sizing.height)
}

function applyConstraint(
  style: CSSStyleDeclaration,
  axis: 'horizontal' | 'vertical',
  placement: Extract<UIPlacement, { positioning: 'free' }>,
  size: UISize,
): void {
  const horizontal = axis === 'horizontal'
  const constraint = horizontal ? placement.horizontalConstraint : placement.verticalConstraint
  const start = horizontal ? placement.x : placement.y
  const reference = horizontal ? placement.referenceWidth : placement.referenceHeight
  const startProperty = horizontal ? 'left' : 'top'
  const endProperty = horizontal ? 'right' : 'bottom'
  const sizeProperty = horizontal ? 'width' : 'height'
  const fixed = size.mode === 'fixed' && size.unit === 'px' ? size.value : 0
  if (constraint === 'left' || constraint === 'top') style[startProperty] = `${start}px`
  else if (constraint === 'right' || constraint === 'bottom') style[endProperty] = `${reference - start - fixed}px`
  else if (constraint === 'left-right' || constraint === 'top-bottom') {
    style[startProperty] = `${start}px`
    style[endProperty] = `${reference - start - fixed}px`
  } else if (constraint === 'center') {
    const delta = start + fixed / 2 - reference / 2
    style[startProperty] = `calc(50% + ${delta}px)`
    style.transform = horizontal
      ? 'translateX(-50%)'
      : style.transform === 'translateX(-50%)'
        ? 'translate(-50%, -50%)'
        : 'translateY(-50%)'
  } else {
    style[startProperty] = `${(start / reference) * 100}%`
    if (fixed > 0) style[sizeProperty] = `${(fixed / reference) * 100}%`
  }
}

const VISUAL_PROPERTIES = [
  'color',
  'backgroundColor',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'verticalAlign',
  'padding',
  'margin',
  'borderColor',
  'borderWidth',
  'borderStyle',
  'borderRadius',
  'opacity',
  'cursor',
  'objectFit',
] as const

function clearVisualStyle(style: CSSStyleDeclaration): void {
  for (const property of VISUAL_PROPERTIES) style[property] = ''
}

function applyStyle(style: CSSStyleDeclaration, value: UIStyle): void {
  if (value.color !== undefined) style.color = value.color
  if (value.backgroundColor !== undefined) style.backgroundColor = value.backgroundColor
  if (value.fontFamily !== undefined) style.fontFamily = value.fontFamily
  if (value.fontSize !== undefined) style.fontSize = `${value.fontSize}px`
  if (value.fontWeight !== undefined) style.fontWeight = String(value.fontWeight)
  if (value.fontStyle !== undefined) style.fontStyle = value.fontStyle
  if (value.lineHeight !== undefined) style.lineHeight = `${value.lineHeight}px`
  if (value.letterSpacing !== undefined) style.letterSpacing = `${value.letterSpacing}px`
  if (value.textAlign !== undefined) style.textAlign = value.textAlign
  if (value.verticalAlign !== undefined) style.verticalAlign = value.verticalAlign
  if (value.padding !== undefined) style.padding = `${value.padding.top}px ${value.padding.right}px ${value.padding.bottom}px ${value.padding.left}px`
  if (value.margin !== undefined) style.margin = `${value.margin.top}px ${value.margin.right}px ${value.margin.bottom}px ${value.margin.left}px`
  if (value.borderColor !== undefined) style.borderColor = value.borderColor
  if (value.borderWidth !== undefined) {
    style.borderWidth = `${value.borderWidth}px`
    style.borderStyle = 'solid'
  }
  if (value.borderRadius !== undefined) {
    style.borderRadius = typeof value.borderRadius === 'number'
      ? `${value.borderRadius}px`
      : `${value.borderRadius.topLeft}px ${value.borderRadius.topRight}px ${value.borderRadius.bottomRight}px ${value.borderRadius.bottomLeft}px`
  }
  if (value.opacity !== undefined) style.opacity = String(value.opacity)
  if (value.cursor !== undefined) style.cursor = value.cursor
  if (value.objectFit !== undefined) style.objectFit = value.objectFit
}

function applyAccessibility(node: HTMLElement, accessibility: UIElement['accessibility']): void {
  if (accessibility.label) node.setAttribute('aria-label', accessibility.label)
  if (accessibility.description) node.setAttribute('aria-description', accessibility.description)
  if (accessibility.role) node.setAttribute('role', accessibility.role)
  if (accessibility.live) node.setAttribute('aria-live', accessibility.live)
  if (accessibility.tabIndex !== undefined) node.tabIndex = accessibility.tabIndex
}
