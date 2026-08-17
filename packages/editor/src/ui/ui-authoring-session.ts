import { UIDocumentSchema, type UIDocument, type UIElement, type UIElementId } from '@haku/ui'
import { assetId, type AssetRef } from '@haku/schema'
import type { Command, CommandBus } from '../commands/command-bus.js'
import { reduceUISelection } from './ui-canvas-selection.js'
import {
  duplicateUISubtrees,
  moveUIElements,
  resolveUICreationTarget,
  type UICreationTargetOptions,
  type UIHierarchyBounds,
  type UIHierarchyDropTarget,
} from './ui-hierarchy-commands.js'
import { updateUIElementStrict } from './ui-inspector-model.js'

export const UI_DESKTOP_VIEWPORTS = {
  'desktop-1280x720': {
    id: 'desktop-1280x720',
    label: 'Desktop 1280 × 720',
    width: 1280,
    height: 720,
  },
  'desktop-1440x900': {
    id: 'desktop-1440x900',
    label: 'Desktop 1440 × 900',
    width: 1440,
    height: 900,
  },
  'desktop-1920x1080': {
    id: 'desktop-1920x1080',
    label: 'Desktop 1920 × 1080',
    width: 1920,
    height: 1080,
  },
} as const

export type UIDesktopViewportId = keyof typeof UI_DESKTOP_VIEWPORTS
export type UIDesktopViewport = (typeof UI_DESKTOP_VIEWPORTS)[UIDesktopViewportId]
export type UIPreviewMode = 'edit' | 'preview'
export type UIPreviewViewport =
  | UIDesktopViewport
  | {
      readonly id: 'custom'
      readonly label: string
      readonly width: number
      readonly height: number
    }

export interface UIAssetStorage {
  readText(path: string): Promise<string>
  writeText(path: string, value: string): Promise<void>
}

export interface UIHierarchyItem {
  readonly id: UIElementId
  readonly type: UIElement['type']
  readonly name: string
  readonly children: readonly UIHierarchyItem[]
}

type UIListener = () => void

function cloneAsset(asset: UIDocument): UIDocument {
  return UIDocumentSchema.parse(structuredClone(asset))
}

function serialized(asset: UIDocument | null): string | null {
  return asset ? JSON.stringify(asset) : null
}

export function createEmptyUIDocument(
  name: string,
  id: string = crypto.randomUUID(),
  root: string = crypto.randomUUID(),
): UIDocument {
  return UIDocumentSchema.parse({
    schemaVersion: 2,
    id: assetId(id),
    name,
    root,
    elements: [
      {
        id: root,
        type: 'frame',
        name: 'Root',
        children: [],
        layout: { mode: 'vertical' },
        sizing: {
          width: { mode: 'fixed', value: 1280, unit: 'px' },
          height: { mode: 'fixed', value: 720, unit: 'px' },
        },
      },
    ],
  })
}

class ReplaceUIDocumentCommand implements Command {
  constructor(
    private readonly session: UIAuthoringSession,
    private readonly before: UIDocument | null,
    private readonly beforeSelection: readonly UIElementId[],
    private readonly after: UIDocument,
    private readonly afterSelection: readonly UIElementId[],
    private readonly path: string,
    private readonly historyGroup?: string,
  ) {}

  execute(): void {
    this.session.apply(this.after, this.path, this.afterSelection)
  }

  undo(): void {
    this.session.apply(this.before, this.path, this.beforeSelection)
  }

  merge(other: Command): Command | null {
    if (
      !this.historyGroup ||
      !(other instanceof ReplaceUIDocumentCommand) ||
      other.session !== this.session ||
      other.path !== this.path ||
      other.historyGroup !== this.historyGroup
    ) {
      return null
    }
    return new ReplaceUIDocumentCommand(
      this.session,
      this.before,
      this.beforeSelection,
      other.after,
      other.afterSelection,
      this.path,
      this.historyGroup,
    )
  }
}

export class UIAuthoringSession {
  private currentAsset: UIDocument | null = null
  private currentPath: string | null = null
  private savedAssetJson: string | null = null
  private selection: UIElementId[] = []
  private editorLockedIds = new Set<UIElementId>()
  private listeners = new Set<UIListener>()
  private viewportId: UIDesktopViewportId | 'custom' = 'desktop-1280x720'
  private customViewport: UIPreviewViewport = {
    id: 'custom',
    label: 'Custom 1280 × 720',
    width: 1280,
    height: 720,
  }
  private currentPreviewMode: UIPreviewMode = 'edit'

