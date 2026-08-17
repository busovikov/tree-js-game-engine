import {
  UIDocumentSchema,
  type UIDocument,
  type UIElement,
  type UIElementId,
  type UIBound,
  type UIAccessibility,
  type UILayout,
  type UIPlacement,
  type UISize,
  type UISizing,
  type UIStyle,
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

export type UIConstraintAxis = 'horizontal' | 'vertical'
export type UIHorizontalConstraint = Extract<
  UIPlacement,
  { positioning: 'free' }
>['horizontalConstraint']
export type UIVerticalConstraint = Extract<
  UIPlacement,
  { positioning: 'free' }
>['verticalConstraint']
export type UIAbsoluteOffset = 'top' | 'right' | 'bottom' | 'left'
export type UIStyleSection = 'typography' | 'image-fit'
export type UIAccessibilityField = 'alt' | 'decorative' | 'label-reset'
export type UICornerRadius = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'

const TYPOGRAPHY_ELEMENT_TYPES = new Set<UIElement['type']>([
  'text',
  'button',
  'text-input',
  'text-area',
  'checkbox',
  'radio',
  'switch',
  'select',
  'list',
])
const REQUIRED_ACCESSIBLE_LABEL_TYPES = new Set<UIElement['type']>([
  'text-input',
  'text-area',
  'select',
  'slider',
  'progress',
])

export function explainUIAccessibilityField(
  element: UIElement,
  field: UIAccessibilityField,
): string | null {
  if ((field === 'alt' || field === 'decorative') && element.type !== 'image') {
    return 'Alternative text and decorative purpose are available only for Image elements.'
  }
  if (field === 'label-reset' && REQUIRED_ACCESSIBLE_LABEL_TYPES.has(element.type)) {
    return 'An accessible label is required for this element type.'
  }
  return null
}

export function updateUIElementAccessibility(
  asset: UIDocument,
  id: UIElementId | string,
  patch: Partial<UIAccessibility>,
): UIDocument {
  const element = asset.elements.find((candidate) => candidate.id === id)
  if (!element) throw new Error(`Unknown UI element: ${id}`)
  const accessibility: Record<string, unknown> = { ...element.accessibility }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete accessibility[key]
    else accessibility[key] = value
  }
  return updateUIElementStrict(asset, id, { accessibility })
}

export function updateUIImageAccessibility(
  asset: UIDocument,
  id: UIElementId | string,
  patch: { readonly alt?: string; readonly decorative?: boolean },
): UIDocument {
  const element = asset.elements.find((candidate) => candidate.id === id)
  if (!element) throw new Error(`Unknown UI element: ${id}`)
  if (element.type !== 'image') throw new Error('Image accessibility is available only for Images.')
  let alt = patch.alt ?? element.alt
  let decorative = patch.decorative ?? element.decorative
  if (patch.decorative === true) alt = ''
  if (patch.alt !== undefined && patch.alt.trim() !== '') decorative = false
  return updateUIElementStrict(asset, id, { alt, decorative })
}

export function explainUIStyleSection(element: UIElement, section: UIStyleSection): string | null {
  if (section === 'image-fit' && element.type !== 'image') {
    return 'Image fit is available only for Image elements.'
  }
  if (section === 'typography' && !TYPOGRAPHY_ELEMENT_TYPES.has(element.type)) {
    return 'Typography is available only for elements with text content.'
  }
  return null
}

export function updateUIElementStyle(
  asset: UIDocument,
  id: UIElementId | string,
  patch: Partial<UIStyle>,
): UIDocument {
  const element = asset.elements.find((candidate) => candidate.id === id)
  if (!element) throw new Error(`Unknown UI element: ${id}`)
  const style: Record<string, unknown> = { ...element.style }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete style[key]
    else style[key] = value
  }
  return updateUIElementStrict(asset, id, { style })
}

export function updateUICornerRadius(
  asset: UIDocument,
  id: UIElementId | string,
  corner: UICornerRadius,
  value: number,
): UIDocument {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Corner radius must be a finite non-negative number.')
  }
  const element = asset.elements.find((candidate) => candidate.id === id)
  if (!element) throw new Error(`Unknown UI element: ${id}`)
  const current = element.style.borderRadius
  const radii =
    typeof current === 'number'
      ? { topLeft: current, topRight: current, bottomRight: current, bottomLeft: current }
      : { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0, ...current }
  return updateUIElementStyle(asset, id, {
    borderRadius: { ...radii, [corner]: value },
  })
}

