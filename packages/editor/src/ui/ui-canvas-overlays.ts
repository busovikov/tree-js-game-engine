import type { UIDocument, UIElement, UIElementId } from '@haku/ui'
import type { UIRect } from './ui-gesture-transaction.js'

type UIFrame = Extract<UIElement, { type: 'frame' }>

export interface UIOverlaySegment extends UIRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface UIPaddingOverlay extends UIOverlaySegment {
  readonly side: 'top' | 'right' | 'bottom' | 'left'
}

export interface UIGapOverlay extends UIOverlaySegment {
  readonly axis: 'row' | 'column'
  readonly value: number
  readonly beforeId: UIElementId
  readonly afterId: UIElementId
}

export interface UIOverflowOverlay extends UIOverlaySegment {
  readonly axis: 'x' | 'y'
  readonly policy: UIFrame['overflowX']
}

export interface UIConstraintOverlay {
  readonly horizontalConstraint: Extract<
    UIElement['placement'],
    { positioning: 'free' }
  >['horizontalConstraint']
  readonly verticalConstraint: Extract<
    UIElement['placement'],
    { positioning: 'free' }
  >['verticalConstraint']
  readonly rect: UIRect
  readonly parentRect: UIRect
}

export interface UISelectionOverlay {
  readonly rect: UIRect
  readonly padding: readonly UIPaddingOverlay[]
  readonly gaps: readonly UIGapOverlay[]
  readonly overflow: readonly UIOverflowOverlay[]
  readonly constraint: UIConstraintOverlay | null
}

export interface UIInsertionTarget {
  readonly parentId: UIElementId
  readonly insertionIndex: number
}

export interface UIInsertionOverlay extends UIOverlaySegment, UIInsertionTarget {
  readonly axis: 'x' | 'y'
}

function elementParents(asset: UIDocument): ReadonlyMap<UIElementId, UIElementId> {
  const parents = new Map<UIElementId, UIElementId>()
  for (const element of asset.elements) {
    if ('children' in element) {
      for (const childId of element.children) parents.set(childId, element.id)
    }
  }
  return parents
}

function paddingSegments(frame: UIFrame, rect: UIRect): readonly UIPaddingOverlay[] {
  const { top, right, bottom, left } = frame.layout.padding
  const width = Math.max(0, rect.width - left - right)
  const height = Math.max(0, rect.height - top - bottom)
  return [
    { side: 'top', x: rect.x + left, y: rect.y + top, width, height: 0 },
    { side: 'right', x: rect.x + rect.width - right, y: rect.y + top, width: 0, height },
    {
      side: 'bottom',
      x: rect.x + left,
      y: rect.y + rect.height - bottom,
      width,
      height: 0,
    },
    { side: 'left', x: rect.x + left, y: rect.y + top, width: 0, height },
  ]
}

function gapSegment(
  axis: UIGapOverlay['axis'],
  value: number,
  beforeId: UIElementId,
  before: UIRect,
  afterId: UIElementId,
  after: UIRect,
): UIGapOverlay {
  if (axis === 'column') {
    const overlapTop = Math.max(before.y, after.y)
    const overlapBottom = Math.min(before.y + before.height, after.y + after.height)
    return {
      axis,
      value,
      beforeId,
      afterId,
      x: before.x + before.width,
      y:
        overlapBottom >= overlapTop
          ? (overlapTop + overlapBottom) / 2
          : (before.y + before.height / 2 + after.y + after.height / 2) / 2,
      width: Math.max(0, after.x - (before.x + before.width)),
      height: 0,
    }
  }
  const overlapLeft = Math.max(before.x, after.x)
  const overlapRight = Math.min(before.x + before.width, after.x + after.width)
  return {
    axis,
    value,
    beforeId,
    afterId,
    x:
      overlapRight >= overlapLeft
        ? (overlapLeft + overlapRight) / 2
        : (before.x + before.width / 2 + after.x + after.width / 2) / 2,
    y: before.y + before.height,
    width: 0,
    height: Math.max(0, after.y - (before.y + before.height)),
  }
}

function measuredFlowChildren(
  asset: UIDocument,
  frame: UIFrame,
  bounds: ReadonlyMap<UIElementId, UIRect>,
) {
  const elements = new Map(asset.elements.map((element) => [element.id, element]))
  return frame.children.flatMap((id) => {
    const element = elements.get(id)
    const rect = bounds.get(id)
    return element?.visible && element.placement.positioning === 'flow' && rect
      ? [{ id, rect }]
      : []
  })
}

function measuredFlowChild(
  elements: ReadonlyMap<UIElementId, UIElement>,
  id: UIElementId | undefined,
  bounds: ReadonlyMap<UIElementId, UIRect>,
) {
  if (!id) return null
  const element = elements.get(id)
  const rect = bounds.get(id)
  return element?.visible && element.placement.positioning === 'flow' && rect ? { id, rect } : null
}

