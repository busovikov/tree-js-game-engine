import {
  UIDocumentSchema,
  applyUIInstanceOverride,
  type UIComponentDefinition,
  type UIComponentId,
  type UIDocument,
  type UIElement,
  type UIElementId,
  type UIInstanceOverride,
  type UIStyle,
} from '@haku/ui'

interface UIComponentPlacementOptions {
  readonly index?: number
  readonly point?: { readonly x: number; readonly y: number }
}

export interface UIComponentExtractionResult {
  readonly asset: UIDocument
  readonly componentId: UIComponentId
  readonly instanceId: UIElementId
}

export interface UIComponentPlacementResult {
  readonly asset: UIDocument
  readonly instanceId: UIElementId
}

export interface UIComponentDetachResult {
  readonly asset: UIDocument
  readonly rootId: UIElementId
}

function childrenOf(element: UIElement): readonly UIElementId[] {
  return 'children' in element ? element.children : []
}

function globalElementIds(asset: UIDocument): Set<string> {
  return new Set([
    ...asset.elements.map((element) => element.id),
    ...asset.components.flatMap((component) => component.elements.map((element) => element.id)),
  ])
}

function generatedElementId(existing: Set<string>, uuid: () => string): UIElementId {
  const id = uuid() as UIElementId
  if (existing.has(id)) throw new Error(`Duplicate generated UI element ID: ${id}`)
  existing.add(id)
  return id
}

function generatedComponentId(asset: UIDocument, uuid: () => string): UIComponentId {
  const id = uuid() as UIComponentId
  if (asset.components.some((component) => component.id === id)) {
    throw new Error(`Duplicate generated UI component ID: ${id}`)
  }
  return id
}

function requireComponent(asset: UIDocument, componentId: UIComponentId | string) {
  const component = asset.components.find((candidate) => candidate.id === componentId)
  if (!component) throw new Error(`Unknown UI component: ${componentId}`)
  return component
}

function componentDependencyPath(
  asset: UIDocument,
  from: UIComponentId,
  target: UIComponentId,
  visiting = new Set<UIComponentId>(),
): UIComponentId[] | undefined {
  if (from === target) return [from]
  if (visiting.has(from)) return undefined
  visiting.add(from)
  const component = requireComponent(asset, from)
  for (const element of component.elements) {
    if (element.type !== 'instance') continue
    const path = componentDependencyPath(asset, element.component, target, visiting)
    if (path) return [from, ...path]
  }
  visiting.delete(from)
  return undefined
}

function requireDocumentParent(
  asset: UIDocument,
  childId: UIElementId,
): Extract<UIElement, { children: UIElementId[] }> {
  const parent = asset.elements.find(
    (element): element is Extract<UIElement, { children: UIElementId[] }> =>
      'children' in element && element.children.includes(childId),
  )
  if (!parent) throw new Error(`UI element has no document parent: ${childId}`)
  return parent
}

function instanceElement(
  id: UIElementId,
  component: UIComponentDefinition,
  placement: UIElement['placement'],
  sizing: UIElement['sizing'],
): UIElement {
  return {
    id,
    type: 'instance',
    name: component.name,
    component: component.id,
    overrides: {},
    visible: true,
    enabled: true,
    placement: structuredClone(placement),
    sizing: structuredClone(sizing),
    style: {},
    accessibility: {},
    events: {},
  }
}

export function extractUIComponent(
  asset: UIDocument,
  rootId: UIElementId,
  name: string,
  uuid: () => string,
): UIComponentExtractionResult {
  if (rootId === asset.root) throw new Error('Cannot extract the UI document root as a component')
  const componentName = name.trim()
  if (!componentName) throw new Error('UI component name cannot be empty')
  const byId = new Map(asset.elements.map((element) => [element.id, element]))
  const sourceRoot = byId.get(rootId)
  if (!sourceRoot) throw new Error(`Unknown document UI element: ${rootId}`)
  const parent = requireDocumentParent(asset, rootId)
  const subtreeIds = new Set<UIElementId>()
  const visit = (id: UIElementId): void => {
    if (subtreeIds.has(id)) return
    const element = byId.get(id)
    if (!element) throw new Error(`Unknown UI element in extracted subtree: ${id}`)
    subtreeIds.add(id)
    for (const child of childrenOf(element)) visit(child)
  }
  visit(rootId)

  const componentId = generatedComponentId(asset, uuid)
  const existing = globalElementIds(asset)
  const instanceId = generatedElementId(existing, uuid)
  const component: UIComponentDefinition = {
    id: componentId,
    name: componentName,
    root: rootId,
    elements: asset.elements
      .filter((element) => subtreeIds.has(element.id))
      .map((element) => structuredClone(element)),
  }
  const instance = instanceElement(instanceId, component, sourceRoot.placement, sourceRoot.sizing)
  const candidate = {
    ...asset,
    elements: [
      ...asset.elements
        .filter((element) => !subtreeIds.has(element.id))
        .map((element) =>
          element.id === parent.id && 'children' in element
            ? {
                ...element,
                children: element.children.map((child) => (child === rootId ? instanceId : child)),
              }
            : element,
        ),
      instance,
    ],
    components: [...asset.components, component],
  }
  return {
    asset: UIDocumentSchema.parse(candidate),
    componentId,
    instanceId,
  }
}