  constructor(
    private readonly commands: CommandBus,
    private readonly storage: UIAssetStorage,
    private readonly uuid: () => string = () => crypto.randomUUID(),
  ) {}

  get asset(): UIDocument | null {
    return this.currentAsset
  }

  get path(): string | null {
    return this.currentPath
  }

  get isDirty(): boolean {
    return serialized(this.currentAsset) !== this.savedAssetJson
  }

  get selectedElementId(): UIElementId | null {
    return this.selection.at(-1) ?? null
  }

  get selectedElementIds(): readonly UIElementId[] {
    return this.selection
  }

  get editorLockedElementIds(): ReadonlySet<UIElementId> {
    return new Set(this.editorLockedIds)
  }

  get viewport(): UIPreviewViewport {
    return this.viewportId === 'custom'
      ? this.customViewport
      : UI_DESKTOP_VIEWPORTS[this.viewportId]
  }

  get previewMode(): UIPreviewMode {
    return this.currentPreviewMode
  }

  subscribe(listener: UIListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  create(path: string, name: string): UIDocument {
    const asset = createEmptyUIDocument(name, this.uuid(), this.uuid())
    this.commands.execute(
      new ReplaceUIDocumentCommand(
        this,
        this.currentAsset,
        this.selection,
        asset,
        [asset.root],
        path,
      ),
    )
    return asset
  }

  async open(path: string): Promise<UIDocument> {
    const asset = UIDocumentSchema.parse(JSON.parse(await this.storage.readText(path)))
    return this.openAsset(path, asset)
  }

  openAsset(path: string, input: unknown): UIDocument {
    const asset = UIDocumentSchema.parse(input)
    this.currentAsset = cloneAsset(asset)
    this.currentPath = path
    this.savedAssetJson = serialized(asset)
    this.selection = [asset.root]
    this.notify()
    return asset
  }

  replaceAsset(
    input: unknown,
    selectionOverride?: readonly (UIElementId | string)[],
    options: { readonly historyGroup?: string } = {},
  ): void {
    const asset = this.requireAsset()
    const path = this.requirePath()
    const next = UIDocumentSchema.parse(input)
    const validIds = new Set(next.elements.map((element) => element.id))
    const nextSelection = reduceUISelection(
      selectionOverride ?? this.selection,
      { type: 'reconcile', validIds, fallback: next.root },
      parentMap(next),
    ) as UIElementId[]
    this.commands.execute(
      new ReplaceUIDocumentCommand(
        this,
        asset,
        this.selection,
        next,
        nextSelection,
        path,
        options.historyGroup,
      ),
    )
  }

  addElement(
    parentId: UIElementId | string,
    type: UIElement['type'],
    options: {
      readonly source?: AssetRef
      readonly index?: number
      readonly point?: { readonly x: number; readonly y: number }
    } = {},
  ): UIElementId {
    const asset = this.requireAsset()
    const parent = asset.elements.find((element) => element.id === parentId)
    if (!parent || !('children' in parent)) {
      throw new Error(`UI parent must be a frame, scroll container, or list: ${parentId}`)
    }
    const id = this.uuid() as UIElementId
    const name = `${type[0]!.toUpperCase()}${type.slice(1)}`
    const width =
      parent.sizing.width.mode === 'fixed' && parent.sizing.width.unit === 'px'
        ? parent.sizing.width.value
        : 1
    const height =
      parent.sizing.height.mode === 'fixed' && parent.sizing.height.unit === 'px'
        ? parent.sizing.height.value
        : 1
    const placement =
      parent.layout.mode === 'free'
        ? {
            positioning: 'free' as const,
            x: options.point?.x ?? parent.layout.padding.left,
            y: options.point?.y ?? parent.layout.padding.top,
            horizontalConstraint: 'left' as const,
            verticalConstraint: 'top' as const,
            referenceWidth: Math.max(1, width),
            referenceHeight: Math.max(1, height),
          }
        : { positioning: 'flow' as const }
    const common = { id, type, name, placement }
    let element: unknown
    if (type === 'frame') element = { ...common, children: [], layout: { mode: 'vertical' } }
    else if (type === 'text') element = { ...common, text: '' }
    else if (type === 'button') element = { ...common, text: 'Button' }
    else if (type === 'image') {
      if (!options.source) throw new Error('Image elements require a texture asset reference')
      element = { ...common, source: options.source, alt: 'Image' }
    } else if (type === 'rectangle' || type === 'spacer') element = common
    else if (type === 'text-input')
      element = { ...common, value: '', accessibility: { label: name } }
    else if (type === 'text-area')
      element = { ...common, value: '', accessibility: { label: name } }
    else if (type === 'checkbox') element = { ...common, value: false, label: name }
    else if (type === 'radio')
      element = { ...common, group: 'group', optionValue: id, value: null, label: name }
    else if (type === 'switch') element = { ...common, value: false, label: name }
    else if (type === 'select')
      element = {
        ...common,
        value: null,
        options: [{ value: 'option', label: 'Option' }],
        accessibility: { label: name },
      }
    else if (type === 'slider')
      element = { ...common, min: 0, max: 100, step: 1, value: 0, accessibility: { label: name } }
    else if (type === 'progress')
      element = { ...common, min: 0, max: 100, value: null, accessibility: { label: name } }
    else if (type === 'divider') element = { ...common, orientation: 'horizontal', thickness: 1 }
    else if (type === 'scroll-container')
      element = { ...common, children: [], layout: { mode: 'vertical' } }
    else if (type === 'list')
      element = { ...common, children: [], ordered: false, layout: { mode: 'vertical' } }
    else throw new Error('Component instances require a component authoring command')
    const insertionIndex = Math.max(
      0,
      Math.min(Math.trunc(options.index ?? parent.children.length), parent.children.length),
    )
    this.replaceAsset(
      {
        ...asset,
        elements: [
          ...asset.elements.map((candidate) =>
            candidate.id === parent.id && 'children' in candidate
              ? {
                  ...candidate,
                  children: [
                    ...candidate.children.slice(0, insertionIndex),
                    id,
                    ...candidate.children.slice(insertionIndex),
                  ],
                }
              : candidate,
          ),
          element,
        ],
      },
      [id],
    )
    return id
  }

  createElement(
    type: Exclude<UIElement['type'], 'instance'>,
    options: UICreationTargetOptions & {
      readonly source?: AssetRef
      readonly point?: { readonly x: number; readonly y: number }
    } = {},
  ): UIElementId {
    const asset = this.requireAsset()
    const target = resolveUICreationTarget(asset, {
      ...options,
      selectedId: options.selectedId ?? this.selectedElementId,
      lockedIds: this.editorLockedIds,
    })
    return this.addElement(target.parentId, type, {
      index: target.index,
      ...(options.source ? { source: options.source } : {}),
      ...(options.point ? { point: options.point } : {}),
    })
  }

  moveElements(
    ids: readonly (UIElementId | string)[],
    target: UIHierarchyDropTarget,
    bounds?: UIHierarchyBounds,
  ): void {
    const asset = this.requireAsset()
    const typedIds = ids.map((id) => id as UIElementId)
    const candidate = moveUIElements(asset, typedIds, target, {
      lockedIds: this.editorLockedIds,
      ...(bounds ? { bounds } : {}),
    })
    this.replaceAsset(candidate, typedIds)
  }

  duplicateElements(
    ids: readonly (UIElementId | string)[] = this.selection,
  ): readonly UIElementId[] {
    const result = duplicateUISubtrees(
      this.requireAsset(),
      ids.map((id) => id as UIElementId),
      this.uuid,
    )
    this.replaceAsset(result.asset, result.ids)
    return result.ids
  }

  renameElement(id: UIElementId | string, name: string): void {
    const next = name.trim()
    if (!next) throw new Error('UI layer name cannot be empty')
    this.updateElement(id, { name: next })
  }

  setElementVisible(id: UIElementId | string, visible: boolean): void {
    this.updateElement(id, { visible })
  }

  updateElement(
    id: UIElementId | string,
    patch: Record<string, unknown>,
    options: { readonly historyGroup?: string } = {},
  ): void {
    const asset = this.requireAsset()
    this.replaceAsset(updateUIElementStrict(asset, id, patch), undefined, options)
  }

  removeElement(id: UIElementId | string): void {
    this.removeElements([id])
  }

  removeElements(ids: readonly (UIElementId | string)[]): void {
    const asset = this.requireAsset()
    if (ids.some((id) => id === asset.root)) throw new Error('Cannot remove the UI root')
    const remove = new Set<string>()
    const visit = (elementId: string): void => {
      if (remove.has(elementId)) return
      remove.add(elementId)
      const element = asset.elements.find((candidate) => candidate.id === elementId)
      if (element && 'children' in element) {
        for (const child of element.children) visit(child)
      }
    }
    for (const id of ids) {
      if (!asset.elements.some((element) => element.id === id)) {
        throw new Error(`Unknown UI element: ${id}`)
      }
      if (this.editorLockedIds.has(id as UIElementId)) {
        throw new Error(`Cannot remove locked UI layer: ${id}`)
      }
      visit(id)
    }
    this.replaceAsset(
      {
        ...asset,
        elements: asset.elements
          .filter((element) => !remove.has(element.id))
          .map((element) =>
            'children' in element
              ? { ...element, children: element.children.filter((child) => !remove.has(child)) }
              : element,
          ),
      },
      [asset.root],
    )
  }

  select(id: UIElementId | string | null): void {
    if (id === null) this.selection = []
    else {
      const element = this.currentAsset?.elements.find((candidate) => candidate.id === id)
      this.selection = element ? [element.id] : []
    }
    this.notify()
  }

  toggleSelection(id: UIElementId | string): void {
    const asset = this.currentAsset
    if (!asset?.elements.some((element) => element.id === id)) return
    this.selection = reduceUISelection(
      this.selection,
      { type: 'toggle', id },
      parentMap(asset),
    ) as UIElementId[]
    this.notify()
  }

  setEditorLocked(id: UIElementId | string, locked: boolean): void {
    const element = this.currentAsset?.elements.find((candidate) => candidate.id === id)
    if (!element) return
    if (locked) this.editorLockedIds.add(element.id)
    else this.editorLockedIds.delete(element.id)
    this.notify()
  }

  isEditorLocked(id: UIElementId | string): boolean {
    return this.editorLockedIds.has(id as UIElementId)
  }

  setViewport(id: UIDesktopViewportId | 'custom'): void {
    this.viewportId = id
    this.notify()
  }

  setCustomViewport(width: number, height: number): void {
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new Error('Custom preview dimensions must be positive finite numbers')
    }
    this.customViewport = {
      id: 'custom',
      label: `Custom ${width} × ${height}`,
      width,
      height,
    }
    this.viewportId = 'custom'
    this.notify()
  }

