/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('./panels/ViewportPanel.js', () => ({
  ViewportPanel: () => <div>Viewport panel</div>,
}))
vi.mock('./graph/GraphEditorPanel.js', () => ({
  GraphEditorPanel: () => <div>Graph panel</div>,
}))
vi.mock('./code/ProjectCodeWorkspacePanel.js', () => ({
  ProjectCodeWorkspacePanel: () => <div>Project code panel</div>,
}))
vi.mock('./components/PlaygroundDemoBanner.js', () => ({
  PlaygroundDemoBanner: () => null,
}))
vi.mock('./panels/HierarchyPanel.js', () => ({
  HierarchyPanel: () => <div>Scene hierarchy</div>,
}))
vi.mock('./panels/HierarchyToolsPanel.js', () => ({
  HierarchyToolsPanel: () => <div>Scene tools</div>,
}))
vi.mock('./panels/InspectorPanel.js', () => ({
  InspectorPanel: () => <div>Scene inspector</div>,
}))
vi.mock('./panels/AssetBrowserPanel.js', () => ({
  AssetBrowserPanel: () => <div>Scene asset browser</div>,
}))

import { EditorLayout } from './EditorLayout.js'
import { ViewportTabsShell } from './ViewportTabsShell.js'
import { useEditorStore } from './store/editor-store.js'
import { projectService } from './services/project-service.js'
import { uiAuthoringSession, uiCommandBus } from './ui/ui-editor-service.js'
import { UIDocumentSchema } from '@haku/ui'

const INITIAL_UI_ASSET = structuredClone(uiAuthoringSession.asset)!
const INSPECTED_ID = '13000000-0000-4000-8000-000000000102'

function inspectorAsset(
  type: 'image' | 'text-input' | 'text-area' | 'select' | 'slider' | 'progress',
) {
  const current = INITIAL_UI_ASSET.elements[1]!
  const fields =
    type === 'image'
      ? {
          source: {
            $ref: '13000000-0000-4000-8000-000000000120',
            type: '13000000-0000-4000-8000-000000000121',
          },
          alt: 'Score image',
        }
      : type === 'select'
        ? {
            value: 'one',
            options: [{ value: 'one', label: 'One' }],
            accessibility: { label: 'Choice' },
          }
        : type === 'slider'
          ? { min: 0, max: 10, step: 1, value: 5, accessibility: { label: 'Volume' } }
          : type === 'progress'
            ? { min: 0, max: 10, value: 5, accessibility: { label: 'Loading' } }
            : { value: '', accessibility: { label: type === 'text-input' ? 'Name' : 'Notes' } }
  return UIDocumentSchema.parse({
    ...INITIAL_UI_ASSET,
    elements: INITIAL_UI_ASSET.elements.map((element) =>
      element.id === INSPECTED_ID
        ? {
            id: current.id,
            type,
            ...fields,
            sizing: current.sizing,
            placement: current.placement,
          }
        : element,
    ),
  })
}

afterEach(cleanup)
beforeEach(() => {
  useEditorStore.setState({ activeWorkspace: 'viewport' })
  uiAuthoringSession.openAsset('builtin:m10b-runtime-hud.ui.json', INITIAL_UI_ASSET)
  uiCommandBus.clear()
})