function parentOf(asset: UIDocument, id: UIElementId | string): UIElement | undefined {
  return asset.elements.find(
    (candidate) => 'children' in candidate && candidate.children.includes(id as UIElementId),
  )
}

function hasFiniteRect(rect: UIRect | undefined): rect is UIRect {
  return Boolean(
    rect &&
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    rect.width >= 0 &&
    Number.isFinite(rect.height) &&
    rect.height >= 0,
  )
}

function measuredPlacementReason(
  asset: UIDocument,
  id: UIElementId | string,
  bounds: ReadonlyMap<UIElementId | string, UIRect>,
  axis?: UIConstraintAxis,
): string | null {
  const parent = parentOf(asset, id)
  const parentRect = parent ? bounds.get(parent.id) : undefined
  const elementRect = bounds.get(id)
  if (!parentRect || !elementRect) return 'Placement requires measured parent and element bounds.'
  if (!Number.isFinite(parentRect.x) || !Number.isFinite(parentRect.y)) {
    return 'Placement requires finite measured parent bounds.'
  }
  if (axis === 'horizontal' && (!Number.isFinite(parentRect.width) || parentRect.width <= 0)) {
    return 'Constraint editing requires a finite positive measured parent width.'
  }
  if (axis === 'vertical' && (!Number.isFinite(parentRect.height) || parentRect.height <= 0)) {
    return 'Constraint editing requires a finite positive measured parent height.'
  }
  if (
    !axis &&
    (!Number.isFinite(parentRect.width) ||
      parentRect.width <= 0 ||
      !Number.isFinite(parentRect.height) ||
      parentRect.height <= 0)
  ) {
    return 'Absolute positioning requires finite positive measured parent bounds.'
  }
  if (!hasFiniteRect(elementRect)) return 'Placement requires finite measured element bounds.'
  return null
}

export function explainUIConstraintEdit(
  asset: UIDocument,
  id: UIElementId | string,
  axis: UIConstraintAxis,
  bounds: ReadonlyMap<UIElementId | string, UIRect>,
): string | null {
  const element = asset.elements.find((candidate) => candidate.id === id)
  if (!element) return `Unknown UI element: ${id}`
  const parent = parentOf(asset, id)
  if (!parent || !('layout' in parent) || parent.layout.mode !== 'free') {
    return 'Constraints are available only for a child of a Free layout Frame.'
  }
  if (element.placement.positioning !== 'free') {
    return 'Constraints require free placement.'
  }
  return measuredPlacementReason(asset, id, bounds, axis)
}

export function updateUIFreeConstraint(
  asset: UIDocument,
  id: UIElementId | string,
  axis: UIConstraintAxis,
  constraint: UIHorizontalConstraint | UIVerticalConstraint,
  bounds: ReadonlyMap<UIElementId | string, UIRect>,
): UIDocument {
  const reason = explainUIConstraintEdit(asset, id, axis, bounds)
  if (reason) throw new Error(reason)
  const element = asset.elements.find((candidate) => candidate.id === id)!
  const parent = parentOf(asset, id)!
  const elementRect = bounds.get(id)!
  const parentRect = bounds.get(parent.id)!
  const placement = element.placement as Extract<UIPlacement, { positioning: 'free' }>
  const nextPlacement: Extract<UIPlacement, { positioning: 'free' }> = {
    ...placement,
    x: elementRect.x - parentRect.x,
    y: elementRect.y - parentRect.y,
    referenceWidth: parentRect.width,
    referenceHeight: parentRect.height,
    ...(axis === 'horizontal'
      ? { horizontalConstraint: constraint as UIHorizontalConstraint }
      : { verticalConstraint: constraint as UIVerticalConstraint }),
  }
  return updateUIElementStrict(asset, id, { placement: nextPlacement })
}

