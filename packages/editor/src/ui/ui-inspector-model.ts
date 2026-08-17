import {
  UIDocumentSchema,
  type UIDocument,
  type UIElement,
  type UIElementId,
  type UIBound,
  type UILayout,
  type UISize,
  type UISizing,
} from '@haku/ui'
import type { UIRect } from './ui-gesture-transaction.js'

export type UISizeMode = UISize['mode']
export type UIContainerLayoutMode = UILayout['mode']

export interface UISizeContext {
  readonly isRoot: boolean
  readonly parentLayout: UIContainerLayoutMode | null
  readonly positioning: UIElement['placement']['positioning']
}

export interface UISizeConversionContext extends UISizeContext {
  readonly measured: number
  readonly unit: 'px' | '%'
}

export type UISizingBoundKey = 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight'

export function updateUISizingBound(
  sizing: UISizing,
  key: UISizingBoundKey,
  bound: UIBound | undefined,
): UISizing {
  if (bound && (!Number.isFinite(bound.value) || bound.value < 0)) {
    throw new Error(`${key} must be a finite non-negative number.`)
  }
  const next = { ...sizing, [key]: bound }
  const axis = key.endsWith('Width') ? 'Width' : 'Height'
  const min = next[`min${axis}`]
  const max = next[`max${axis}`]
  if (min && max && min.unit === max.unit && min.value > max.value) {
    throw new Error(`min${axis} cannot exceed max${axis} when both use ${min.unit}.`)
  }
  return next
}

export function formatUISize(size: UISize): string {
  if (size.mode === 'hug') return 'auto'
  if (size.mode === 'fill') return 'fill'
  return `${size.value}${size.unit === '%' ? '%' : ''}`
}

export function parseUISize(input: string, context: UISizeContext): UISize {
  const value = input.trim().toLowerCase()
  if (value === 'auto' || value === 'hug') return { mode: 'hug' }
  if (value === 'fill') {
    const explanation = explainUISizeMode('fill', context)
    if (explanation) throw new Error(explanation)
    return { mode: 'fill' }
  }
  const percent = value.endsWith('%')
  const numeric = Number(percent ? value.slice(0, -1).trim() : value)
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error('Size must be a non-negative finite number, percentage, auto, or fill.')
  }
  if (percent && context.isRoot) throw new Error('Percentage sizing is unavailable on the root Frame.')
  return { mode: 'fixed', value: numeric, unit: percent ? '%' : 'px' }
}

export function explainUISizeMode(mode: UISizeMode, context: UISizeContext): string | null {
  if (mode === 'fill' && context.isRoot) return 'Fill is unavailable on the root Frame.'
  if (
    mode === 'fill' &&
    (context.parentLayout === 'free' || context.positioning === 'free')
  ) {
    return 'Fill is unavailable for an element positioned in free layout.'
  }
  return null
}

export function convertUISize(
  current: UISize,
  mode: UISizeMode,
  context: UISizeConversionContext,
): UISize {
  const explanation = explainUISizeMode(mode, context)
  if (explanation) throw new Error(explanation)
  if (mode === current.mode && mode !== 'fixed') return current
  if (mode === 'hug') return { mode: 'hug' }
  if (mode === 'fill') return { mode: 'fill' }
  const measured = Number.isFinite(context.measured) ? Math.max(0, context.measured) : 0
  return {
    mode: 'fixed',
    value: current.mode === 'fixed' && current.unit === context.unit ? current.value : measured,
    unit: context.unit,
  }
}

export function updateUIElementStrict(
  asset: UIDocument,
  id: UIElementId | string,
  patch: Record<string, unknown>,
): UIDocument {
  if (!asset.elements.some((element) => element.id === id)) {
    throw new Error(`Unknown UI element: ${id}`)
  }
  return UIDocumentSchema.parse({
    ...asset,
    elements: asset.elements.map((element) =>
      element.id === id
        ? { ...element, ...patch, id: element.id, type: element.type }
        : element,
    ),
  })
}

function convertedLayout(current: UILayout, mode: UIContainerLayoutMode): UILayout {
  if (mode === 'free') return { mode, padding: current.padding }
  const shared = {
    padding: current.padding,
    rowGap: current.mode === 'free' ? 0 : current.rowGap,
    columnGap: current.mode === 'free' ? 0 : current.columnGap,
    distribution: current.mode === 'free' ? ('start' as const) : current.distribution,
    alignment: current.mode === 'free' ? ('stretch' as const) : current.alignment,
  }
  if (mode === 'grid') {
    return { ...shared, mode, columns: current.mode === 'grid' ? current.columns : 1 }
  }
  return {
    ...shared,
    mode,
    wrap:
      current.mode === 'horizontal' || current.mode === 'vertical' ? current.wrap : false,
  }
}

export function convertFrameLayout(
  asset: UIDocument,
  frameId: UIElementId | string,
  mode: UIContainerLayoutMode,
  bounds: ReadonlyMap<UIElementId | string, UIRect>,
): UIDocument {
  const frame = asset.elements.find((element) => element.id === frameId)
  if (!frame || !('layout' in frame) || !('children' in frame)) {
    throw new Error(`UI layout owner must be a Frame, Scroll Container, or List: ${frameId}`)
  }
  if (frame.layout.mode === mode) return UIDocumentSchema.parse(structuredClone(asset))

  const frameBounds = bounds.get(frame.id)
  const children = new Set(frame.children)
  const nextElements = asset.elements.map((element) => {
    if (element.id === frame.id) return { ...element, layout: convertedLayout(frame.layout, mode) }
    if (!children.has(element.id)) return element
    if (mode !== 'free') {
      return element.placement.positioning === 'absolute'
        ? element
        : { ...element, placement: { positioning: 'flow' as const } }
    }
    if (!frameBounds) throw new Error('Layout conversion requires measured Frame bounds')
    const childBounds = bounds.get(element.id)
    if (!childBounds) throw new Error(`Layout conversion requires measured bounds for ${element.id}`)
    return {
      ...element,
      placement: {
        positioning: 'free' as const,
        x: childBounds.x - frameBounds.x,
        y: childBounds.y - frameBounds.y,
        horizontalConstraint: 'left' as const,
        verticalConstraint: 'top' as const,
        referenceWidth: Math.max(1, frameBounds.width),
        referenceHeight: Math.max(1, frameBounds.height),
      },
      sizing: {
        ...element.sizing,
        width:
          element.sizing.width.mode === 'fill'
            ? { mode: 'fixed' as const, value: Math.max(0, childBounds.width), unit: 'px' as const }
            : element.sizing.width,
        height:
          element.sizing.height.mode === 'fill'
            ? { mode: 'fixed' as const, value: Math.max(0, childBounds.height), unit: 'px' as const }
            : element.sizing.height,
      },
    }
  })

  return UIDocumentSchema.parse({ ...asset, elements: nextElements })
}