  setPreviewMode(mode: UIPreviewMode): void {
    this.currentPreviewMode = mode
    this.notify()
  }

  hierarchy(): readonly UIHierarchyItem[] {
    const asset = this.requireAsset()
    const byId = new Map(asset.elements.map((element) => [element.id, element]))
    const visit = (id: UIElementId): UIHierarchyItem => {
      const element = byId.get(id)
      if (!element) throw new Error(`Unknown UI element: ${id}`)
      return {
        id: element.id,
        type: element.type,
        name: element.name ?? element.type,
        children: 'children' in element ? element.children.map(visit) : [],
      }
    }
    return [visit(asset.root)]
  }

  async save(): Promise<void> {
    const asset = UIDocumentSchema.parse(this.requireAsset())
    await this.storage.writeText(this.requirePath(), `${JSON.stringify(asset, null, 2)}\n`)
    this.savedAssetJson = serialized(asset)
    this.notify()
  }

  close(): void {
    this.currentAsset = null
    this.currentPath = null
    this.savedAssetJson = null
    this.selection = []
    this.editorLockedIds.clear()
    this.notify()
  }

  apply(
    asset: UIDocument | null,
    path: string,
    selection: readonly UIElementId[] = this.selection,
  ): void {
    this.currentAsset = asset ? cloneAsset(asset) : null
    this.currentPath = asset ? path : null
    if (asset) {
      const validIds = new Set(asset.elements.map((element) => element.id))
      this.selection = reduceUISelection(
        selection,
        { type: 'reconcile', validIds, fallback: asset.root },
        parentMap(asset),
      ) as UIElementId[]
      this.editorLockedIds = new Set([...this.editorLockedIds].filter((id) => validIds.has(id)))
    } else {
      this.selection = []
      this.editorLockedIds.clear()
    }
    this.notify()
  }

  private requireAsset(): UIDocument {
    if (!this.currentAsset) throw new Error('No UI document open')
    return this.currentAsset
  }

  private requirePath(): string {
    if (!this.currentPath) throw new Error('No UI document path')
    return this.currentPath
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

function parentMap(asset: UIDocument): ReadonlyMap<string, string | null> {
  const parents = new Map<string, string | null>([[asset.root, null]])
  for (const element of asset.elements) {
    if (!('children' in element)) continue
    for (const child of element.children) parents.set(child, element.id)
  }
  return parents
}
