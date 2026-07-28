/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
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

import { ViewportTabsShell } from './ViewportTabsShell.js'

afterEach(cleanup)

describe('ViewportTabsShell Code workspace', () => {
  it('opens the project code workflow from a user-visible Code tab', () => {
    render(<ViewportTabsShell />)

    fireEvent.click(screen.getByRole('tab', { name: 'Code' }))

    expect(screen.getByText('Project code panel')).toBeTruthy()
    expect(
      screen.getByRole('tab', { name: 'Code' }).getAttribute('aria-selected'),
    ).toBe('true')
  })
})