export function explainUIPlacementMode(
  asset: UIDocument,
  id: UIElementId | string,
  mode: 'flow' | 'absolute',
  bounds: ReadonlyMap<UIElementId | string, UIRect>,
): string | null {
  const element = asset.elements.find((candidate) => candidate.id === id)
  if (!element) return `Unknown UI element: ${id}`
  if (element.id === asset.root) return 'The root Frame does not have editable child placement.'
  const parent = parentOf(asset, id)
  if (!parent || !('layout' in parent)) return 'Placement requires a Frame parent.'
  if (parent.layout.mode === 'free') {
    return 'Flow and Absolute placement are available only inside Auto layout.'
  }
  if (element.placement.positioning === 'free') {
    return 'Free placement is invalid inside Auto layout.'
  }
  if (
    mode === 'absolute' &&
    (element.sizing.width.mode === 'fill' || element.sizing.height.mode === 'fill')
  ) {
    return 'Absolute positioning is unavailable while either axis uses Fill.'
  }
  if (mode === 'absolute' && element.placement.positioning === 'flow') {
    return measuredPlacementReason(asset, id, bounds)
  }
  return null
}

export function convertUIPlacement(
  asset: UIDocument,
  id: UIElementId | string,
  mode: 'flow' | 'absolute',
  bounds: ReadonlyMap<UIElementId | string, UIRect>,
): UIDocument {
  const reason = explainUIPlacementMode(asset, id, mode, bounds)
  if (reason) throw new Error(reason)
  const element = asset.elements.find((candidate) => candidate.id === id)!
  if (element.placement.positioning === mode) {
    return UIDocumentSchema.parse(structuredClone(asset))
  }
  if (mode === 'flow')
    return updateUIElementStrict(asset, id, { placement: { positioning: 'flow' } })
  const parent = parentOf(asset, id)!
  const elementRect = bounds.get(id)!
  const parentRect = bounds.get(parent.id)!
  return updateUIElementStrict(asset, id, {
    placement: {
      positioning: 'absolute',
      left: elementRect.x - parentRect.x,
      top: elementRect.y - parentRect.y,
    },
  })
}

export function updateUIAbsoluteOffset(
  asset: UIDocument,
  id: UIElementId | string,
  side: UIAbsoluteOffset,
  value: number,
): UIDocument {
  if (!Number.isFinite(value)) throw new Error('Absolute placement requires a finite offset.')
  const element = asset.elements.find((candidate) => candidate.id === id)
  if (!element) throw new Error(`Unknown UI element: ${id}`)
  if (element.placement.positioning !== 'absolute') {
    throw new Error('Offsets are available only for absolute placement.')
  }
  return updateUIElementStrict(asset, id, {
    placement: { ...element.placement, [side]: value },
  })
}

export function convertUIFixedUnit(
  current: Extract<UISize, { mode: 'fixed' }>,
  unit: 'px' | '%',
  context: { readonly isRoot: boolean; readonly measured: number; readonly reference: number },
): Extract<UISize, { mode: 'fixed' }> {
  if (current.unit === unit) return current
  if (!Number.isFinite(context.measured) || context.measured < 0) {
    throw new Error('Fixed unit conversion requires a finite measured element size.')
  }
  if (unit === '%') {
    if (context.isRoot) throw new Error('Percentage sizing is unavailable on the root Frame.')
    if (!Number.isFinite(context.reference) || context.reference <= 0) {
      throw new Error('Percentage conversion requires a positive measured parent size.')
    }
    return { mode: 'fixed', value: (context.measured / context.reference) * 100, unit }
  }
  return { mode: 'fixed', value: context.measured, unit }
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
  if (percent && context.isRoot)
    throw new Error('Percentage sizing is unavailable on the root Frame.')
  return { mode: 'fixed', value: numeric, unit: percent ? '%' : 'px' }
}

export function explainUISizeMode(mode: UISizeMode, context: UISizeContext): string | null {
  if (mode === 'fill' && context.isRoot) return 'Fill is unavailable on the root Frame.'
  if (mode === 'fill' && (context.parentLayout === 'free' || context.positioning === 'free')) {
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
      element.id === id ? { ...element, ...patch, id: element.id, type: element.type } : element,
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
    wrap: current.mode === 'horizontal' || current.mode === 'vertical' ? current.wrap : false,
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
    if (!childBounds)
      throw new Error(`Layout conversion requires measured bounds for ${element.id}`)
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
            ? {
                mode: 'fixed' as const,
                value: Math.max(0, childBounds.height),
                unit: 'px' as const,
              }
            : element.sizing.height,
      },
    }
  })

  return UIDocumentSchema.parse({ ...asset, elements: nextElements })
}
