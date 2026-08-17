import { UIDocumentSchema, type UIDocument, type UIElement, type UIElementId } from '@haku/ui'

export type UIHierarchyDropPosition = 'before' | 'inside' | 'after'

export interface UIHierarchyDropTarget {
  readonly targetId: UIElementId
  readonly position: UIHierarchyDropPosition
}

export interface UIHierarchyRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type UIHierarchyBounds = ReadonlyMap<UIElementId, UIHierarchyRect>

export interface UIHierarchyCommandOptions {
  readonly bounds?: UIHierarchyBounds
  readonly lockedIds?: ReadonlySet<UIElementId>
}

interface UIScope {
  readonly kind: 'document' | 'component'
  readonly componentIndex?: number
  readonly root: UIElementId
  readonly elements: readonly UIElement[]
}

function children(element: UIElement): readonly UIElementId[] {
  return 'children' in element ? element.children : []
}

function isContainer(
  element: UIElement,
): element is Extract<UIElement, { children: UIElementId[] }> {
  return 'children' in element
}

function scopes(asset: UIDocument): readonly UIScope[] {
  return [
    { kind: 'document', root: asset.root, elements: asset.elements },
    ...asset.components.map((component, componentIndex) => ({
      kind: 'component' as const,
      componentIndex,
      root: component.root,
      elements: component.elements,
    })),
  ]
}

function scopeFor(asset: UIDocument, id: UIElementId): UIScope {
  const matches = scopes(asset).filter((scope) =>
    scope.elements.some((element) => element.id === id),
  )
  if (matches.length !== 1) throw new Error(`Unknown or ambiguous UI element: ${id}`)
  return matches[0]!
}

function sameScope(left: UIScope, right: UIScope): boolean {
  return left.kind === right.kind && left.componentIndex === right.componentIndex
}

function parentsOf(elements: readonly UIElement[]): ReadonlyMap<UIElementId, UIElementId> {
  const parents = new Map<UIElementId, UIElementId>()
  for (const element of elements) {
    for (const child of children(element)) parents.set(child, element.id)
  }
  return parents
}

function orderedIds(scope: UIScope): readonly UIElementId[] {
  const byId = new Map(scope.elements.map((element) => [element.id, element]))
  const ordered: UIElementId[] = []
  const visit = (id: UIElementId): void => {
    ordered.push(id)
    const element = byId.get(id)
    if (element) for (const child of children(element)) visit(child)
  }
  visit(scope.root)
  return ordered
}

function replaceScope(
  asset: UIDocument,
  scope: UIScope,
  elements: readonly UIElement[],
): UIDocument {
  const candidate =
    scope.kind === 'document'
      ? { ...asset, elements }
      : {
          ...asset,
          components: asset.components.map((component, index) =>
            index === scope.componentIndex ? { ...component, elements } : component,
          ),
        }
  return UIDocumentSchema.parse(candidate)
}

function topLevelSelection(
  ids: readonly UIElementId[],
  order: readonly UIElementId[],
  parents: ReadonlyMap<UIElementId, UIElementId>,
): readonly UIElementId[] {
  const requested = new Set(ids)
  const roots = order
    .filter((id) => requested.has(id))
    .filter((id) => {
      let parent = parents.get(id)
      while (parent) {
        if (requested.has(parent)) return false
        parent = parents.get(parent)
      }
      return true
    })
  if (roots.length === 0) throw new Error('No UI elements selected for hierarchy move')
  return roots
}

function hasAncestor(
  id: UIElementId,
  ancestor: UIElementId,
  parents: ReadonlyMap<UIElementId, UIElementId>,
): boolean {
  let parent: UIElementId | undefined = id
  while (parent) {
    if (parent === ancestor) return true
    parent = parents.get(parent)
  }
  return false
}

function originFor(
  id: UIElementId,
  byId: ReadonlyMap<UIElementId, UIElement>,
  parents: ReadonlyMap<UIElementId, UIElementId>,
  bounds?: UIHierarchyBounds,
): { readonly x: number; readonly y: number } | null {
  const measured = bounds?.get(id)
  if (measured) return { x: measured.x, y: measured.y }
  const parent = parents.get(id)
  if (!parent) return { x: 0, y: 0 }
  const parentOrigin = originFor(parent, byId, parents, bounds)
  const element = byId.get(id)
  if (!parentOrigin || !element || element.placement.positioning !== 'free') return null
  return { x: parentOrigin.x + element.placement.x, y: parentOrigin.y + element.placement.y }
}

function parentSize(
  parent: UIElement,
  bounds?: UIHierarchyBounds,
): { width: number; height: number } {
  const measured = bounds?.get(parent.id)
  const fixed = (axis: 'width' | 'height') => {
    const size = parent.sizing[axis]
    return size.mode === 'fixed' && size.unit === 'px' ? size.value : undefined
  }
  return {
    width: Math.max(1, measured?.width ?? fixed('width') ?? 1),
    height: Math.max(1, measured?.height ?? fixed('height') ?? 1),
  }
}