function gapSegments(
  asset: UIDocument,
  frame: UIFrame,
  bounds: ReadonlyMap<UIElementId, UIRect>,
): readonly UIGapOverlay[] {
  const layout = frame.layout
  if (layout.mode === 'free') return []
  if (layout.mode === 'grid') {
    const elements = new Map(asset.elements.map((element) => [element.id, element]))
    return frame.children.flatMap((afterId, index) => {
      const after = measuredFlowChild(elements, afterId, bounds)
      if (!after) return []
      const markers: UIGapOverlay[] = []
      if (index % layout.columns !== 0) {
        const before = measuredFlowChild(elements, frame.children[index - 1], bounds)
        if (before)
          markers.push(
            gapSegment('column', layout.columnGap, before.id, before.rect, after.id, after.rect),
          )
      }
      const above = measuredFlowChild(elements, frame.children[index - layout.columns], bounds)
      if (above)
        markers.push(gapSegment('row', layout.rowGap, above.id, above.rect, after.id, after.rect))
      return markers
    })
  }
  const children = measuredFlowChildren(asset, frame, bounds)
  return children.slice(1).map((after, index) => {
    const before = children[index]!
    const wrapped =
      layout.wrap &&
      (layout.mode === 'horizontal' ? after.rect.x <= before.rect.x : after.rect.y <= before.rect.y)
    const axis = wrapped
      ? layout.mode === 'horizontal'
        ? 'row'
        : 'column'
      : layout.mode === 'horizontal'
        ? 'column'
        : 'row'
    return gapSegment(
      axis,
      axis === 'column' ? layout.columnGap : layout.rowGap,
      before.id,
      before.rect,
      after.id,
      after.rect,
    )
  })
}

function overflowSegments(frame: UIFrame, rect: UIRect): readonly UIOverflowOverlay[] {
  return [
    {
      axis: 'x',
      policy: frame.overflowX,
      x: rect.x,
      y: rect.y + rect.height,
      width: rect.width,
      height: 0,
    },
    {
      axis: 'y',
      policy: frame.overflowY,
      x: rect.x + rect.width,
      y: rect.y,
      width: 0,
      height: rect.height,
    },
  ]
}

export function deriveUISelectionOverlay(
  asset: UIDocument,
  selectedIds: readonly UIElementId[],
  bounds: ReadonlyMap<UIElementId, UIRect>,
): UISelectionOverlay | null {
  if (selectedIds.length !== 1) return null
  const element = asset.elements.find((candidate) => candidate.id === selectedIds[0])
  const rect = element ? bounds.get(element.id) : undefined
  if (!element || !rect) return null
  const parentId = elementParents(asset).get(element.id)
  const parentRect = parentId ? bounds.get(parentId) : undefined
  const placement = element.placement
  const constraint =
    placement.positioning === 'free' && parentRect
      ? {
          horizontalConstraint: placement.horizontalConstraint,
          verticalConstraint: placement.verticalConstraint,
          rect,
          parentRect,
        }
      : null
  const frame = element.type === 'frame' ? element : null
  return {
    rect,
    padding: frame ? paddingSegments(frame, rect) : [],
    gaps: frame ? gapSegments(asset, frame, bounds) : [],
    overflow: frame ? overflowSegments(frame, rect) : [],
    constraint,
  }
}

function measuredNeighbor(
  childIds: readonly UIElementId[],
  bounds: ReadonlyMap<UIElementId, UIRect>,
  from: number,
  step: -1 | 1,
) {
  for (let index = from; index >= 0 && index < childIds.length; index += step) {
    const id = childIds[index]!
    const rect = bounds.get(id)
    if (rect) return { id, rect }
  }
  return null
}

export function deriveUIInsertionOverlay(
  asset: UIDocument,
  target: UIInsertionTarget | null,
  bounds: ReadonlyMap<UIElementId, UIRect>,
): UIInsertionOverlay | null {
  if (!target) return null
  const parent = asset.elements.find((element) => element.id === target.parentId)
  const parentRect = bounds.get(target.parentId)
  if (
    !parent ||
    parent.type !== 'frame' ||
    parent.layout.mode === 'free' ||
    !parentRect ||
    target.insertionIndex < 0 ||
    target.insertionIndex > parent.children.length
  )
    return null
  const before = measuredNeighbor(parent.children, bounds, target.insertionIndex - 1, -1)
  const after = measuredNeighbor(parent.children, bounds, target.insertionIndex, 1)
  const padding = parent.layout.padding
  const axis = parent.layout.mode === 'horizontal' ? 'x' : 'y'
  if (axis === 'x') {
    const x =
      before && after
        ? (before.rect.x + before.rect.width + after.rect.x) / 2
        : after
          ? after.rect.x
          : before
            ? before.rect.x + before.rect.width
            : parentRect.x + padding.left
    return {
      ...target,
      axis,
      x,
      y: parentRect.y + padding.top,
      width: 0,
      height: Math.max(0, parentRect.height - padding.top - padding.bottom),
    }
  }
  const y =
    before && after
      ? (before.rect.y + before.rect.height + after.rect.y) / 2
      : after
        ? after.rect.y
        : before
          ? before.rect.y + before.rect.height
          : parentRect.y + padding.top
  return {
    ...target,
    axis,
    x: parentRect.x + padding.left,
    y,
    width: Math.max(0, parentRect.width - padding.left - padding.right),
    height: 0,
  }
}
