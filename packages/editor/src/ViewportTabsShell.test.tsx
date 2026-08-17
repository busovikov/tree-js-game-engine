/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

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

afterEach(cleanup)
beforeEach(() => useEditorStore.setState({ activeWorkspace: 'viewport' }))

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

  // M5 removes `fails` when the Inspector preserves non-pixel sizing values.
  it.fails.each([
    ['13000000-0000-4000-8000-000000000101', '100%'],
    ['13000000-0000-4000-8000-000000000104', 'auto'],
  ])('round-trips the %s element width as %s in the Inspector', (elementId, expected) => {
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    const treeItem = container.querySelector(
      `[data-haku-ui-tree-item="${elementId}"]`,
    ) as HTMLButtonElement
    fireEvent.click(treeItem)

    expect((screen.getByLabelText('Width (px)') as HTMLInputElement).value).toBe(expected)
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