function freeSizing(element: UIElement, bounds?: UIHierarchyBounds): UIElement['sizing'] {
  const measured = bounds?.get(element.id)
  return {
    ...element.sizing,
    width:
      element.sizing.width.mode === 'fill'
        ? { mode: 'fixed', value: Math.max(0, measured?.width ?? 0), unit: 'px' }
        : element.sizing.width,
    height:
      element.sizing.height.mode === 'fill'
        ? { mode: 'fixed', value: Math.max(0, measured?.height ?? 0), unit: 'px' }
        : element.sizing.height,
  }
}

function convertForParent(
  element: UIElement,
  oldParentId: UIElementId | undefined,
  newParent: Extract<UIElement, { children: UIElementId[] }>,
  insertionIndex: number,
  byId: ReadonlyMap<UIElementId, UIElement>,
  parents: ReadonlyMap<UIElementId, UIElementId>,
  bounds?: UIHierarchyBounds,
): UIElement {
  if (oldParentId === newParent.id) return element
  if (newParent.layout.mode !== 'free') {
    return { ...element, placement: { positioning: 'flow' } }
  }

  const sourceOrigin = originFor(element.id, byId, parents, bounds)
  const destinationOrigin = originFor(newParent.id, byId, parents, bounds)
  const size = parentSize(newParent, bounds)
  const padding = newParent.layout.padding
  const x = sourceOrigin && destinationOrigin ? sourceOrigin.x - destinationOrigin.x : padding.left
  const y =
    sourceOrigin && destinationOrigin
      ? sourceOrigin.y - destinationOrigin.y
      : padding.top + insertionIndex * 48
  return {
    ...element,
    sizing: freeSizing(element, bounds),
    placement: {
      positioning: 'free',
      x,
      y,
      horizontalConstraint: 'left',
      verticalConstraint: 'top',
      referenceWidth: size.width,
      referenceHeight: size.height,
    },
  }
}

export function moveUIElements(
  asset: UIDocument,
  requestedIds: readonly UIElementId[],
  target: UIHierarchyDropTarget,
  options: UIHierarchyCommandOptions = {},
): UIDocument {
  const first = requestedIds[0]
  if (!first) throw new Error('No UI elements selected for hierarchy move')
  const scope = scopeFor(asset, first)
  for (const id of requestedIds) {
    if (!sameScope(scopeFor(asset, id), scope))
      throw new Error('Cannot move UI elements across component scopes')
  }
  if (!sameScope(scopeFor(asset, target.targetId), scope)) {
    throw new Error('Cannot move UI elements across component scopes')
  }

  const byId = new Map(scope.elements.map((element) => [element.id, element]))
  const parents = parentsOf(scope.elements)
  const moving = topLevelSelection(requestedIds, orderedIds(scope), parents)
  if (moving.includes(scope.root)) throw new Error('Cannot move the UI root')
  if (options.lockedIds?.has(target.targetId) || moving.some((id) => options.lockedIds?.has(id))) {
    throw new Error('Cannot move into or move a locked UI layer')
  }
  if (moving.some((id) => hasAncestor(target.targetId, id, parents))) {
    throw new Error('Cannot move a UI layer into its own subtree')
  }

  const targetElement = byId.get(target.targetId)!
  let destination: Extract<UIElement, { children: UIElementId[] }>
  let insertionIndex: number
  if (target.position === 'inside') {
    if (!isContainer(targetElement)) throw new Error('Inside drops require a container layer')
    destination = targetElement
    insertionIndex = destination.children.length
  } else {
    const destinationId = parents.get(target.targetId)
    const candidate = destinationId ? byId.get(destinationId) : undefined
    if (!candidate || !isContainer(candidate)) throw new Error('Cannot insert beside the UI root')
    destination = candidate
    insertionIndex =
      destination.children.indexOf(target.targetId) + (target.position === 'after' ? 1 : 0)
  }
  if (options.lockedIds?.has(destination.id)) throw new Error('Cannot move into a locked UI layer')

  const movingSet = new Set(moving)
  const oldParents = new Map(moving.map((id) => [id, parents.get(id)]))
  const withoutMoving = scope.elements.map((element) =>
    isContainer(element)
      ? { ...element, children: element.children.filter((child) => !movingSet.has(child)) }
      : element,
  )
  const destinationAfterRemoval = withoutMoving.find((element) => element.id === destination.id)
  if (!destinationAfterRemoval || !isContainer(destinationAfterRemoval)) {
    throw new Error('UI hierarchy destination disappeared')
  }
  if (target.position !== 'inside') {
    const targetIndex = destinationAfterRemoval.children.indexOf(target.targetId)
    insertionIndex = targetIndex + (target.position === 'after' ? 1 : 0)
  } else {
    insertionIndex = destinationAfterRemoval.children.length
  }
  insertionIndex = Math.max(0, Math.min(insertionIndex, destinationAfterRemoval.children.length))

  const converted = new Map<UIElementId, UIElement>()
  moving.forEach((id, offset) => {
    const element = byId.get(id)!
    converted.set(
      id,
      convertForParent(
        element,
        oldParents.get(id),
        destinationAfterRemoval,
        insertionIndex + offset,
        byId,
        parents,
        options.bounds,
      ),
    )
  })
  const elements = withoutMoving.map((element) => {
    if (element.id === destinationAfterRemoval.id && isContainer(element)) {
      const nextChildren = [...element.children]
      nextChildren.splice(insertionIndex, 0, ...moving)
      return { ...element, children: nextChildren }
    }
    return converted.get(element.id) ?? element
  })
  return replaceScope(asset, scope, elements)
}