export function placeUIComponentInstance(
  asset: UIDocument,
  componentId: UIComponentId | string,
  parentId: UIElementId,
  options: UIComponentPlacementOptions,
  uuid: () => string,
): UIComponentPlacementResult {
  const component = requireComponent(asset, componentId)
  const documentParent = asset.elements.find((element) => element.id === parentId)
  const owner = documentParent
    ? undefined
    : asset.components.find((candidate) =>
        candidate.elements.some((element) => element.id === parentId),
      )
  const parent = documentParent ?? owner?.elements.find((element) => element.id === parentId)
  if (!parent || !('children' in parent)) {
    throw new Error(`UI component parent must be a container: ${parentId}`)
  }
  if (owner) {
    const dependencyPath = componentDependencyPath(asset, component.id, owner.id)
    if (dependencyPath) {
      throw new Error(`UI component insertion cycle: ${[owner.id, ...dependencyPath].join(' -> ')}`)
    }
  }
  const root = component.elements.find((element) => element.id === component.root)
  if (!root) throw new Error(`Unknown UI component root: ${component.root}`)
  const existing = globalElementIds(asset)
  const instanceId = generatedElementId(existing, uuid)
  const parentWidth =
    parent.sizing.width.mode === 'fixed' && parent.sizing.width.unit === 'px'
      ? parent.sizing.width.value
      : 1
  const parentHeight =
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
          referenceWidth: Math.max(1, parentWidth),
          referenceHeight: Math.max(1, parentHeight),
        }
      : { positioning: 'flow' as const }
  const instance = instanceElement(instanceId, component, placement, root.sizing)
  const index = Math.max(
    0,
    Math.min(Math.trunc(options.index ?? parent.children.length), parent.children.length),
  )
  const candidate = {
    ...asset,
    elements: owner
      ? asset.elements
      : [
          ...asset.elements.map((element) =>
            element.id === parent.id && 'children' in element
              ? {
                  ...element,
                  children: [
                    ...element.children.slice(0, index),
                    instanceId,
                    ...element.children.slice(index),
                  ],
                }
              : element,
          ),
          instance,
        ],
    components: owner
      ? asset.components.map((candidate) =>
          candidate.id === owner.id
            ? {
                ...candidate,
                elements: [
                  ...candidate.elements.map((element) =>
                    element.id === parent.id && 'children' in element
                      ? {
                          ...element,
                          children: [
                            ...element.children.slice(0, index),
                            instanceId,
                            ...element.children.slice(index),
                          ],
                        }
                      : element,
                  ),
                  instance,
                ],
              }
            : candidate,
        )
      : asset.components,
  }
  return { asset: UIDocumentSchema.parse(candidate), instanceId }
}

export function setUIInstanceOverride(
  asset: UIDocument,
  instanceId: UIElementId,
  sourceElementId: UIElementId,
  override: UIInstanceOverride,
): UIDocument {
  let found = false
  const update = (elements: readonly UIElement[]): UIElement[] =>
    elements.map((element) => {
      if (element.id !== instanceId) return element
      if (element.type !== 'instance')
        throw new Error(`UI element is not an instance: ${instanceId}`)
      found = true
      return {
        ...element,
        overrides: { ...element.overrides, [sourceElementId]: structuredClone(override) },
      }
    })
  const candidate = {
    ...asset,
    elements: update(asset.elements),
    components: asset.components.map((component) => ({
      ...component,
      elements: update(component.elements),
    })),
  }
  if (!found) throw new Error(`Unknown UI component instance: ${instanceId}`)
  return UIDocumentSchema.parse(candidate)
}

