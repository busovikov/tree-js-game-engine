/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

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
})
