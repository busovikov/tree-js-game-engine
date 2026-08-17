import type { UIBound, UISizing } from '@haku/ui'

export interface UIRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface UIGestureTransaction {
  readonly before: UIRect
  readonly preview: UIRect
}

export type UISnapKind =
  | 'parent-edge'
  | 'peer-edge'
  | 'center'
  | 'parent-padding'
  | 'equal-gap'

export interface UISnapCandidate {
  readonly axis: 'x' | 'y'
  readonly delta: number
  readonly kind: UISnapKind
  readonly guide: number
}

const SNAP_PRIORITY: Record<UISnapKind, number> = {
  'parent-edge': 0,
  'peer-edge': 1,
  center: 2,
  'parent-padding': 3,
  'equal-gap': 4,
}

export function beginUIGesture(before: UIRect): UIGestureTransaction {
  return { before: { ...before }, preview: { ...before } }
}

export function previewUIGesture(
  transaction: UIGestureTransaction,
  preview: UIRect,
): UIGestureTransaction {
  return { before: transaction.before, preview: { ...preview } }
}

export function cancelUIGesture(transaction: UIGestureTransaction): UIRect {
  return transaction.before
}

export function commitUIGesture(
  transaction: UIGestureTransaction,
): { readonly changed: boolean; readonly value: UIRect } {
  return {
    changed:
      transaction.before.x !== transaction.preview.x ||
      transaction.before.y !== transaction.preview.y ||
      transaction.before.width !== transaction.preview.width ||
      transaction.before.height !== transaction.preview.height,
    value: transaction.preview,
  }
}

export function snapUIRect(
  rect: UIRect,
  candidates: readonly UISnapCandidate[],
  threshold: number,
  disabled = false,
): { readonly rect: UIRect; readonly guides: readonly UISnapCandidate[] } {
  if (disabled) return { rect, guides: [] }
  const guides = (['x', 'y'] as const).flatMap((axis) => {
    const candidate = candidates
      .filter((item) => item.axis === axis && Math.abs(item.delta) <= threshold)
      .sort(
        (a, b) => SNAP_PRIORITY[a.kind] - SNAP_PRIORITY[b.kind] || Math.abs(a.delta) - Math.abs(b.delta),
      )[0]
    return candidate ? [candidate] : []
  })
  return {
    rect: {
      ...rect,
      x: rect.x + (guides.find((guide) => guide.axis === 'x')?.delta ?? 0),
      y: rect.y + (guides.find((guide) => guide.axis === 'y')?.delta ?? 0),
    },
    guides,
  }
}

function boundPixels(bound: UIBound | undefined, parentSize: number): number | undefined {
  if (!bound) return undefined
  return bound.unit === 'px' ? bound.value : (bound.value / 100) * parentSize
}

export function clampUIRect(
  rect: UIRect,
  parent: { readonly width: number; readonly height: number },
  sizing: Pick<UISizing, 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight'>,
): UIRect {
  const minWidth = boundPixels(sizing.minWidth, parent.width) ?? 0
  const maxWidth = boundPixels(sizing.maxWidth, parent.width) ?? parent.width
  const minHeight = boundPixels(sizing.minHeight, parent.height) ?? 0
  const maxHeight = boundPixels(sizing.maxHeight, parent.height) ?? parent.height
  const width = Math.min(parent.width, maxWidth, Math.max(minWidth, rect.width))
  const height = Math.min(parent.height, maxHeight, Math.max(minHeight, rect.height))
  return {
    x: Math.min(parent.width - width, Math.max(0, rect.x)),
    y: Math.min(parent.height - height, Math.max(0, rect.y)),
    width,
    height,
  }
}

export function resizeDimensionIntent(
  sizing: UISizing,
  axis: 'width' | 'height',
  value: number,
): UISizing {
  return {
    ...sizing,
    [axis]: { mode: 'fixed', value: Math.max(0, value), unit: 'px' },
  }
}