describe('ViewportTabsShell Code workspace', () => {
  it('opens the project code workflow from a user-visible Code tab', () => {
    render(<ViewportTabsShell />)

    fireEvent.click(screen.getByRole('tab', { name: 'Code' }))

    expect(screen.getByText('Project code panel')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Code' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('ViewportTabsShell UI workspace baseline', () => {
  it('replaces the scene body with dedicated resizable UI panels and restores it on exit', () => {
    render(<EditorLayout />)

    expect(screen.getByText('Scene hierarchy')).toBeTruthy()
    expect(screen.getByText('Scene tools')).toBeTruthy()
    expect(screen.getByText('Scene inspector')).toBeTruthy()
    expect(screen.getByText('Scene asset browser')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))

    expect(screen.queryByText('Scene hierarchy')).toBeNull()
    expect(screen.queryByText('Scene tools')).toBeNull()
    expect(screen.queryByText('Scene inspector')).toBeNull()
    expect(screen.queryByText('Scene asset browser')).toBeNull()
    expect(screen.getByRole('complementary', { name: 'UI Layers' })).toBeTruthy()
    expect(screen.getByRole('main', { name: 'UI Canvas' })).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'UI Inspector' })).toBeTruthy()
    expect(screen.getAllByRole('separator')).toHaveLength(2)
    expect(screen.getByRole('tab', { name: 'Scene' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Scene' }).getAttribute('aria-selected')).toBe('false')

    fireEvent.click(screen.getByRole('tab', { name: 'Scene' }))

    expect(screen.getByText('Scene hierarchy')).toBeTruthy()
    expect(screen.getByText('Scene tools')).toBeTruthy()
    expect(screen.getByText('Scene inspector')).toBeTruthy()
    expect(screen.getByText('Scene asset browser')).toBeTruthy()
  })

  it('exposes the four-element fixture, selection, path, and current preview transform', () => {
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))

    const workspace = container.querySelector('[data-haku-ui-workspace]')
    const treeItems = container.querySelectorAll('[data-haku-ui-tree-item]')
    const preview = container.querySelector('[data-haku-ui-preview]')
    expect(workspace?.getAttribute('data-haku-ui-document-path')).toBe(
      'builtin:m10b-runtime-hud.ui.json',
    )
    expect(treeItems).toHaveLength(4)
    expect(preview?.getAttribute('data-haku-ui-preview-scale')).toBe('fit')
    expect(preview?.getAttribute('data-haku-ui-preview-origin')).toBe('center')

    const continueItem = container.querySelector(
      '[data-haku-ui-tree-item="13000000-0000-4000-8000-000000000103"]',
    ) as HTMLButtonElement
    fireEvent.click(continueItem)
    expect(workspace?.getAttribute('data-haku-ui-selected-id')).toBe(
      '13000000-0000-4000-8000-000000000103',
    )
  })

  it.each([
    ['13000000-0000-4000-8000-000000000102', 'fixed', '100', '%'],
    ['13000000-0000-4000-8000-000000000104', 'hug', null, null],
  ])('round-trips the %s element width without unit coercion', (elementId, mode, value, unit) => {
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    const treeItem = container.querySelector(
      `[data-haku-ui-tree-item="${elementId}"]`,
    ) as HTMLButtonElement
    fireEvent.click(treeItem)

    expect((screen.getByLabelText('Width mode') as HTMLSelectElement).value).toBe(mode)
    if (value === null) {
      expect(screen.queryByLabelText('Width value')).toBeNull()
    } else {
      expect((screen.getByLabelText('Width value') as HTMLInputElement).value).toBe(value)
      expect((screen.getByLabelText('Width unit') as HTMLSelectElement).value).toBe(unit)
    }
  })

  it('converts Fixed units explicitly and rejects an inverted comparable bound atomically', () => {
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(
        '[data-haku-ui-tree-item="13000000-0000-4000-8000-000000000102"]',
      ) as HTMLButtonElement,
    )
    uiCommandBus.clear()
    const before = structuredClone(uiAuthoringSession.asset)!

    fireEvent.change(screen.getByLabelText('Width unit'), { target: { value: 'px' } })
    const score = uiAuthoringSession.asset!.elements[1]!
    expect(score.sizing.width).toMatchObject({ mode: 'fixed', unit: 'px' })
    expect(score.sizing.width.mode === 'fixed' && Number.isFinite(score.sizing.width.value)).toBe(
      true,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(before)

    fireEvent.change(screen.getByLabelText('Min width unit'), { target: { value: 'px' } })
    const minWidth = screen.getByLabelText('Min width')
    fireEvent.change(minWidth, { target: { value: '200' } })
    fireEvent.blur(minWidth)
    fireEvent.change(screen.getByLabelText('Max width unit'), { target: { value: 'px' } })
    const beforeInvalid = structuredClone(uiAuthoringSession.asset)!
    const maxWidth = screen.getByLabelText('Max width')
    fireEvent.change(maxWidth, { target: { value: '100' } })
    fireEvent.blur(maxWidth)

    expect(screen.getByRole('alert').textContent).toMatch(/minWidth cannot exceed maxWidth/i)
    expect(uiAuthoringSession.asset).toEqual(beforeInvalid)
    expect(() => UIDocumentSchema.parse(uiAuthoringSession.asset)).not.toThrow()
  })

  it('converts HUD Root from Free to Horizontal as one exact undoable document edit', () => {
    render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    const before = structuredClone(uiAuthoringSession.asset)

    fireEvent.change(screen.getByLabelText('Layout mode'), { target: { value: 'horizontal' } })

    expect(uiAuthoringSession.asset?.elements[0]).toMatchObject({
      layout: { mode: 'horizontal', wrap: false },
    })
    expect(uiAuthoringSession.asset?.elements.slice(1).map((element) => element.placement)).toEqual(
      [{ positioning: 'flow' }, { positioning: 'flow' }, { positioning: 'flow' }],
    )
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(before)
  })

  it('groups each numeric scrub gesture into its own exact undo without invalid assets', () => {
    render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    uiCommandBus.clear()
    const before = structuredClone(uiAuthoringSession.asset)!
    const label = screen.getByText('Padding top') as HTMLElement
    Object.assign(label, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
    })

    fireEvent.pointerDown(label, { button: 0, pointerId: 7, clientX: 0 })
    fireEvent.pointerMove(label, { pointerId: 7, clientX: 20 })
    fireEvent.pointerMove(label, { pointerId: 7, clientX: 40 })
    fireEvent.pointerMove(label, { pointerId: 7, clientX: 60 })
    fireEvent.pointerUp(label, { pointerId: 7, clientX: 60 })
    const afterFirst = structuredClone(uiAuthoringSession.asset)!
    expect(afterFirst.elements[0]).toMatchObject({ layout: { padding: { top: 27 } } })
    expect(() => UIDocumentSchema.parse(afterFirst)).not.toThrow()

    fireEvent.pointerDown(label, { button: 0, pointerId: 8, clientX: 0 })
    fireEvent.pointerMove(label, { pointerId: 8, clientX: 40 })
    fireEvent.pointerUp(label, { pointerId: 8, clientX: 40 })
    expect(uiAuthoringSession.asset?.elements[0]).toMatchObject({
      layout: { padding: { top: 29 } },
    })
    expect(() => UIDocumentSchema.parse(uiAuthoringSession.asset)).not.toThrow()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(afterFirst)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(before)
  })

  it('exposes visual horizontal and vertical constraints as strict one-step edits', () => {
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(
        '[data-haku-ui-tree-item="13000000-0000-4000-8000-000000000102"]',
      ) as HTMLButtonElement,
    )
    uiCommandBus.clear()
    const before = structuredClone(uiAuthoringSession.asset)!
    const placement = screen.getByRole('region', { name: 'Placement' })

    expect(
      container.querySelector('[data-haku-ui-constraint-anchor="horizontal-center"]'),
    ).toBeTruthy()
    expect(container.querySelector('[data-haku-ui-constraint-anchor="vertical-top"]')).toBeTruthy()
    expect(
      within(placement).getByRole('button', { name: 'Left' }).getAttribute('aria-pressed'),
    ).toBe('false')
    fireEvent.click(within(placement).getByRole('button', { name: 'Right' }))
    const afterHorizontal = structuredClone(uiAuthoringSession.asset)!
    expect(afterHorizontal.elements[1]!.placement).toMatchObject({
      positioning: 'free',
      horizontalConstraint: 'right',
      referenceWidth: 1280,
    })
    expect(
      container.querySelector('[data-haku-ui-constraint-anchor="horizontal-right"]'),
    ).toBeTruthy()
    expect(() => UIDocumentSchema.parse(afterHorizontal)).not.toThrow()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(before)

    fireEvent.click(within(placement).getByRole('button', { name: 'Bottom' }))
    expect(uiAuthoringSession.asset!.elements[1]!.placement).toMatchObject({
      positioning: 'free',
      verticalConstraint: 'bottom',
      referenceHeight: 720,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(before)
  })

  it('converts auto-layout Flow and Absolute placement with exact undo and safe drafts', () => {
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.change(screen.getByLabelText('Layout mode'), { target: { value: 'vertical' } })
    fireEvent.click(
      container.querySelector(
        '[data-haku-ui-tree-item="13000000-0000-4000-8000-000000000103"]',
      ) as HTMLButtonElement,
    )
    uiCommandBus.clear()
    const flow = structuredClone(uiAuthoringSession.asset)!
    const placement = screen.getByRole('region', { name: 'Placement' })

    fireEvent.click(within(placement).getByRole('button', { name: 'Absolute' }))
    const absolute = structuredClone(uiAuthoringSession.asset)!
    expect(absolute.elements[2]!.placement).toEqual({
      positioning: 'absolute',
      left: expect.any(Number),
      top: expect.any(Number),
    })
    expect(Number.isFinite((absolute.elements[2]!.placement as { left: number }).left)).toBe(true)
    expect(() => UIDocumentSchema.parse(absolute)).not.toThrow()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(flow)

    fireEvent.click(within(placement).getByRole('button', { name: 'Absolute' }))
    uiCommandBus.clear()
    const beforeInvalid = structuredClone(uiAuthoringSession.asset)!
    const left = within(placement).getByLabelText('Left offset')
    fireEvent.change(left, { target: { value: 'NaN' } })
    fireEvent.blur(left)
    expect(uiAuthoringSession.asset).toEqual(beforeInvalid)
    expect(uiCommandBus.canUndo()).toBe(false)

    fireEvent.click(within(placement).getByRole('button', { name: 'Flow' }))
    expect(uiAuthoringSession.asset!.elements[2]!.placement).toEqual({ positioning: 'flow' })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(beforeInvalid)
  })

  it('explains and blocks Absolute placement when Flow sizing uses Fill', () => {
    const autoAsset = UIDocumentSchema.parse({
      ...INITIAL_UI_ASSET,
      elements: INITIAL_UI_ASSET.elements.map((element) =>
        element.id === INITIAL_UI_ASSET.root
          ? { ...element, layout: { mode: 'vertical' } }
          : {
              ...element,
              placement: { positioning: 'flow' },
              ...(element.id === '13000000-0000-4000-8000-000000000102'
                ? { sizing: { ...element.sizing, width: { mode: 'fill' } } }
                : {}),
            },
      ),
    })
    uiAuthoringSession.openAsset('builtin:m10b-runtime-hud.ui.json', autoAsset)
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(
        '[data-haku-ui-tree-item="13000000-0000-4000-8000-000000000102"]',
      ) as HTMLButtonElement,
    )
    uiCommandBus.clear()
    const before = structuredClone(uiAuthoringSession.asset)!
    const placement = screen.getByRole('region', { name: 'Placement' })
    const absolute = within(placement).getByRole('button', { name: 'Absolute' })

    expect((absolute as HTMLButtonElement).disabled).toBe(true)
    expect(absolute.getAttribute('title')).toMatch(/either axis uses Fill/i)
    expect(within(placement).getByText(/either axis uses Fill/i)).toBeTruthy()
    fireEvent.click(absolute)
    expect(uiAuthoringSession.asset).toEqual(before)
    expect(uiCommandBus.canUndo()).toBe(false)
  })

  it('exposes lossless typography, fill, stroke, corner radius, and opacity controls', () => {
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(
        '[data-haku-ui-tree-item="13000000-0000-4000-8000-000000000102"]',
      ) as HTMLButtonElement,
    )
    const style = screen.getByRole('region', { name: 'Style' })

    expect(within(style).queryByLabelText('Image fit')).toBeNull()
    fireEvent.change(within(style).getByLabelText('Font family'), {
      target: { value: '"IBM Plex Sans", sans-serif' },
    })
    fireEvent.blur(within(style).getByLabelText('Font family'))
    fireEvent.change(within(style).getByLabelText('Font size'), { target: { value: '17.5' } })
    fireEvent.blur(within(style).getByLabelText('Font size'))
    fireEvent.change(within(style).getByLabelText('Font weight'), { target: { value: 'custom' } })
    fireEvent.change(within(style).getByLabelText('Custom font weight'), {
      target: { value: '575' },
    })
    fireEvent.blur(within(style).getByLabelText('Custom font weight'))
    fireEvent.change(within(style).getByLabelText('Font style'), { target: { value: 'italic' } })
    fireEvent.change(within(style).getByLabelText('Line height source'), {
      target: { value: 'custom' },
    })
    fireEvent.change(within(style).getByLabelText('Line height'), { target: { value: '25.25' } })
    fireEvent.blur(within(style).getByLabelText('Line height'))
    fireEvent.change(within(style).getByLabelText('Letter spacing source'), {
      target: { value: 'custom' },
    })
    fireEvent.change(within(style).getByLabelText('Letter spacing'), {
      target: { value: '-0.75' },
    })
    fireEvent.blur(within(style).getByLabelText('Letter spacing'))
    fireEvent.change(within(style).getByLabelText('Text align'), { target: { value: 'justify' } })
    fireEvent.change(within(style).getByLabelText('Text color'), { target: { value: '#123456' } })
    fireEvent.blur(within(style).getByLabelText('Text color'))
    fireEvent.change(within(style).getByLabelText('Fill'), {
      target: { value: 'color(display-p3 0.1 0.2 0.3)' },
    })
    fireEvent.blur(within(style).getByLabelText('Fill'))
    fireEvent.change(within(style).getByLabelText('Stroke color'), {
      target: { value: 'oklch(70% 0.2 30)' },
    })
    fireEvent.blur(within(style).getByLabelText('Stroke color'))
    fireEvent.change(within(style).getByLabelText('Stroke width source'), {
      target: { value: 'custom' },
    })
    fireEvent.change(within(style).getByLabelText('Stroke width'), { target: { value: '1.5' } })
    fireEvent.blur(within(style).getByLabelText('Stroke width'))
    fireEvent.change(within(style).getByLabelText('Corner radius source'), {
      target: { value: 'per-corner' },
    })
    fireEvent.change(within(style).getByLabelText('Radius top left'), {
      target: { value: '12.5' },
    })
    fireEvent.blur(within(style).getByLabelText('Radius top left'))
    fireEvent.change(within(style).getByLabelText('Opacity source'), {
      target: { value: 'custom' },
    })
    fireEvent.change(within(style).getByLabelText('Opacity'), { target: { value: '0.625' } })
    fireEvent.blur(within(style).getByLabelText('Opacity'))

    expect(uiAuthoringSession.asset!.elements[1]!.style).toEqual({
      color: '#123456',
      backgroundColor: 'color(display-p3 0.1 0.2 0.3)',
      fontFamily: '"IBM Plex Sans", sans-serif',
      fontSize: 17.5,
      fontWeight: 575,
      fontStyle: 'italic',
      lineHeight: 25.25,
      letterSpacing: -0.75,
      textAlign: 'justify',
      borderColor: 'oklch(70% 0.2 30)',
      borderWidth: 1.5,
      borderRadius: { topLeft: 12.5, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      opacity: 0.625,
    })
    expect(() => UIDocumentSchema.parse(uiAuthoringSession.asset)).not.toThrow()
  })

  it('keeps invalid style drafts atomic and gives discrete edits and scrubs exact undo', () => {
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(
        '[data-haku-ui-tree-item="13000000-0000-4000-8000-000000000102"]',
      ) as HTMLButtonElement,
    )
    const style = screen.getByRole('region', { name: 'Style' })
    uiCommandBus.clear()
    const beforeInvalid = structuredClone(uiAuthoringSession.asset)!
    const fontSize = within(style).getByLabelText('Font size')
    fireEvent.change(fontSize, { target: { value: 'NaN' } })
    fireEvent.blur(fontSize)
    expect(uiAuthoringSession.asset).toEqual(beforeInvalid)
    expect(uiCommandBus.canUndo()).toBe(false)
    fireEvent.change(fontSize, { target: { value: '0' } })
    fireEvent.blur(fontSize)
    expect(uiAuthoringSession.asset).toEqual(beforeInvalid)
    expect(uiCommandBus.canUndo()).toBe(false)

    fireEvent.change(within(style).getByLabelText('Font style'), { target: { value: 'italic' } })
    expect(uiAuthoringSession.asset!.elements[1]!.style.fontStyle).toBe('italic')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(beforeInvalid)

    fireEvent.change(within(style).getByLabelText('Opacity source'), {
      target: { value: 'custom' },
    })
    uiCommandBus.clear()
    const beforeScrub = structuredClone(uiAuthoringSession.asset)!
    const opacityLabel = within(style).getByText('Opacity') as HTMLElement
    Object.assign(opacityLabel, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
    })
    fireEvent.pointerDown(opacityLabel, { button: 0, pointerId: 31, clientX: 0 })
    fireEvent.pointerMove(opacityLabel, { pointerId: 31, clientX: -20 })
    fireEvent.pointerMove(opacityLabel, { pointerId: 31, clientX: -40 })
    fireEvent.pointerUp(opacityLabel, { pointerId: 31, clientX: -40 })
    const afterScrub = structuredClone(uiAuthoringSession.asset)!
    expect(afterScrub).not.toEqual(beforeScrub)
    expect(() => UIDocumentSchema.parse(afterScrub)).not.toThrow()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(beforeScrub)
    expect(uiCommandBus.canUndo()).toBe(false)
  })

  it('shows Image fit only for Images and restores its discrete edit with one Undo', () => {
    const imageId = '13000000-0000-4000-8000-000000000102'
    const current = INITIAL_UI_ASSET.elements[1]!
    const imageAsset = UIDocumentSchema.parse({
      ...INITIAL_UI_ASSET,
      elements: INITIAL_UI_ASSET.elements.map((element) =>
        element.id === imageId
          ? {
              id: current.id,
              type: 'image',
              source: {
                $ref: '13000000-0000-4000-8000-000000000120',
                type: '13000000-0000-4000-8000-000000000121',
              },
              alt: 'Score image',
              sizing: current.sizing,
              placement: current.placement,
              style: { objectFit: 'contain' },
              accessibility: current.accessibility,
            }
          : element,
      ),
    })
    uiAuthoringSession.openAsset('builtin:m10b-runtime-hud.ui.json', imageAsset)
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(`[data-haku-ui-tree-item="${imageId}"]`) as HTMLButtonElement,
    )
    uiCommandBus.clear()
    const before = structuredClone(uiAuthoringSession.asset)!
    const style = screen.getByRole('region', { name: 'Style' })

    expect(within(style).queryByLabelText('Font family')).toBeNull()
    fireEvent.change(within(style).getByLabelText('Image fit'), {
      target: { value: 'scale-down' },
    })
    expect(uiAuthoringSession.asset!.elements[1]!.style.objectFit).toBe('scale-down')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(before)
  })

  it('exposes every optional accessibility field through local drafts and exact discrete Undo', () => {
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(`[data-haku-ui-tree-item="${INSPECTED_ID}"]`) as HTMLButtonElement,
    )
    const accessibility = screen.getByRole('region', { name: 'Accessibility' })

    expect(within(accessibility).queryByLabelText('Alternative text')).toBeNull()
    expect(screen.queryByLabelText('Alt text')).toBeNull()
    const label = within(accessibility).getByLabelText('Accessible label')
    const beforeLabel = structuredClone(uiAuthoringSession.asset)!
    fireEvent.change(label, { target: { value: 'Score announcement' } })
    expect(uiAuthoringSession.asset).toEqual(beforeLabel)
    fireEvent.blur(label)
    expect(uiAuthoringSession.asset!.elements[1]!.accessibility.label).toBe('Score announcement')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(beforeLabel)
    expect(uiCommandBus.canUndo()).toBe(false)

    const description = within(accessibility).getByLabelText('Accessible description')
    fireEvent.change(description, { target: { value: 'Updates when the score changes' } })
    fireEvent.keyDown(description, { key: 'Escape' })
    expect((description as HTMLInputElement).value).toBe('')
    expect(uiAuthoringSession.asset).toEqual(beforeLabel)
    fireEvent.change(description, { target: { value: 'Updates when the score changes' } })
    fireEvent.blur(description)
    expect(uiAuthoringSession.asset!.elements[1]!.accessibility.description).toBe(
      'Updates when the score changes',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(beforeLabel)
    expect(uiCommandBus.canUndo()).toBe(false)

    for (const [name, value, expected] of [
      ['ARIA role', 'status', { role: 'status' }],
      ['Live region', 'assertive', { live: 'assertive' }],
      ['Tab order', '-1', { tabIndex: -1 }],
    ] as const) {
      const before = structuredClone(uiAuthoringSession.asset)!
      fireEvent.change(within(accessibility).getByLabelText(name), { target: { value } })
      expect(uiAuthoringSession.asset!.elements[1]!.accessibility).toMatchObject(expected)
      expect(() => UIDocumentSchema.parse(uiAuthoringSession.asset)).not.toThrow()
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      expect(uiAuthoringSession.asset).toEqual(before)
      expect(uiCommandBus.canUndo()).toBe(false)
    }
  })

  it.each(['text-input', 'text-area', 'select', 'slider', 'progress'] as const)(
    'keeps the required accessible name for %s atomic when its local draft is invalid',
    (type) => {
      uiAuthoringSession.openAsset('builtin:m10b-runtime-hud.ui.json', inspectorAsset(type))
      const { container } = render(<ViewportTabsShell />)
      fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
      fireEvent.click(
        container.querySelector(`[data-haku-ui-tree-item="${INSPECTED_ID}"]`) as HTMLButtonElement,
      )
      uiCommandBus.clear()
      const accessibility = screen.getByRole('region', { name: 'Accessibility' })
      const label = within(accessibility).getByLabelText('Accessible label')
      const before = structuredClone(uiAuthoringSession.asset)!

      expect(label.getAttribute('aria-required')).toBe('true')
      expect(within(accessibility).getByText(/accessible label is required/i)).toBeTruthy()
      fireEvent.change(label, { target: { value: '   ' } })
      expect(uiAuthoringSession.asset).toEqual(before)
      fireEvent.blur(label)
      expect(within(accessibility).getByRole('alert').textContent).toMatch(/accessible label/i)
      expect(uiAuthoringSession.asset).toEqual(before)
      expect(uiCommandBus.canUndo()).toBe(false)
    },
  )

  it('couples Image purpose and local alt drafts without duplicate or invalid surfaces', () => {
    uiAuthoringSession.openAsset('builtin:m10b-runtime-hud.ui.json', inspectorAsset('image'))
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(`[data-haku-ui-tree-item="${INSPECTED_ID}"]`) as HTMLButtonElement,
    )
    uiCommandBus.clear()
    const accessibility = screen.getByRole('region', { name: 'Accessibility' })
    const before = structuredClone(uiAuthoringSession.asset)!

    expect(screen.queryByLabelText('Alt text')).toBeNull()
    expect(within(accessibility).getAllByLabelText('Alternative text')).toHaveLength(1)
    const invalidAlt = within(accessibility).getByLabelText('Alternative text')
    fireEvent.change(invalidAlt, { target: { value: '   ' } })
    expect(uiAuthoringSession.asset).toEqual(before)
    fireEvent.blur(invalidAlt)
    expect(within(accessibility).getByRole('alert').textContent).toMatch(/meaningful alt text/i)
    expect(uiAuthoringSession.asset).toEqual(before)
    expect(uiCommandBus.canUndo()).toBe(false)
    fireEvent.change(within(accessibility).getByLabelText('Image purpose'), {
      target: { value: 'decorative' },
    })
    expect(uiAuthoringSession.asset!.elements[1]).toMatchObject({ decorative: true, alt: '' })
    expect(() => UIDocumentSchema.parse(uiAuthoringSession.asset)).not.toThrow()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(before)
    expect(uiCommandBus.canUndo()).toBe(false)

    fireEvent.change(within(accessibility).getByLabelText('Image purpose'), {
      target: { value: 'decorative' },
    })
    uiCommandBus.clear()
    const decorative = structuredClone(uiAuthoringSession.asset)!
    expect(within(accessibility).getByText(/enter meaningful alternative text/i)).toBeTruthy()
    const meaningfulOption = within(accessibility).getByRole('option', { name: 'Meaningful' })
    expect((meaningfulOption as HTMLOptionElement).disabled).toBe(true)
    const alt = within(accessibility).getByLabelText('Alternative text')
    fireEvent.change(alt, { target: { value: 'A gold star beside the score' } })
    expect(uiAuthoringSession.asset).toEqual(decorative)
    fireEvent.blur(alt)
    expect(uiAuthoringSession.asset!.elements[1]).toMatchObject({
      decorative: false,
      alt: 'A gold star beside the score',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(decorative)
    expect(uiCommandBus.canUndo()).toBe(false)
  })

  // M2 owns replacement of the fixed-scale baseline; M3 starts direct canvas interaction.
  it('fits and centers the preview instead of using the fixed 0.5 top-left transform', () => {
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    const preview = container.querySelector('[data-haku-ui-preview]')

    expect(preview?.getAttribute('data-haku-ui-preview-scale')).toBe('fit')
    expect(preview?.getAttribute('data-haku-ui-preview-origin')).toBe('center')
  })

  it('exposes coherent authoring, preview, zoom, and compact asset controls', () => {
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))

    expect(screen.getByRole('button', { name: 'New' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy()
    expect(screen.getByRole('spinbutton', { name: 'Canvas zoom' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '100%' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fit root' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Browse UI assets' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '100%' }))
    expect(
      container.querySelector('[data-haku-ui-preview]')?.getAttribute('data-haku-ui-preview-scale'),
    ).toBe('1')
  })

  it('shares direct canvas and modified Layers selection', () => {
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))

    const scoreHit = container.querySelector(
      '[data-haku-ui-hit-target="13000000-0000-4000-8000-000000000102"]',
    ) as HTMLElement
    fireEvent.pointerDown(scoreHit, { button: 0, pointerId: 1, clientX: 200, clientY: 200 })
    fireEvent.pointerUp(scoreHit, { button: 0, pointerId: 1, clientX: 200, clientY: 200 })

    const workspace = container.querySelector('[data-haku-ui-workspace]')
    expect(workspace?.getAttribute('data-haku-ui-selected-id')).toBe(
      '13000000-0000-4000-8000-000000000102',
    )
    expect(
      container
        .querySelector('[data-haku-ui-tree-item="13000000-0000-4000-8000-000000000102"]')
        ?.getAttribute('data-haku-ui-selected'),
    ).toBe('true')

    const continueLayer = container.querySelector(
      '[data-haku-ui-tree-item="13000000-0000-4000-8000-000000000103"]',
    ) as HTMLElement
    fireEvent.click(continueLayer, { shiftKey: true })
    expect(workspace?.getAttribute('data-haku-ui-selected-ids')).toContain(
      '13000000-0000-4000-8000-000000000102',
    )
    expect(workspace?.getAttribute('data-haku-ui-selected-ids')).toContain(
      '13000000-0000-4000-8000-000000000103',
    )
  })

  it('routes shortcuts and cursor-anchored wheel zoom only through Edit mode', async () => {
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    const canvas = container.querySelector('[data-haku-ui-canvas-cursor]') as HTMLElement
    const preview = container.querySelector('[data-haku-ui-preview]')

    fireEvent.keyDown(window, { key: '1' })
    expect(preview?.getAttribute('data-haku-ui-preview-scale')).toBe('1')
    const content = container.querySelector('.haku-ui-editor__canvas-content') as HTMLElement
    const pointUnderCursor = (transform: string) => {
      const match = transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/)
      expect(match, transform).toBeTruthy()
      const [, x, y, scale] = match!.map(Number)
      return { x: (120 - x!) / scale!, y: (100 - y!) / scale! }
    }
    const anchoredBefore = pointUnderCursor(content.style.transform)
    const editWheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
      clientX: 120,
      clientY: 100,
    })
    Object.defineProperties(editWheel, {
      clientX: { value: 120 },
      clientY: { value: 100 },
    })
    fireEvent(canvas, editWheel)
    expect(editWheel.defaultPrevented).toBe(true)
    expect(editWheel.deltaY).toBe(-100)
    await waitFor(() =>
      expect((screen.getByLabelText('Canvas zoom') as HTMLInputElement).value).toBe('122'),
    )
    const editScale = Number(
      container
        .querySelector('[data-haku-ui-preview]')
        ?.getAttribute('data-haku-ui-preview-effective-scale'),
    )
    expect(editScale).toBeGreaterThan(1)
    expect(editScale).toBeLessThanOrEqual(8)
    const anchoredAfter = pointUnderCursor(content.style.transform)
    expect(anchoredAfter.x).toBeCloseTo(anchoredBefore.x, 8)
    expect(anchoredAfter.y).toBeCloseTo(anchoredBefore.y, 8)

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    const transformBeforePreviewWheel = content.style.transform
    const previewWheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
      clientX: 120,
      clientY: 100,
    })
    fireEvent(canvas, previewWheel)
    expect(previewWheel.defaultPrevented).toBe(false)
    expect(content.style.transform).toBe(transformBeforePreviewWheel)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Edit' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('nudges a free selection as one undoable command', () => {
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    const continueHit = container.querySelector(
      '[data-haku-ui-hit-target="13000000-0000-4000-8000-000000000103"]',
    ) as HTMLElement
    fireEvent.pointerDown(continueHit, { button: 0, pointerId: 2, clientX: 300, clientY: 300 })
    fireEvent.pointerUp(continueHit, { button: 0, pointerId: 2, clientX: 300, clientY: 300 })

    const before = container
      .querySelector('[data-haku-ui-id="13000000-0000-4000-8000-000000000103"]')
      ?.getAttribute('style')
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true })
    const after = container
      .querySelector('[data-haku-ui-id="13000000-0000-4000-8000-000000000103"]')
      ?.getAttribute('style')
    expect(after).not.toBe(before)
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(
      container
        .querySelector('[data-haku-ui-id="13000000-0000-4000-8000-000000000103"]')
        ?.getAttribute('style'),
    ).toBe(before)
  })

  it('searches the complete non-instance element palette', () => {
    render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))

    const palette = screen.getByRole('region', { name: 'Element palette' })
    expect(palette.querySelectorAll('[data-haku-ui-palette-kind]')).toHaveLength(17)
    fireEvent.change(screen.getByLabelText('Search UI elements'), { target: { value: 'text' } })
    expect(palette.querySelectorAll('[data-haku-ui-palette-kind]')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Add Text Area' })).toBeTruthy()
  })

  it('renames, hides, locks, duplicates, and deletes a layer with exact undo', () => {
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    const scoreId = '13000000-0000-4000-8000-000000000102'
    fireEvent.click(
      container.querySelector(`[data-haku-ui-tree-item="${scoreId}"]`) as HTMLButtonElement,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Rename Score' }))
    const rename = screen.getByRole('textbox', { name: 'Rename Score' })
    fireEvent.change(rename, { target: { value: 'Scoreboard' } })
    fireEvent.keyDown(rename, { key: 'Enter' })
    expect(screen.getByText('Scoreboard')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    fireEvent.click(screen.getByRole('button', { name: 'Hide Score' }))
    expect(container.querySelector(`[data-haku-ui-id="${scoreId}"]`)?.hasAttribute('hidden')).toBe(
      true,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    fireEvent.click(screen.getByRole('button', { name: 'Lock Score' }))
    expect(
      container
        .querySelector(`[data-haku-ui-tree-row="${scoreId}"]`)
        ?.getAttribute('data-haku-ui-locked'),
    ).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Unlock Score' }))

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Score' }))
    expect(container.querySelectorAll('[data-haku-ui-tree-item]')).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(container.querySelectorAll('[data-haku-ui-tree-item]')).toHaveLength(4)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Score' }))
    expect(container.querySelectorAll('[data-haku-ui-tree-item]')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(container.querySelectorAll('[data-haku-ui-tree-item]')).toHaveLength(4)
  })

  it('provides keyboard reorder and pointer DnD validation feedback', () => {
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    const continueItem = container.querySelector(
      '[data-haku-ui-tree-item="13000000-0000-4000-8000-000000000103"]',
    ) as HTMLButtonElement
    fireEvent.click(continueItem)
    continueItem.focus()
    fireEvent.keyDown(continueItem, { key: 'ArrowUp', altKey: true })

    const ordered = [...container.querySelectorAll('[data-haku-ui-tree-item]')].map((node) =>
      node.getAttribute('data-haku-ui-tree-item'),
    )
    expect(ordered.slice(1)).toEqual([
      '13000000-0000-4000-8000-000000000103',
      '13000000-0000-4000-8000-000000000102',
      '13000000-0000-4000-8000-000000000104',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    const root = container.querySelector(
      '[data-haku-ui-tree-item="13000000-0000-4000-8000-000000000101"]',
    ) as HTMLButtonElement
    const scoreRow = container.querySelector(
      '[data-haku-ui-tree-row="13000000-0000-4000-8000-000000000102"]',
    ) as HTMLElement
    const transfer = { setData: vi.fn(), getData: vi.fn(() => root.dataset.hakuUiTreeItem ?? '') }
    fireEvent.dragStart(root, { dataTransfer: transfer })
    fireEvent.dragOver(scoreRow, { dataTransfer: transfer, clientY: 1 })
    expect(screen.getByRole('status').textContent).toMatch(/root|container/i)
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('reparents a layer into an empty Frame through its center drop zone', () => {
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Frame' }))

    const score = container.querySelector(
      '[data-haku-ui-tree-item="13000000-0000-4000-8000-000000000102"]',
    ) as HTMLButtonElement
    const frameRow = screen
      .getByRole('treeitem', { name: 'Frame' })
      .closest('[data-haku-ui-tree-row]') as HTMLElement
    vi.spyOn(frameRow, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 30,
      left: 0,
      right: 200,
      x: 0,
      y: 0,
      width: 200,
      height: 30,
      toJSON: () => ({}),
    })
    const transfer = { setData: vi.fn(), getData: vi.fn() }

    fireEvent.dragStart(score, { dataTransfer: transfer })
    fireEvent.dragOver(frameRow, { dataTransfer: transfer, clientY: 15 })
    fireEvent.drop(frameRow, { dataTransfer: transfer, clientY: 15 })

    expect(screen.getByRole('button', { name: 'Expand Frame' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Moved 1 layer')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  })

  it('creates an Image through a project texture chooser without a UUID prompt', () => {
    const textureId = '10000000-0000-4000-8000-000000000099'
    const textures = vi.spyOn(projectService, 'listTextureAssets').mockReturnValue([
      {
        name: 'logo.png',
        path: 'textures/logo.png',
        reference: {
          $ref: textureId as never,
          type: '20000000-0000-4000-8000-000000000003' as never,
        },
      },
    ])
    const prompt = vi.spyOn(window, 'prompt')
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))

    fireEvent.click(screen.getByRole('button', { name: 'Add Image' }))
    expect(screen.getByRole('dialog', { name: 'Choose texture' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use logo.png' }))

    expect(container.querySelectorAll('[data-haku-ui-tree-item]')).toHaveLength(5)
    expect(prompt).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    textures.mockRestore()
    prompt.mockRestore()
  })
})