export function resetUIInstanceOverride(
  asset: UIDocument,
  instanceId: UIElementId,
  sourceElementId: UIElementId,
): UIDocument {
  let found = false
  const update = (elements: readonly UIElement[]): UIElement[] =>
    elements.map((element) => {
      if (element.id !== instanceId) return element
      if (element.type !== 'instance')
        throw new Error(`UI element is not an instance: ${instanceId}`)
      found = true
      if (!(sourceElementId in element.overrides)) {
        throw new Error(`No UI instance override for source element: ${sourceElementId}`)
      }
      const overrides = { ...element.overrides }
      delete overrides[sourceElementId]
      return { ...element, overrides }
    })
  const candidate = {
    ...asset,
    elements: update(asset.elements),
    components: asset.components.map((component) => ({
      ...component,
      elements: update(component.elements),
    })),
  }
  if (!found) throw new Error(`Unknown UI component instance: ${instanceId}`)
  return UIDocumentSchema.parse(candidate)
}

export function detachUIComponentInstance(
  asset: UIDocument,
  instanceId: UIElementId,
  uuid: () => string,
): UIComponentDetachResult {
  const instance = asset.elements.find((element) => element.id === instanceId)
  if (!instance) throw new Error(`Unknown document UI element: ${instanceId}`)
  if (instance.type !== 'instance') throw new Error(`UI element is not an instance: ${instanceId}`)
  const parent = requireDocumentParent(asset, instanceId)
  const existing = globalElementIds(asset)
  const materialized: UIElement[] = []
  const materializedThemeStyles = new Map<string, Record<string, UIStyle>>(
    asset.themes.map((theme) => [theme.id, {}]),
  )

  const materializeInstance = (
    authoredInstance: Extract<UIElement, { type: 'instance' }>,
  ): UIElementId => {
    const component = requireComponent(asset, authoredInstance.component)
    const byId = new Map(component.elements.map((element) => [element.id, element]))
    const materializeSource = (sourceId: UIElementId): UIElementId => {
      const source = byId.get(sourceId)
      if (!source) throw new Error(`Unknown UI component element: ${sourceId}`)
      const effective = applyUIInstanceOverride(source, authoredInstance.overrides[sourceId])
      if (effective.type === 'instance') return materializeInstance(effective)
      const id = generatedElementId(existing, uuid)
      for (const theme of asset.themes) {
        const themed = theme.styles[source.id]
        if (themed !== undefined) {
          materializedThemeStyles.get(theme.id)![id] = structuredClone(themed)
        }
      }
      const children = childrenOf(effective).map(materializeSource)
      materialized.push({
        ...structuredClone(effective),
        id,
        ...('children' in effective ? { children } : {}),
      } as UIElement)
      return id
    }
    const rootId = materializeSource(component.root)
    const rootIndex = materialized.findIndex((element) => element.id === rootId)
    const root = materialized[rootIndex]
    if (!root) throw new Error(`Detached UI component root disappeared: ${rootId}`)
    materialized[rootIndex] = {
      ...root,
      name: authoredInstance.name ?? root.name,
      placement: structuredClone(authoredInstance.placement),
      sizing: structuredClone(authoredInstance.sizing),
      visible: authoredInstance.visible && root.visible,
      enabled: authoredInstance.enabled && root.enabled,
      style: { ...root.style, ...authoredInstance.style },
      accessibility: { ...root.accessibility, ...authoredInstance.accessibility },
    } as UIElement
    for (const theme of asset.themes) {
      const styles = materializedThemeStyles.get(theme.id)!
      const inherited = styles[rootId]
      const themedInstance = theme.styles[authoredInstance.id]
      if (inherited !== undefined || themedInstance !== undefined) {
        styles[rootId] = {
          ...inherited,
          ...authoredInstance.style,
          ...themedInstance,
        }
      }
    }
    return rootId
  }

  const rootId = materializeInstance(instance)
  const candidate = {
    ...asset,
    elements: [
      ...asset.elements
        .filter((element) => element.id !== instanceId)
        .map((element) =>
          element.id === parent.id && 'children' in element
            ? {
                ...element,
                children: element.children.map((child) => (child === instanceId ? rootId : child)),
              }
            : element,
        ),
      ...materialized,
    ],
    themes: asset.themes.map((theme) => {
      const styles = { ...theme.styles }
      delete styles[instanceId]
      return {
        ...theme,
        styles: { ...styles, ...materializedThemeStyles.get(theme.id) },
      }
    }),
  }
  return { asset: UIDocumentSchema.parse(candidate), rootId }
}