export interface UIDuplicateResult {
  readonly asset: UIDocument
  readonly ids: readonly UIElementId[]
}

export function duplicateUISubtrees(
  asset: UIDocument,
  requestedIds: readonly UIElementId[],
  uuid: () => string,
): UIDuplicateResult {
  const first = requestedIds[0]
  if (!first) throw new Error('No UI elements selected for duplication')
  const scope = scopeFor(asset, first)
  for (const id of requestedIds) {
    if (!sameScope(scopeFor(asset, id), scope))
      throw new Error('Cannot duplicate across component scopes')
  }
  const parents = parentsOf(scope.elements)
  const roots = topLevelSelection(requestedIds, orderedIds(scope), parents)
  if (roots.includes(scope.root)) throw new Error('Cannot duplicate the UI root')
  const byId = new Map(scope.elements.map((element) => [element.id, element]))
  const existing = new Set(
    scopes(asset).flatMap((candidate) => candidate.elements.map((element) => element.id)),
  )
  const idMap = new Map<UIElementId, UIElementId>()
  const clones: UIElement[] = []
  const clone = (id: UIElementId, root: boolean): UIElementId => {
    const source = byId.get(id)
    if (!source) throw new Error(`Unknown UI element: ${id}`)
    const nextId = uuid() as UIElementId
    if (existing.has(nextId) || [...idMap.values()].includes(nextId)) {
      throw new Error(`Duplicate generated UI element ID: ${nextId}`)
    }
    idMap.set(id, nextId)
    const clonedChildren = children(source).map((child) => clone(child, false))
    clones.push({
      ...structuredClone(source),
      id: nextId,
      ...(root ? { name: `${source.name ?? source.type} Copy` } : {}),
      ...(isContainer(source) ? { children: clonedChildren } : {}),
    } as UIElement)
    return nextId
  }
  const duplicatedRoots = roots.map((id) => clone(id, true))
  const duplicateBySource = new Map(roots.map((id, index) => [id, duplicatedRoots[index]!]))
  const elements = scope.elements.map((element) => {
    if (!isContainer(element)) return element
    const next: UIElementId[] = []
    for (const child of element.children) {
      next.push(child)
      const duplicate = duplicateBySource.get(child)
      if (duplicate) next.push(duplicate)
    }
    return { ...element, children: next }
  })
  const nextAsset = replaceScope(asset, scope, [...elements, ...clones])
  return { asset: nextAsset, ids: duplicatedRoots }
}

export interface UICreationTargetOptions {
  readonly pointerFrameId?: UIElementId
  readonly selectedId?: UIElementId | null
  readonly insertionIndex?: number
  readonly lockedIds?: ReadonlySet<UIElementId>
}

export interface UICreationTarget {
  readonly parentId: UIElementId
  readonly index: number
}

export function resolveUICreationTarget(
  asset: UIDocument,
  options: UICreationTargetOptions,
): UICreationTarget {
  const byId = new Map(asset.elements.map((element) => [element.id, element]))
  const parents = parentsOf(asset.elements)
  const unlockedFrame = (id: UIElementId | null | undefined) => {
    const element = id ? byId.get(id) : undefined
    return element?.type === 'frame' && !options.lockedIds?.has(element.id) ? element : undefined
  }
  let parent = unlockedFrame(options.pointerFrameId)
  if (!parent) parent = unlockedFrame(options.selectedId)
  if (!parent && options.selectedId) {
    let ancestor = parents.get(options.selectedId)
    while (ancestor && !parent) {
      parent = unlockedFrame(ancestor)
      ancestor = parents.get(ancestor)
    }
  }
  parent ??= unlockedFrame(asset.root)
  if (!parent) throw new Error('No unlocked Frame is available for UI element creation')

  let index = parent.children.length
  if (options.pointerFrameId === parent.id && options.insertionIndex !== undefined) {
    index = Math.max(0, Math.min(Math.trunc(options.insertionIndex), parent.children.length))
  } else if (options.selectedId && options.selectedId !== parent.id) {
    let directChild = options.selectedId
    let ancestor = parents.get(directChild)
    while (ancestor && ancestor !== parent.id) {
      directChild = ancestor
      ancestor = parents.get(directChild)
    }
    if (ancestor === parent.id) index = parent.children.indexOf(directChild) + 1
  }
  return { parentId: parent.id, index }
}
