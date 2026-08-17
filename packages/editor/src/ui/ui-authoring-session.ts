import {
  UIDocumentSchema,
  type UIDocument,
  type UIElement,
  type UIElementId,
} from '@haku/ui'
import { assetId, type AssetRef } from '@haku/schema'
import type { Command, CommandBus } from '../commands/command-bus.js'

export const UI_DESKTOP_VIEWPORTS = {
  'desktop-1280x720': { id: 'desktop-1280x720', label: 'Desktop 1280 × 720', width: 1280, height: 720 },
  'desktop-1440x900': { id: 'desktop-1440x900', label: 'Desktop 1440 × 900', width: 1440, height: 900 },
  'desktop-1920x1080': { id: 'desktop-1920x1080', label: 'Desktop 1920 × 1080', width: 1920, height: 1080 },
} as const

export type UIDesktopViewportId = keyof typeof UI_DESKTOP_VIEWPORTS
export type UIDesktopViewport = (typeof UI_DESKTOP_VIEWPORTS)[UIDesktopViewportId]

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
    private readonly after: UIDocument,
    private readonly path: string,
  ) {}

  execute(): void {
    this.session.apply(this.after, this.path)
  }

  undo(): void {
    this.session.apply(this.before, this.path)
  }
}

export class UIAuthoringSession {
  private currentAsset: UIDocument | null = null
  private currentPath: string | null = null
  private savedAssetJson: string | null = null
  private selectedId: UIElementId | null = null
  private listeners = new Set<UIListener>()
  private viewportId: UIDesktopViewportId = 'desktop-1280x720'

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
    return this.selectedId
  }

  get viewport(): UIDesktopViewport {
    return UI_DESKTOP_VIEWPORTS[this.viewportId]
  }

  subscribe(listener: UIListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  create(path: string, name: string): UIDocument {
    const asset = createEmptyUIDocument(name, this.uuid(), this.uuid())
    this.commands.execute(
      new ReplaceUIDocumentCommand(this, this.currentAsset, asset, path),
    )
    this.select(asset.root)
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
    this.selectedId = asset.root
    this.notify()
    return asset
  }

  replaceAsset(input: unknown): void {
    const asset = this.requireAsset()
    const path = this.requirePath()
    const next = UIDocumentSchema.parse(input)
    this.commands.execute(new ReplaceUIDocumentCommand(this, asset, next, path))
  }

  addElement(
    parentId: UIElementId | string,
    type: UIElement['type'],
    options: { readonly source?: AssetRef } = {},
  ): UIElementId {
    const asset = this.requireAsset()
    const parent = asset.elements.find((element) => element.id === parentId)
    if (!parent || !('children' in parent)) {
      throw new Error(`UI parent must be a frame, scroll container, or list: ${parentId}`)
    }
    const id = this.uuid() as UIElementId
    const name = `${type[0]!.toUpperCase()}${type.slice(1)}`
    const common = { id, type, name }
    let element: unknown
    if (type === 'frame') element = { ...common, children: [], layout: { mode: 'vertical' } }
    else if (type === 'text') element = { ...common, text: '' }
    else if (type === 'button') element = { ...common, text: 'Button' }
    else if (type === 'image') {
      if (!options.source) throw new Error('Image elements require a texture asset reference')
      element = { ...common, source: options.source, alt: 'Image' }
    } else if (type === 'rectangle' || type === 'spacer') element = common
    else if (type === 'text-input') element = { ...common, value: '', accessibility: { label: name } }
    else if (type === 'text-area') element = { ...common, value: '', accessibility: { label: name } }
    else if (type === 'checkbox') element = { ...common, value: false, label: name }
    else if (type === 'radio') element = { ...common, group: 'group', optionValue: id, value: null, label: name }
    else if (type === 'switch') element = { ...common, value: false, label: name }
    else if (type === 'select') element = { ...common, value: null, options: [{ value: 'option', label: 'Option' }], accessibility: { label: name } }
    else if (type === 'slider') element = { ...common, min: 0, max: 100, step: 1, value: 0, accessibility: { label: name } }
    else if (type === 'progress') element = { ...common, min: 0, max: 100, value: null, accessibility: { label: name } }
    else if (type === 'divider') element = { ...common, orientation: 'horizontal', thickness: 1 }
    else if (type === 'scroll-container') element = { ...common, children: [], layout: { mode: 'vertical' } }
    else if (type === 'list') element = { ...common, children: [], ordered: false, layout: { mode: 'vertical' } }
    else throw new Error('Component instances require a component authoring command')
    this.replaceAsset({
      ...asset,
      elements: [
        ...asset.elements.map((candidate) =>
          candidate.id === parent.id && 'children' in candidate
            ? { ...candidate, children: [...candidate.children, id] }
            : candidate,
        ),
        element,
      ],
    })
    this.select(id)
    return id
  }

  updateElement(id: UIElementId | string, patch: Record<string, unknown>): void {
    const asset = this.requireAsset()
    if (!asset.elements.some((element) => element.id === id)) {
      throw new Error(`Unknown UI element: ${id}`)
    }
    this.replaceAsset({
      ...asset,
      elements: asset.elements.map((element) =>
        element.id === id ? { ...element, ...patch, id: element.id, type: element.type } : element,
      ),
    })
  }

  removeElement(id: UIElementId | string): void {
    const asset = this.requireAsset()
    if (id === asset.root) throw new Error('Cannot remove the UI root')
    const remove = new Set<string>()
    const visit = (elementId: string): void => {
      if (remove.has(elementId)) return
      remove.add(elementId)
      const element = asset.elements.find((candidate) => candidate.id === elementId)
      if (element && 'children' in element) {
        for (const child of element.children) visit(child)
      }
    }
    visit(id)
    if (!asset.elements.some((element) => element.id === id)) {
      throw new Error(`Unknown UI element: ${id}`)
    }
    this.replaceAsset({
      ...asset,
      elements: asset.elements
        .filter((element) => !remove.has(element.id))
        .map((element) =>
          'children' in element
            ? { ...element, children: element.children.filter((child) => !remove.has(child)) }
            : element,
        ),
    })
    this.select(asset.root)
  }

  select(id: UIElementId | string | null): void {
    if (id === null) this.selectedId = null
    else {
      const element = this.currentAsset?.elements.find((candidate) => candidate.id === id)
      this.selectedId = element?.id ?? null
    }
    this.notify()
  }

  setViewport(id: UIDesktopViewportId): void {
    this.viewportId = id
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
    this.selectedId = null
    this.notify()
  }

  apply(asset: UIDocument | null, path: string): void {
    this.currentAsset = asset ? cloneAsset(asset) : null
    this.currentPath = asset ? path : null
    if (asset && !asset.elements.some((element) => element.id === this.selectedId)) {
      this.selectedId = asset.root
    }
    if (!asset) this.selectedId = null
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
