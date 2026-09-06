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
const NONE_EVENT = '13000000-0000-4000-8000-000000000130'
const SECOND_NONE_EVENT = '13000000-0000-4000-8000-000000000131'
const STRING_EVENT = '13000000-0000-4000-8000-000000000132'
const NUMBER_EVENT = '13000000-0000-4000-8000-000000000133'
const BOOLEAN_EVENT = '13000000-0000-4000-8000-000000000134'
const UNKNOWN_EVENT = '13000000-0000-4000-8000-000000000199'
const COMPONENT_PANEL_DOCUMENT = '26000000-0000-4000-8000-000000000001'
const COMPONENT_PANEL_ROOT = '26000000-0000-4000-8000-000000000002'
const COMPONENT_PANEL_INSTANCE = '26000000-0000-4000-8000-000000000003'
const COMPONENT_PANEL_MASTER = '26000000-0000-4000-8000-000000000004'
const COMPONENT_PANEL_MASTER_ROOT = '26000000-0000-4000-8000-000000000005'
const COMPONENT_PANEL_INPUT = '26000000-0000-4000-8000-000000000006'
const COMPONENT_INSPECTOR_SECOND_INSTANCE = '26000000-0000-4000-8000-000000000007'
const COMPONENT_INSPECTOR_FRAME = '26000000-0000-4000-8000-000000000008'
const COMPONENT_INSPECTOR_CHILD = '26000000-0000-4000-8000-000000000009'
const COMPONENT_INSPECTOR_TEXT = '26000000-0000-4000-8000-00000000000a'
const COMPONENT_INSPECTOR_IMAGE = '26000000-0000-4000-8000-00000000000b'
const COMPONENT_INSPECTOR_BUTTON = '26000000-0000-4000-8000-00000000000c'

function componentPanelAsset() {
  return UIDocumentSchema.parse({
    schemaVersion: 2,
    id: COMPONENT_PANEL_DOCUMENT,
    name: 'Component panel fixture',
    root: COMPONENT_PANEL_ROOT,
    elements: [
      {
        id: COMPONENT_PANEL_ROOT,
        type: 'frame',
        name: 'Document root',
        children: [COMPONENT_PANEL_INSTANCE],
        layout: { mode: 'vertical' },
        sizing: {
          width: { mode: 'fixed', value: 1280, unit: 'px' },
          height: { mode: 'fixed', value: 720, unit: 'px' },
        },
      },
      {
        id: COMPONENT_PANEL_INSTANCE,
        type: 'instance',
        name: 'Profile card instance',
        component: COMPONENT_PANEL_MASTER,
        overrides: {
          [COMPONENT_PANEL_INPUT]: { value: 'Instance profile name' },
        },
      },
    ],
    components: [
      {
        id: COMPONENT_PANEL_MASTER,
        name: 'Profile card',
        root: COMPONENT_PANEL_MASTER_ROOT,
        elements: [
          {
            id: COMPONENT_PANEL_MASTER_ROOT,
            type: 'frame',
            name: 'Profile card root',
            children: [COMPONENT_PANEL_INPUT],
            layout: { mode: 'vertical' },
          },
          {
            id: COMPONENT_PANEL_INPUT,
            type: 'text-input',
            name: 'Profile name',
            value: 'Master name',
            maxLength: 24,
            accessibility: { label: 'Profile name' },
          },
        ],
      },
    ],
  })
}

function nonFrameComponentPanelAsset(type: 'button' | 'text') {
  const asset = componentPanelAsset()
  const root =
    type === 'button'
      ? {
          id: COMPONENT_PANEL_MASTER_ROOT,
          type,
          name: 'Action root',
          text: 'Action',
          accessibility: { label: 'Action' },
        }
      : {
          id: COMPONENT_PANEL_MASTER_ROOT,
          type,
          name: 'Label root',
          text: 'Label',
        }
  return UIDocumentSchema.parse({
    ...asset,
    elements: [asset.elements[0], { ...asset.elements[1], overrides: {} }],
    components: [{ ...asset.components[0], root: root.id, elements: [root] }],
  })
}

function componentInspectorAsset() {
  const asset = componentPanelAsset()
  return UIDocumentSchema.parse({
    ...asset,
    events: [
      { id: NONE_EVENT, name: 'Activate', payload: 'none' },
      { id: SECOND_NONE_EVENT, name: 'Cancel', payload: 'none' },
      { id: STRING_EVENT, name: 'Text value', payload: 'string' },
    ],
    elements: [
      {
        ...asset.elements[0],
        children: [COMPONENT_PANEL_INSTANCE, COMPONENT_INSPECTOR_SECOND_INSTANCE],
      },
      {
        ...asset.elements[1],
        overrides: {
          [COMPONENT_INSPECTOR_BUTTON]: { events: { activate: NONE_EVENT } },
        },
      },
      {
        id: COMPONENT_INSPECTOR_SECOND_INSTANCE,
        type: 'instance',
        name: 'Second profile card instance',
        component: COMPONENT_PANEL_MASTER,
      },
    ],
    components: [
      {
        ...asset.components[0],
        elements: [
          {
            ...asset.components[0]!.elements[0],
            children: [
              COMPONENT_INSPECTOR_FRAME,
              COMPONENT_INSPECTOR_TEXT,
              COMPONENT_INSPECTOR_IMAGE,
              COMPONENT_INSPECTOR_BUTTON,
            ],
            layout: { mode: 'horizontal' },
          },
          {
            id: COMPONENT_INSPECTOR_FRAME,
            type: 'frame',
            name: 'Nested frame',
            children: [COMPONENT_INSPECTOR_CHILD],
            layout: { mode: 'free' },
            placement: { positioning: 'flow' },
          },
          {
            id: COMPONENT_INSPECTOR_CHILD,
            type: 'rectangle',
            name: 'Nested child',
            placement: {
              positioning: 'free',
              x: 12,
              y: 16,
              horizontalConstraint: 'left',
              verticalConstraint: 'top',
              referenceWidth: 240,
              referenceHeight: 160,
            },
          },
          {
            id: COMPONENT_INSPECTOR_TEXT,
            type: 'text',
            name: 'Profile heading',
            text: 'Profile',
            placement: { positioning: 'flow' },
          },
          {
            id: COMPONENT_INSPECTOR_IMAGE,
            type: 'image',
            name: 'Profile image',
            source: {
              $ref: '13000000-0000-4000-8000-000000000120',
              type: '13000000-0000-4000-8000-000000000121',
            },
            alt: 'Profile portrait',
            placement: { positioning: 'flow' },
          },
          {
            id: COMPONENT_INSPECTOR_BUTTON,
            type: 'button',
            name: 'Save profile',
            text: 'Save',
            placement: { positioning: 'flow' },
          },
        ],
      },
    ],
  })
}

function inspectorAsset(
  type:
    | 'button'
    | 'frame'
    | 'image'
    | 'text-input'
    | 'text-area'
    | 'checkbox'
    | 'radio'
    | 'switch'
    | 'select'
    | 'slider'
    | 'progress'
    | 'divider'
    | 'list',
) {
  const current = INITIAL_UI_ASSET.elements[1]!
  const fields =
    type === 'frame'
      ? { children: [], layout: { mode: 'free' as const } }
      : type === 'button'
        ? { text: 'Submit' }
        : type === 'image'
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
                placeholder: 'Choose',
                options: [
                  { value: 'one', label: 'One' },
                  { value: 'two', label: 'Two' },
                ],
                accessibility: { label: 'Choice' },
              }
            : type === 'slider'
              ? { min: 0, max: 10, step: 1, value: 5, accessibility: { label: 'Volume' } }
              : type === 'progress'
                ? { min: 0, max: 10, value: 5, accessibility: { label: 'Loading' } }
                : type === 'text-input'
                  ? {
                      value: 'Ada',
                      placeholder: 'Name',
                      maxLength: 12,
                      inputMode: 'text',
                      accessibility: { label: 'Name' },
                    }
                  : type === 'text-area'
                    ? {
                        value: 'Notes',
                        rows: 4,
                        resize: 'vertical',
                        accessibility: { label: 'Notes' },
                      }
                    : type === 'checkbox'
                      ? { value: false, label: 'Accept' }
                      : type === 'radio'
                        ? { group: 'mode', optionValue: 'easy', value: 'easy', label: 'Easy' }
                        : type === 'switch'
                          ? { value: true, label: 'Music' }
                          : type === 'divider'
                            ? { orientation: 'horizontal', thickness: 1 }
                            : type === 'list'
                              ? { children: [], ordered: false, layout: { mode: 'vertical' } }
                              : {}
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

function inspectorEventAsset(
  type: Parameters<typeof inspectorAsset>[0],
  options: { bind?: string; declarations?: 'all' | 'string-only' } = {},
) {
  const asset = inspectorAsset(type)
  const declarations =
    options.declarations === 'string-only'
      ? [{ id: STRING_EVENT, name: 'Text value', payload: 'string' as const }]
      : [
          { id: NONE_EVENT, name: 'No value', payload: 'none' as const },
          { id: SECOND_NONE_EVENT, name: 'Also no value', payload: 'none' as const },
          { id: STRING_EVENT, name: 'Text value', payload: 'string' as const },
          { id: NUMBER_EVENT, name: 'Numeric value', payload: 'number' as const },
          { id: BOOLEAN_EVENT, name: 'Boolean value', payload: 'boolean' as const },
        ]
  return UIDocumentSchema.parse({
    ...asset,
    events: declarations,
    elements: asset.elements.map((element) =>
      element.id === INSPECTED_ID && options.bind
        ? { ...element, events: { ...element.events, activate: options.bind } }
        : element,
    ),
  })
}

function canvasOverlayAsset() {
  return UIDocumentSchema.parse({
    ...INITIAL_UI_ASSET,
    elements: INITIAL_UI_ASSET.elements.map((element, index) =>
      index === 0
        ? {
            ...element,
            layout: {
              mode: 'horizontal' as const,
              padding: { top: 10, right: 20, bottom: 30, left: 40 },
              rowGap: 12,
              columnGap: 16,
              wrap: false,
            },
            overflowX: 'hidden' as const,
            overflowY: 'scroll' as const,
          }
        : { ...element, placement: { positioning: 'flow' as const } },
    ),
  })
}

function measuredRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

afterEach(cleanup)
beforeEach(() => {
  useEditorStore.setState({ activeWorkspace: 'viewport' })
  uiAuthoringSession.openAsset('builtin:m10b-runtime-hud.ui.json', INITIAL_UI_ASSET)
  uiAuthoringSession.setPreviewMode('edit')
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
  it('shows an explicit empty Components collection with creation disabled for the document root', () => {
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))

    const collection = screen.getByRole('region', { name: 'Components' })
    expect(within(collection).getByText('No components yet.')).toBeTruthy()
    expect(within(collection).getByText(/Select a layer to create a reusable master/)).toBeTruthy()
    expect(
      (within(collection).getByRole('button', {
        name: 'Create component',
      }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(container.querySelector('[data-haku-ui-component-id]')).toBeNull()
  })

  it('selects and opens masters, places instances contextually, and exposes strict lifecycle controls', () => {
    uiAuthoringSession.openAsset('assets/ui/component-panel.ui.json', componentPanelAsset())
    const prompt = vi.spyOn(window, 'prompt')
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    const collection = screen.getByRole('region', { name: 'Components' })

    fireEvent.click(within(collection).getByRole('button', { name: 'Select Profile card' }))
    expect(
      container
        .querySelector(`[data-haku-ui-component-id="${COMPONENT_PANEL_MASTER}"]`)
        ?.getAttribute('aria-selected'),
    ).toBe('true')
    fireEvent.click(within(collection).getByRole('button', { name: 'Place Profile card instance' }))
    expect(
      uiAuthoringSession.asset?.elements.filter(
        (element) => element.type === 'instance' && element.component === COMPONENT_PANEL_MASTER,
      ),
    ).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(
      uiAuthoringSession.asset?.elements.filter(
        (element) => element.type === 'instance' && element.component === COMPONENT_PANEL_MASTER,
      ),
    ).toHaveLength(1)

    fireEvent.click(within(collection).getByRole('button', { name: 'Open Profile card master' }))
    expect(uiAuthoringSession.editScope).toEqual({
      type: 'component',
      componentId: COMPONENT_PANEL_MASTER,
    })
    fireEvent.click(within(collection).getByRole('button', { name: 'Duplicate Profile card' }))
    expect(uiAuthoringSession.asset?.components.map((component) => component.name)).toEqual([
      'Profile card',
      'Profile card 2',
    ])
    expect(uiAuthoringSession.editScope).toEqual({
      type: 'component',
      componentId: COMPONENT_PANEL_MASTER,
    })

    fireEvent.click(within(collection).getByRole('button', { name: 'Rename Profile card 2' }))
    const renameDialog = screen.getByRole('dialog', { name: 'Rename component' })
    fireEvent.change(within(renameDialog).getByRole('textbox', { name: 'Component name' }), {
      target: { value: 'Reusable card' },
    })
    fireEvent.submit(within(renameDialog).getByRole('form', { name: 'Rename component' }))
    expect(uiAuthoringSession.asset?.components[1]?.name).toBe('Reusable card')
    fireEvent.click(within(collection).getByRole('button', { name: 'Delete Reusable card' }))
    expect(uiAuthoringSession.asset?.components).toHaveLength(1)

    fireEvent.click(within(collection).getByRole('button', { name: 'Delete Profile card' }))
    expect(screen.getByRole('status').textContent).toMatch(/document instance .* references it/)
    expect(uiAuthoringSession.asset?.components).toHaveLength(1)
    expect(prompt).not.toHaveBeenCalled()
    prompt.mockRestore()
  })

  it('renames components through an accessible validated dialog without native prompts', () => {
    uiAuthoringSession.openAsset('assets/ui/component-panel.ui.json', componentPanelAsset())
    const prompt = vi.spyOn(window, 'prompt')
    render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    const collection = screen.getByRole('region', { name: 'Components' })

    fireEvent.click(within(collection).getByRole('button', { name: 'Duplicate Profile card' }))
    uiCommandBus.clear()
    fireEvent.click(within(collection).getByRole('button', { name: 'Rename Profile card 2' }))
    const dialog = screen.getByRole('dialog', { name: 'Rename component' })
    const name = within(dialog).getByRole('textbox', { name: 'Component name' })
    expect((name as HTMLInputElement).value).toBe('Profile card 2')
    expect(prompt).not.toHaveBeenCalled()

    fireEvent.change(name, { target: { value: '   ' } })
    fireEvent.submit(within(dialog).getByRole('form', { name: 'Rename component' }))
    expect(within(dialog).getByRole('alert').textContent).toMatch(/cannot be empty/i)
    expect(uiAuthoringSession.asset?.components[1]?.name).toBe('Profile card 2')
    expect(uiCommandBus.canUndo()).toBe(false)

    fireEvent.change(name, { target: { value: 'Profile card' } })
    fireEvent.submit(within(dialog).getByRole('form', { name: 'Rename component' }))
    expect(within(dialog).getByRole('alert').textContent).toMatch(/must be unique/i)
    expect(uiAuthoringSession.asset?.components[1]?.name).toBe('Profile card 2')
    expect(uiCommandBus.canUndo()).toBe(false)

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Rename component' })).toBeNull()
    expect(uiCommandBus.canUndo()).toBe(false)

    fireEvent.click(within(collection).getByRole('button', { name: 'Rename Profile card 2' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Rename component' })).getByRole('button', {
        name: 'Cancel',
      }),
    )
    expect(screen.queryByRole('dialog', { name: 'Rename component' })).toBeNull()
    expect(uiCommandBus.canUndo()).toBe(false)

    fireEvent.click(within(collection).getByRole('button', { name: 'Rename Profile card 2' }))
    const submitDialog = screen.getByRole('dialog', { name: 'Rename component' })
    fireEvent.change(within(submitDialog).getByRole('textbox', { name: 'Component name' }), {
      target: { value: 'Nested card' },
    })
    fireEvent.submit(within(submitDialog).getByRole('form', { name: 'Rename component' }))
    expect(screen.queryByRole('dialog', { name: 'Rename component' })).toBeNull()
    expect(uiAuthoringSession.asset?.components[1]?.name).toBe('Nested card')
    expect(uiCommandBus.canUndo()).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset?.components[1]?.name).toBe('Profile card 2')
    expect(uiCommandBus.canUndo()).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(uiAuthoringSession.asset?.components[1]?.name).toBe('Nested card')
    expect(prompt).not.toHaveBeenCalled()
    prompt.mockRestore()
  })

  it('creates a component from the selected document subtree through the collection', () => {
    const prompt = vi.spyOn(window, 'prompt')
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(
        '[data-haku-ui-tree-item="13000000-0000-4000-8000-000000000102"]',
      ) as HTMLButtonElement,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create component' }))
    const dialog = screen.getByRole('dialog', { name: 'Create component' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Component name' }), {
      target: { value: 'Score component' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create component' }))

    expect(uiAuthoringSession.asset?.components[0]?.name).toBe('Score component')
    expect(
      uiAuthoringSession.asset?.elements.find((element) => element.name === 'Score component'),
    ).toMatchObject({ type: 'instance' })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset?.components).toHaveLength(0)
    expect(prompt).not.toHaveBeenCalled()
    prompt.mockRestore()
  })

  it('creates components through an accessible validated dialog without native prompts', () => {
    const prompt = vi.spyOn(window, 'prompt')
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(
        '[data-haku-ui-tree-item="13000000-0000-4000-8000-000000000102"]',
      ) as HTMLButtonElement,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create component' }))
    const dialog = screen.getByRole('dialog', { name: 'Create component' })
    const name = within(dialog).getByRole('textbox', { name: 'Component name' })
    expect((name as HTMLInputElement).value).toBe('Score')
    expect(prompt).not.toHaveBeenCalled()

    fireEvent.change(name, { target: { value: '   ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create component' }))
    expect(within(dialog).getByRole('alert').textContent).toMatch(/cannot be empty/i)
    expect(uiAuthoringSession.asset?.components).toHaveLength(0)
    expect(uiCommandBus.canUndo()).toBe(false)

    fireEvent.change(name, { target: { value: 'Score component' } })
    fireEvent.submit(within(dialog).getByRole('form', { name: 'Create component' }))
    expect(screen.queryByRole('dialog', { name: 'Create component' })).toBeNull()
    expect(uiAuthoringSession.asset?.components[0]?.name).toBe('Score component')
    expect(uiCommandBus.canUndo()).toBe(true)

    fireEvent.click(
      container.querySelector(
        '[data-haku-ui-tree-item="13000000-0000-4000-8000-000000000103"]',
      ) as HTMLButtonElement,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create component' }))
    const duplicateDialog = screen.getByRole('dialog', { name: 'Create component' })
    fireEvent.change(within(duplicateDialog).getByRole('textbox', { name: 'Component name' }), {
      target: { value: 'Score component' },
    })
    fireEvent.click(within(duplicateDialog).getByRole('button', { name: 'Create component' }))
    expect(within(duplicateDialog).getByRole('alert').textContent).toMatch(/must be unique/i)
    expect(uiAuthoringSession.asset?.components).toHaveLength(1)

    fireEvent.click(within(duplicateDialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Create component' })).toBeNull()
    expect(uiAuthoringSession.asset?.components).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset?.components).toHaveLength(0)
    expect(uiCommandBus.canUndo()).toBe(false)
    prompt.mockRestore()
  })

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

  it('enters an instance master with scoped Layers and Inspector, then exits without saving edit scope', async () => {
    const asset = componentPanelAsset()
    uiAuthoringSession.openAsset('assets/ui/component-panel.ui.json', asset)
    const save = vi.spyOn(projectService, 'saveUIDocumentAsset').mockResolvedValue(undefined)
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))

    expect(screen.getByText('Instance')).toBeTruthy()
    expect(screen.getByRole('note').textContent).toMatch(/structure is defined by Profile card/i)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Profile card master' }))

    const workspace = container.querySelector('[data-haku-ui-workspace]')
    expect(workspace?.getAttribute('data-haku-ui-edit-scope')).toBe(COMPONENT_PANEL_MASTER)
    expect(screen.getByRole('navigation', { name: 'UI edit scope' }).textContent).toMatch(
      /Component panel fixture.*Profile card/,
    )
    expect(
      container.querySelector(`[data-haku-ui-tree-item="${COMPONENT_PANEL_MASTER_ROOT}"]`),
    ).toBeTruthy()
    expect(
      container.querySelector(`[data-haku-ui-tree-item="${COMPONENT_PANEL_INPUT}"]`),
    ).toBeTruthy()
    expect(
      container.querySelector(`[data-haku-ui-tree-item="${COMPONENT_PANEL_ROOT}"]`),
    ).toBeNull()

    fireEvent.click(
      container.querySelector(
        `[data-haku-ui-tree-item="${COMPONENT_PANEL_INPUT}"]`,
      ) as HTMLButtonElement,
    )
    const locator = screen.getByTestId('ui-instance-inspection-locator')
    expect(locator.getAttribute('data-haku-ui-instance-path')).toBe(COMPONENT_PANEL_INSTANCE)
    expect(locator.getAttribute('data-haku-ui-source-id')).toBe(COMPONENT_PANEL_INPUT)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Player name' } })
    expect(
      uiAuthoringSession.asset?.components[0]?.elements.find(
        (element) => element.id === COMPONENT_PANEL_INPUT,
      ),
    ).toMatchObject({ name: 'Player name' })
    expect(uiAuthoringSession.asset?.elements[1]).toMatchObject({
      id: COMPONENT_PANEL_INSTANCE,
      type: 'instance',
    })

    const beforeInvalid = structuredClone(uiAuthoringSession.asset)
    const maximum = within(screen.getByRole('region', { name: 'Widget' })).getByLabelText(
      'Max length',
    )
    fireEvent.change(maximum, { target: { value: '4' } })
    fireEvent.blur(maximum)
    expect(screen.getByRole('alert').textContent).toMatch(/Value override is invalid for text-input/)
    expect(uiAuthoringSession.asset).toEqual(beforeInvalid)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const saved = save.mock.calls[0]?.[1]
    expect(saved).not.toHaveProperty('editScope')
    expect(saved).not.toHaveProperty('selection')

    fireEvent.click(screen.getByRole('button', { name: 'Back to document' }))
    expect(uiAuthoringSession.editScope).toEqual({ type: 'document' })
    expect(uiAuthoringSession.selectedElementIds).toEqual([COMPONENT_PANEL_INSTANCE])
    expect(workspace?.getAttribute('data-haku-ui-edit-scope')).toBe('document')
    expect(screen.getByRole('note').textContent).toMatch(/enter the master to edit descendants/i)
    save.mockRestore()
  })

  it.each(['button', 'text'] as const)(
    'opens a %s-root component master without treating its edit tree as a serialized document',
    async (type) => {
      uiAuthoringSession.openAsset(
        `assets/ui/${type}-root-component.ui.json`,
        nonFrameComponentPanelAsset(type),
      )
      const save = vi.spyOn(projectService, 'saveUIDocumentAsset').mockResolvedValue(undefined)
      const { container } = render(<ViewportTabsShell />)
      fireEvent.click(screen.getByRole('tab', { name: 'UI' }))

      fireEvent.click(screen.getByRole('button', { name: 'Edit Profile card master' }))

      const workspace = container.querySelector('[data-haku-ui-workspace]')
      expect(workspace?.getAttribute('data-haku-ui-edit-scope')).toBe(COMPONENT_PANEL_MASTER)
      expect(
        container.querySelector(`[data-haku-ui-tree-item="${COMPONENT_PANEL_MASTER_ROOT}"]`),
      ).toBeTruthy()
      expect(screen.getByRole('heading', { name: 'UI Inspector' })).toBeTruthy()
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toMatch(/root/i)
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: `${type} master root` } })

      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
      const saved = save.mock.calls[0]?.[1]
      expect(saved).not.toHaveProperty('editScope')
      expect(saved).not.toHaveProperty('selection')
      expect(saved?.components[0]?.root).toBe(COMPONENT_PANEL_MASTER_ROOT)
      expect(saved?.components[0]?.elements).toHaveLength(1)

      fireEvent.click(screen.getByRole('button', { name: 'Back to document' }))
      expect(uiAuthoringSession.editScope).toEqual({ type: 'document' })
      save.mockRestore()
    },
  )

  it('uses the selected owning instance bounds for master layout, placement, and constraints', async () => {
    uiAuthoringSession.openAsset(
      'assets/ui/component-inspector.ui.json',
      componentInspectorAsset(),
    )
    const originalRect = HTMLElement.prototype.getBoundingClientRect
    const sourceRects = new Map([
      [COMPONENT_PANEL_MASTER_ROOT, measuredRect(100, 50, 640, 240)],
      [COMPONENT_INSPECTOR_FRAME, measuredRect(120, 70, 240, 160)],
      [COMPONENT_INSPECTOR_CHILD, measuredRect(140, 90, 60, 40)],
      [COMPONENT_INSPECTOR_TEXT, measuredRect(380, 80, 120, 40)],
      [COMPONENT_INSPECTOR_IMAGE, measuredRect(520, 80, 80, 80)],
      [COMPONENT_INSPECTOR_BUTTON, measuredRect(620, 80, 100, 40)],
    ])
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        if (this.dataset.hakuUiPreview) return measuredRect(0, 0, 1280, 720)
        if (
          this.dataset.hakuUiInstancePath === COMPONENT_INSPECTOR_SECOND_INSTANCE &&
          this.dataset.hakuUiSourceId
        ) {
          return sourceRects.get(this.dataset.hakuUiSourceId) ?? originalRect.call(this)
        }
        return originalRect.call(this)
      })

    try {
      const { container } = render(<ViewportTabsShell />)
      fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
      fireEvent.click(
        container.querySelector(
          `[data-haku-ui-tree-item="${COMPONENT_INSPECTOR_SECOND_INSTANCE}"]`,
        ) as HTMLButtonElement,
      )
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Edit Profile card master' }).at(-1)!,
      )

      expect(screen.getByTestId('ui-instance-inspection-locator').dataset.hakuUiInstancePath).toBe(
        COMPONENT_INSPECTOR_SECOND_INSTANCE,
      )
      expect(
        Array.from(
          container.querySelectorAll(
            `[data-haku-ui-source-id="${COMPONENT_PANEL_MASTER_ROOT}"]`,
          ),
        ).map((node) => (node as HTMLElement).dataset.hakuUiInstancePath),
      ).toContain(COMPONENT_INSPECTOR_SECOND_INSTANCE)
      await waitFor(() =>
        expect((screen.getByLabelText('Layout mode') as HTMLSelectElement).value).toBe(
          'horizontal',
        ),
      )
      uiCommandBus.clear()
      const before = structuredClone(uiAuthoringSession.asset)
      fireEvent.change(screen.getByLabelText('Layout mode'), { target: { value: 'free' } })
      expect(uiAuthoringSession.asset?.components[0]?.elements[0]).toMatchObject({
        layout: { mode: 'free' },
      })
      expect(
        uiAuthoringSession.asset?.components[0]?.elements.find(
          (element) => element.id === COMPONENT_INSPECTOR_TEXT,
        )?.placement,
      ).toMatchObject({
        positioning: 'free',
        x: expect.any(Number),
        y: expect.any(Number),
        referenceWidth: expect.any(Number),
        referenceHeight: expect.any(Number),
      })
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      expect(uiAuthoringSession.asset).toEqual(before)

      fireEvent.click(
        container.querySelector(
          `[data-haku-ui-tree-item="${COMPONENT_INSPECTOR_TEXT}"]`,
        ) as HTMLButtonElement,
      )
      fireEvent.click(
        within(screen.getByRole('region', { name: 'Placement' })).getByRole('button', {
          name: 'Absolute',
        }),
      )
      expect(
        uiAuthoringSession.asset?.components[0]?.elements.find(
          (element) => element.id === COMPONENT_INSPECTOR_TEXT,
        )?.placement,
      ).toEqual({
        positioning: 'absolute',
        left: expect.any(Number),
        top: expect.any(Number),
      })
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

      fireEvent.click(
        container.querySelector(
          `[data-haku-ui-tree-item="${COMPONENT_INSPECTOR_CHILD}"]`,
        ) as HTMLButtonElement,
      )
      fireEvent.click(
        within(screen.getByRole('region', { name: 'Placement' })).getByRole('button', {
          name: 'Right',
        }),
      )
      expect(
        uiAuthoringSession.asset?.components[0]?.elements.find(
          (element) => element.id === COMPONENT_INSPECTOR_CHILD,
        )?.placement,
      ).toMatchObject({
        positioning: 'free',
        x: expect.any(Number),
        y: expect.any(Number),
        horizontalConstraint: 'right',
        referenceWidth: expect.any(Number),
      })
      const nestedPlacement = uiAuthoringSession.asset?.components[0]?.elements.find(
        (element) => element.id === COMPONENT_INSPECTOR_CHILD,
      )?.placement
      expect(
        nestedPlacement?.positioning === 'free' ? nestedPlacement.referenceWidth : undefined,
      ).not.toBe(1280)
    } finally {
      rectSpy.mockRestore()
    }
  })

  it('routes the complete Style and Accessibility surfaces through the component edit tree', () => {
    uiAuthoringSession.openAsset(
      'assets/ui/component-inspector.ui.json',
      componentInspectorAsset(),
    )
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(
        `[data-haku-ui-tree-item="${COMPONENT_INSPECTOR_SECOND_INSTANCE}"]`,
      ) as HTMLButtonElement,
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit Profile card master' }).at(-1)!)
    fireEvent.click(
      container.querySelector(
        `[data-haku-ui-tree-item="${COMPONENT_INSPECTOR_TEXT}"]`,
      ) as HTMLButtonElement,
    )
    uiCommandBus.clear()

    let style = screen.getByRole('region', { name: 'Style' })
    fireEvent.change(within(style).getByLabelText('Font family'), { target: { value: 'Inter' } })
    fireEvent.blur(within(style).getByLabelText('Font family'))
    fireEvent.change(within(style).getByLabelText('Font size source'), {
      target: { value: 'custom' },
    })
    fireEvent.change(within(style).getByLabelText('Font size'), { target: { value: '18' } })
    fireEvent.blur(within(style).getByLabelText('Font size'))
    fireEvent.change(within(style).getByLabelText('Corner radius source'), {
      target: { value: 'per-corner' },
    })
    fireEvent.change(within(style).getByLabelText('Radius top left'), {
      target: { value: '9' },
    })
    fireEvent.blur(within(style).getByLabelText('Radius top left'))
    const accessibility = screen.getByRole('region', { name: 'Accessibility' })
    fireEvent.change(within(accessibility).getByLabelText('ARIA role'), {
      target: { value: 'status' },
    })
    fireEvent.change(within(accessibility).getByLabelText('Live region'), {
      target: { value: 'polite' },
    })
    fireEvent.change(within(accessibility).getByLabelText('Tab order'), {
      target: { value: '0' },
    })
    expect(
      uiAuthoringSession.asset?.components[0]?.elements.find(
        (element) => element.id === COMPONENT_INSPECTOR_TEXT,
      ),
    ).toMatchObject({
      style: {
        fontFamily: 'Inter',
        fontSize: 18,
        borderRadius: { topLeft: 9, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      },
      accessibility: { role: 'status', live: 'polite', tabIndex: 0 },
    })

    fireEvent.click(
      container.querySelector(
        `[data-haku-ui-tree-item="${COMPONENT_INSPECTOR_IMAGE}"]`,
      ) as HTMLButtonElement,
    )
    style = screen.getByRole('region', { name: 'Style' })
    expect(within(style).queryByLabelText('Font family')).toBeNull()
    fireEvent.change(within(style).getByLabelText('Image fit'), { target: { value: 'cover' } })
    const imageAccessibility = screen.getByRole('region', { name: 'Accessibility' })
    fireEvent.change(within(imageAccessibility).getByLabelText('Image purpose'), {
      target: { value: 'decorative' },
    })
    const alt = within(imageAccessibility).getByLabelText('Alternative text')
    fireEvent.change(alt, { target: { value: 'Player portrait' } })
    fireEvent.blur(alt)
    expect(
      uiAuthoringSession.asset?.components[0]?.elements.find(
        (element) => element.id === COMPONENT_INSPECTOR_IMAGE,
      ),
    ).toMatchObject({
      style: { objectFit: 'cover' },
      decorative: false,
      alt: 'Player portrait',
    })
    expect(() => UIDocumentSchema.parse(uiAuthoringSession.asset)).not.toThrow()
  })

  it('filters master Events by document declarations and rejects hidden invalid bindings without history', () => {
    uiAuthoringSession.openAsset(
      'assets/ui/component-inspector.ui.json',
      componentInspectorAsset(),
    )
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(
        `[data-haku-ui-tree-item="${COMPONENT_INSPECTOR_SECOND_INSTANCE}"]`,
      ) as HTMLButtonElement,
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit Profile card master' }).at(-1)!)
    fireEvent.click(
      container.querySelector(
        `[data-haku-ui-tree-item="${COMPONENT_INSPECTOR_BUTTON}"]`,
      ) as HTMLButtonElement,
    )
    const events = screen.getByRole('region', { name: 'Events' })
    const binding = within(events).getByLabelText('Activate event') as HTMLSelectElement
    expect(Array.from(binding.options).map((option) => option.value)).toEqual([
      '',
      NONE_EVENT,
      SECOND_NONE_EVENT,
    ])

    fireEvent.change(binding, { target: { value: SECOND_NONE_EVENT } })
    expect(
      uiAuthoringSession.asset?.components[0]?.elements.find(
        (element) => element.id === COMPONENT_INSPECTOR_BUTTON,
      )?.events,
    ).toEqual({
      activate: SECOND_NONE_EVENT,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    uiCommandBus.clear()
    const beforeInvalid = structuredClone(uiAuthoringSession.asset)
    const incompatible = document.createElement('option')
    incompatible.value = STRING_EVENT
    binding.append(incompatible)
    fireEvent.change(binding, { target: { value: STRING_EVENT } })
    expect(screen.getByRole('alert').textContent).toMatch(
      /Invalid UI component master edit[\s\S]*incompatible payload/i,
    )
    expect(uiAuthoringSession.asset).toEqual(beforeInvalid)
    expect(uiCommandBus.canUndo()).toBe(false)
  })

  it('inspects and resets sparse source overrides and detaches the selected document instance atomically', () => {
    uiAuthoringSession.openAsset('assets/ui/component-overrides.ui.json', componentPanelAsset())
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(
        `[data-haku-ui-tree-item="${COMPONENT_PANEL_INSTANCE}"]`,
      ) as HTMLButtonElement,
    )

    const overrides = screen.getByRole('region', { name: 'Instance overrides' })
    expect(within(overrides).getByText(/Structure is inherited from Profile card/)).toBeTruthy()
    expect(within(overrides).queryByLabelText('Override width')).toBeNull()
    fireEvent.click(within(overrides).getByRole('button', { name: 'Inspect Profile name' }))

    const locator = screen.getByTestId('ui-instance-inspection-locator')
    expect(locator.getAttribute('data-haku-ui-instance-path')).toBe(COMPONENT_PANEL_INSTANCE)
    expect(locator.getAttribute('data-haku-ui-source-id')).toBe(COMPONENT_PANEL_INPUT)
    expect(within(overrides).getByText('Value')).toBeTruthy()

    const fill = within(overrides).getByLabelText('Override fill')
    fireEvent.change(fill, {
      target: { value: '#ff0000' },
    })
    fireEvent.blur(fill)
    expect(uiAuthoringSession.asset?.elements[1]).toMatchObject({
      type: 'instance',
      overrides: {
        [COMPONENT_PANEL_INPUT]: {
          value: 'Instance profile name',
          style: { backgroundColor: '#ff0000' },
        },
      },
    })

    fireEvent.click(within(overrides).getByRole('button', { name: 'Reset Value' }))
    expect(uiAuthoringSession.asset?.elements[1]).toMatchObject({
      overrides: { [COMPONENT_PANEL_INPUT]: { style: { backgroundColor: '#ff0000' } } },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset?.elements[1]).toMatchObject({
      overrides: {
        [COMPONENT_PANEL_INPUT]: {
          value: 'Instance profile name',
          style: { backgroundColor: '#ff0000' },
        },
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))

    fireEvent.click(within(overrides).getByRole('button', { name: 'Reset all overrides' }))
    expect(uiAuthoringSession.asset?.elements[1]).toMatchObject({ overrides: {} })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset?.elements[1]).toMatchObject({
      overrides: { [COMPONENT_PANEL_INPUT]: { style: { backgroundColor: '#ff0000' } } },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))

    fireEvent.click(within(overrides).getByRole('button', { name: 'Detach instance' }))
    const detachedRoot = uiAuthoringSession.selectedElementId
    expect(detachedRoot).not.toBe(COMPONENT_PANEL_INSTANCE)
    expect(
      uiAuthoringSession.asset?.elements.find((element) => element.id === detachedRoot),
    ).toMatchObject({
      type: 'frame',
      children: [expect.not.stringMatching(COMPONENT_PANEL_INPUT)],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.selectedElementId).toBe(COMPONENT_PANEL_INSTANCE)
    expect(
      uiAuthoringSession.asset?.elements.find((element) => element.id === COMPONENT_PANEL_INSTANCE),
    ).toMatchObject({
      type: 'instance',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(uiAuthoringSession.selectedElementId).toBe(detachedRoot)
  })

  it('preserves a focused instance widget value when a type-valid master edit refreshes preview', async () => {
    uiAuthoringSession.openAsset('assets/ui/component-preview.ui.json', componentPanelAsset())
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    const selector = `[data-haku-ui-instance-path="${COMPONENT_PANEL_INSTANCE}"][data-haku-ui-source-id="${COMPONENT_PANEL_INPUT}"]`
    const input = container.querySelector(selector) as HTMLInputElement
    expect(input).toBeTruthy()
    fireEvent.input(input, { target: { value: 'Runtime draft' } })
    input.focus()

    fireEvent.click(screen.getByRole('button', { name: 'Edit Profile card master' }))
    fireEvent.click(
      container.querySelector(
        `[data-haku-ui-tree-item="${COMPONENT_PANEL_INPUT}"]`,
      ) as HTMLButtonElement,
    )
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed profile name' } })

    await waitFor(() => {
      const refreshed = container.querySelector(selector) as HTMLInputElement
      expect(refreshed.value).toBe('Runtime draft')
      expect(document.activeElement).toBe(refreshed)
    })
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

  it('renders measured Frame padding, gap, and distinct overflow overlays only in Edit', async () => {
    const asset = canvasOverlayAsset()
    uiAuthoringSession.openAsset('memory:canvas-overlays.ui.json', asset)
    uiCommandBus.clear()
    const before = structuredClone(uiAuthoringSession.asset)
    const originalRect = HTMLElement.prototype.getBoundingClientRect
    const rects = new Map([
      ['13000000-0000-4000-8000-000000000101', measuredRect(100, 50, 400, 240)],
      ['13000000-0000-4000-8000-000000000102', measuredRect(140, 80, 40, 30)],
      ['13000000-0000-4000-8000-000000000103', measuredRect(196, 80, 40, 30)],
      ['13000000-0000-4000-8000-000000000104', measuredRect(252, 80, 40, 30)],
    ])
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        if (this.dataset.hakuUiPreview) return measuredRect(100, 50, 400, 240)
        return rects.get(this.dataset.hakuUiId ?? '') ?? originalRect.call(this)
      })

    try {
      const { container } = render(<ViewportTabsShell />)
      fireEvent.click(screen.getByRole('tab', { name: 'UI' }))

      await waitFor(() =>
        expect(container.querySelectorAll('[data-haku-ui-padding-edge]')).toHaveLength(4),
      )
      const top = container.querySelector('[data-haku-ui-padding-edge="top"]') as HTMLElement
      expect(top.style.left).toBe('40px')
      expect(top.style.top).toBe('10px')
      expect(top.style.width).toBe('340px')
      expect(container.querySelectorAll('[data-haku-ui-gap-marker="column"]')).toHaveLength(2)
      expect(container.querySelector('[data-haku-ui-overflow-boundary="x-hidden"]')).toBeTruthy()
      expect(container.querySelector('[data-haku-ui-overflow-boundary="y-scroll"]')).toBeTruthy()
      expect(uiAuthoringSession.asset).toEqual(before)
      expect(uiCommandBus.canUndo()).toBe(false)

      fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
      expect(container.querySelector('[data-haku-ui-padding-edge]')).toBeNull()
      expect(container.querySelector('[data-haku-ui-gap-marker]')).toBeNull()
      expect(container.querySelector('[data-haku-ui-overflow-boundary]')).toBeNull()
      expect(container.querySelector('[data-haku-ui-constraint-anchor]')).toBeNull()
    } finally {
      rectSpy.mockRestore()
    }
  })

  it('shows the resolved canvas insertion index in document space without history', async () => {
    const asset = canvasOverlayAsset()
    uiAuthoringSession.openAsset('memory:canvas-insertion.ui.json', asset)
    uiCommandBus.clear()
    const before = structuredClone(uiAuthoringSession.asset)
    const originalRect = HTMLElement.prototype.getBoundingClientRect
    const rects = new Map([
      ['13000000-0000-4000-8000-000000000101', measuredRect(0, 0, 400, 240)],
      ['13000000-0000-4000-8000-000000000102', measuredRect(40, 30, 40, 30)],
      ['13000000-0000-4000-8000-000000000103', measuredRect(96, 30, 40, 30)],
      ['13000000-0000-4000-8000-000000000104', measuredRect(152, 30, 40, 30)],
    ])
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        if (this.classList.contains('haku-ui-editor__viewport-scroll'))
          return measuredRect(0, 0, 800, 600)
        if (this.dataset.hakuUiPreview) return measuredRect(0, 0, 400, 240)
        return rects.get(this.dataset.hakuUiId ?? '') ?? originalRect.call(this)
      })

    try {
      const { container } = render(<ViewportTabsShell />)
      fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
      await waitFor(() =>
        expect(container.querySelector('[data-haku-ui-padding-edge]')).toBeTruthy(),
      )
      const paletteButton = screen.getByRole('button', { name: 'Add Text' })
      const canvas = screen
        .getByRole('main', { name: 'UI Canvas' })
        .querySelector('.haku-ui-editor__viewport-scroll') as HTMLElement
      const transfer = { setData: vi.fn(), dropEffect: '', effectAllowed: '' }

      fireEvent.dragStart(paletteButton, { dataTransfer: transfer })
      fireEvent.dragOver(canvas, { clientX: 145, clientY: 45, dataTransfer: transfer })

      const insertion = await waitFor(() => {
        const node = container.querySelector('[data-haku-ui-insertion-marker]') as HTMLElement
        expect(node).toBeTruthy()
        return node
      })
      expect(insertion.dataset.hakuUiInsertionParent).toBe('13000000-0000-4000-8000-000000000101')
      expect(insertion.dataset.hakuUiInsertionIndex).toBe('3')
      expect(insertion.style.left).toBe('192px')
      expect(uiAuthoringSession.asset).toEqual(before)
      expect(uiCommandBus.canUndo()).toBe(false)

      fireEvent.dragEnd(paletteButton, { dataTransfer: transfer })
      expect(container.querySelector('[data-haku-ui-insertion-marker]')).toBeNull()
    } finally {
      rectSpy.mockRestore()
    }
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

  it.each([
    ['text-input', 'Ada'],
    ['text-area', 'Notes'],
  ] as const)(
    'edits %s value/options through local drafts and strict Undo',
    (type, initialValue) => {
      uiAuthoringSession.openAsset('builtin:m10b-runtime-hud.ui.json', inspectorAsset(type))
      const { container } = render(<ViewportTabsShell />)
      fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
      fireEvent.click(
        container.querySelector(`[data-haku-ui-tree-item="${INSPECTED_ID}"]`) as HTMLButtonElement,
      )
      uiCommandBus.clear()
      const widget = screen.getByRole('region', { name: 'Widget' })
      const value = within(widget).getByLabelText('Value')
      const before = structuredClone(uiAuthoringSession.asset)!

      fireEvent.change(value, { target: { value: 'Updated value' } })
      expect(uiAuthoringSession.asset).toEqual(before)
      fireEvent.keyDown(value, { key: 'Escape' })
      expect((value as HTMLInputElement).value).toBe(initialValue)
      fireEvent.change(value, { target: { value: 'Updated' } })
      fireEvent.blur(value)
      expect(uiAuthoringSession.asset!.elements[1]).toMatchObject({ value: 'Updated' })
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      expect(uiAuthoringSession.asset).toEqual(before)

      if (type === 'text-input') {
        const inputModes = Array.from(
          (within(widget).getByLabelText('Input mode') as HTMLSelectElement).options,
        ).map((option) => option.value)
        expect(inputModes).toEqual([
          'none',
          'text',
          'decimal',
          'numeric',
          'tel',
          'search',
          'email',
          'url',
        ])
        fireEvent.change(within(widget).getByLabelText('Input mode'), {
          target: { value: 'email' },
        })
        expect(uiAuthoringSession.asset!.elements[1]).toMatchObject({ inputMode: 'email' })
        fireEvent.click(within(widget).getByLabelText('Required'))
        fireEvent.click(within(widget).getByLabelText('Read only'))
        expect(uiAuthoringSession.asset!.elements[1]).toMatchObject({
          required: true,
          readOnly: true,
        })
      } else {
        fireEvent.change(within(widget).getByLabelText('Rows'), { target: { value: '6' } })
        fireEvent.blur(within(widget).getByLabelText('Rows'))
        fireEvent.change(within(widget).getByLabelText('Resize'), { target: { value: 'both' } })
        expect(uiAuthoringSession.asset!.elements[1]).toMatchObject({ rows: 6, resize: 'both' })
      }
      const placeholder = within(widget).getByLabelText('Placeholder')
      fireEvent.change(placeholder, { target: { value: 'Updated placeholder' } })
      fireEvent.blur(placeholder)
      expect(uiAuthoringSession.asset!.elements[1]).toMatchObject({
        placeholder: 'Updated placeholder',
      })
      expect(() => UIDocumentSchema.parse(uiAuthoringSession.asset)).not.toThrow()
    },
  )

  it('rejects an overlong Text Input draft without mutation or history', () => {
    uiAuthoringSession.openAsset('builtin:m10b-runtime-hud.ui.json', inspectorAsset('text-input'))
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(`[data-haku-ui-tree-item="${INSPECTED_ID}"]`) as HTMLButtonElement,
    )
    uiCommandBus.clear()
    const widget = screen.getByRole('region', { name: 'Widget' })
    const before = structuredClone(uiAuthoringSession.asset)!
    const value = within(widget).getByLabelText('Value')

    fireEvent.change(value, { target: { value: 'This exceeds twelve' } })
    fireEvent.blur(value)
    expect(within(widget).getByRole('alert').textContent).toMatch(/maxLength/i)
    expect(uiAuthoringSession.asset).toEqual(before)
    expect(uiCommandBus.canUndo()).toBe(false)
  })

  it.each([
    ['checkbox', false],
    ['switch', true],
  ] as const)('edits %s value and nonempty label with one Undo each', (type, initialValue) => {
    uiAuthoringSession.openAsset('builtin:m10b-runtime-hud.ui.json', inspectorAsset(type))
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(`[data-haku-ui-tree-item="${INSPECTED_ID}"]`) as HTMLButtonElement,
    )
    uiCommandBus.clear()
    const widget = screen.getByRole('region', { name: 'Widget' })
    const before = structuredClone(uiAuthoringSession.asset)!

    fireEvent.click(within(widget).getByLabelText('Value'))
    expect(uiAuthoringSession.asset!.elements[1]).toMatchObject({ value: !initialValue })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(before)
    const label = within(widget).getByLabelText('Label')
    fireEvent.change(label, { target: { value: '' } })
    fireEvent.blur(label)
    expect(uiAuthoringSession.asset).toEqual(before)
    expect(within(widget).getByRole('alert').textContent).toMatch(/label/i)
  })

  it('edits Radio group, option, nullable value, and label as strict discrete commands', () => {
    uiAuthoringSession.openAsset('builtin:m10b-runtime-hud.ui.json', inspectorAsset('radio'))
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(`[data-haku-ui-tree-item="${INSPECTED_ID}"]`) as HTMLButtonElement,
    )
    const widget = screen.getByRole('region', { name: 'Widget' })

    for (const [label, value, expected] of [
      ['Group', 'difficulty', { group: 'difficulty' }],
      ['Option value', 'normal', { optionValue: 'normal', value: 'normal' }],
      ['Label', 'Normal', { label: 'Normal' }],
    ] as const) {
      uiCommandBus.clear()
      const before = structuredClone(uiAuthoringSession.asset)!
      const field = within(widget).getByLabelText(label)
      fireEvent.change(field, { target: { value } })
      fireEvent.blur(field)
      expect(uiAuthoringSession.asset!.elements[1]).toMatchObject(expected)
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      expect(uiAuthoringSession.asset).toEqual(before)
    }
    fireEvent.change(within(widget).getByLabelText('Selected value'), { target: { value: '' } })
    expect(uiAuthoringSession.asset!.elements[1]).toMatchObject({ value: null })
  })

  it('preserves Select option order and rejects duplicate or selected-option removal', () => {
    uiAuthoringSession.openAsset('builtin:m10b-runtime-hud.ui.json', inspectorAsset('select'))
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(`[data-haku-ui-tree-item="${INSPECTED_ID}"]`) as HTMLButtonElement,
    )
    uiCommandBus.clear()
    const widget = screen.getByRole('region', { name: 'Widget' })
    const before = structuredClone(uiAuthoringSession.asset)!

    expect((within(widget).getByLabelText('Option 1 value') as HTMLInputElement).disabled).toBe(
      true,
    )
    expect(within(widget).getByText(/selected option value cannot be renamed/i)).toBeTruthy()
    const optionValues = within(widget).getAllByLabelText(/Option \d+ value/)
    fireEvent.change(optionValues[1]!, { target: { value: 'one' } })
    fireEvent.blur(optionValues[1]!)
    expect(uiAuthoringSession.asset).toEqual(before)
    expect(uiCommandBus.canUndo()).toBe(false)
    expect(within(widget).getByRole('alert').textContent).toMatch(/duplicate/i)
    expect(
      (within(widget).getByRole('button', { name: 'Remove option 1' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(within(widget).getByText(/selected option cannot be removed/i)).toBeTruthy()

    fireEvent.click(within(widget).getByRole('button', { name: 'Move option 2 up' }))
    const moved = uiAuthoringSession.asset!.elements[1]!
    expect(moved.type).toBe('select')
    expect(moved.type === 'select' && moved.options.map((option) => option.value)).toEqual([
      'two',
      'one',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(before)

    const placeholder = within(widget).getByLabelText('Placeholder')
    fireEvent.change(placeholder, { target: { value: 'Pick one' } })
    fireEvent.blur(placeholder)
    const secondLabel = within(widget).getByLabelText('Option 2 label')
    fireEvent.change(secondLabel, { target: { value: 'Second' } })
    fireEvent.blur(secondLabel)
    fireEvent.click(within(widget).getByLabelText('Option 2 disabled'))
    expect(uiAuthoringSession.asset!.elements[1]).toMatchObject({
      placeholder: 'Pick one',
      options: [
        { value: 'one', label: 'One', disabled: false },
        { value: 'two', label: 'Second', disabled: true },
      ],
    })
    fireEvent.click(within(widget).getByRole('button', { name: 'Add option' }))
    expect(uiAuthoringSession.asset!.elements[1]).toMatchObject({
      options: [
        { value: 'one' },
        { value: 'two' },
        { value: 'option-3', label: 'Option 3', disabled: false },
      ],
    })
  })

  it.each(['slider', 'progress', 'divider', 'list'] as const)(
    'shows only applicable strict controls for %s',
    (type) => {
      uiAuthoringSession.openAsset('builtin:m10b-runtime-hud.ui.json', inspectorAsset(type))
      const { container } = render(<ViewportTabsShell />)
      fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
      fireEvent.click(
        container.querySelector(`[data-haku-ui-tree-item="${INSPECTED_ID}"]`) as HTMLButtonElement,
      )
      const widget = screen.getByRole('region', { name: 'Widget' })
      expect(
        within(widget).getByLabelText(
          type === 'divider' ? 'Thickness' : type === 'list' ? 'Ordered' : 'Minimum',
        ),
      ).toBeTruthy()
      expect(within(widget).queryByLabelText('Input mode')).toBeNull()
    },
  )

  it('keeps invalid Slider drafts atomic and groups a numeric scrub into one Undo', () => {
    uiAuthoringSession.openAsset('builtin:m10b-runtime-hud.ui.json', inspectorAsset('slider'))
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(`[data-haku-ui-tree-item="${INSPECTED_ID}"]`) as HTMLButtonElement,
    )
    uiCommandBus.clear()
    const widget = screen.getByRole('region', { name: 'Widget' })
    const before = structuredClone(uiAuthoringSession.asset)!
    const minimum = within(widget).getByLabelText('Minimum')
    fireEvent.change(minimum, { target: { value: '12' } })
    fireEvent.blur(minimum)
    expect(uiAuthoringSession.asset).toEqual(before)
    expect(uiCommandBus.canUndo()).toBe(false)
    expect(within(widget).getByRole('alert').textContent).toMatch(/range/i)

    const valueLabel = within(widget).getByText('Value') as HTMLElement
    Object.assign(valueLabel, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
    })
    fireEvent.pointerDown(valueLabel, { button: 0, pointerId: 41, clientX: 0 })
    fireEvent.pointerMove(valueLabel, { pointerId: 41, clientX: 20 })
    fireEvent.pointerMove(valueLabel, { pointerId: 41, clientX: 40 })
    fireEvent.pointerUp(valueLabel, { pointerId: 41, clientX: 40 })
    expect(uiAuthoringSession.asset!.elements[1]).toMatchObject({ value: 7 })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(before)
    expect(uiCommandBus.canUndo()).toBe(false)
  })

  it('edits Progress indeterminate value, Divider fields, and List ordering with exact Undo', () => {
    for (const type of ['progress', 'divider', 'list'] as const) {
      uiAuthoringSession.openAsset('builtin:m10b-runtime-hud.ui.json', inspectorAsset(type))
      const { container, unmount } = render(<ViewportTabsShell />)
      fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
      fireEvent.click(
        container.querySelector(`[data-haku-ui-tree-item="${INSPECTED_ID}"]`) as HTMLButtonElement,
      )
      uiCommandBus.clear()
      const widget = screen.getByRole('region', { name: 'Widget' })
      const before = structuredClone(uiAuthoringSession.asset)!
      if (type === 'progress') {
        fireEvent.change(within(widget).getByLabelText('Progress mode'), {
          target: { value: 'indeterminate' },
        })
        expect(uiAuthoringSession.asset!.elements[1]).toMatchObject({ value: null })
      } else if (type === 'divider') {
        fireEvent.change(within(widget).getByLabelText('Orientation'), {
          target: { value: 'vertical' },
        })
        expect(uiAuthoringSession.asset!.elements[1]).toMatchObject({ orientation: 'vertical' })
      } else {
        fireEvent.click(within(widget).getByLabelText('Ordered'))
        expect(uiAuthoringSession.asset!.elements[1]).toMatchObject({ ordered: true })
      }
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      expect(uiAuthoringSession.asset).toEqual(before)
      expect(uiCommandBus.canUndo()).toBe(false)
      unmount()
    }
  })

  it.each([
    ['frame', ['Focus event', 'Blur event']],
    ['button', ['Activate event']],
    ['text-input', ['Input event', 'Change event', 'Submit event', 'Focus event', 'Blur event']],
    ['text-area', ['Input event', 'Change event', 'Focus event', 'Blur event']],
    ['checkbox', ['Change event']],
    ['radio', ['Change event']],
    ['switch', ['Change event']],
    ['select', ['Change event']],
    ['slider', ['Input event', 'Change event']],
  ] as const)('shows only the compatible Events slots for %s', (type, labels) => {
    uiAuthoringSession.openAsset('builtin:m10b-runtime-hud.ui.json', inspectorEventAsset(type))
    const { container, unmount } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(`[data-haku-ui-tree-item="${INSPECTED_ID}"]`) as HTMLButtonElement,
    )
    const events = screen.getByRole('region', { name: 'Events' })

    expect(
      within(events)
        .getAllByRole('combobox')
        .map((control) => control.getAttribute('aria-label')),
    ).toEqual(labels)
    for (const label of labels) {
      const payload =
        label === 'Activate event' || label === 'Focus event' || label === 'Blur event'
          ? 'none'
          : type === 'checkbox' || type === 'switch'
            ? 'boolean'
            : type === 'slider'
              ? 'number'
              : 'string'
      const eventId =
        payload === 'none'
          ? NONE_EVENT
          : payload === 'string'
            ? STRING_EVENT
            : payload === 'number'
              ? NUMBER_EVENT
              : BOOLEAN_EVENT
      const select = within(events).getByLabelText(label) as HTMLSelectElement
      expect(Array.from(select.options).map((option) => option.value)).toEqual([
        '',
        eventId,
        ...(payload === 'none' ? [SECOND_NONE_EVENT] : []),
      ])

      const slot = label.split(' ')[0]!.toLowerCase()
      uiCommandBus.clear()
      const before = structuredClone(uiAuthoringSession.asset)!
      fireEvent.change(select, { target: { value: eventId } })
      expect((uiAuthoringSession.asset!.elements[1]!.events as Record<string, string>)[slot]).toBe(
        eventId,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      expect(uiAuthoringSession.asset).toEqual(before)
      expect(uiCommandBus.canUndo()).toBe(false)

      fireEvent.change(select, { target: { value: eventId } })
      const bound = structuredClone(uiAuthoringSession.asset)!
      uiCommandBus.clear()
      fireEvent.change(select, { target: { value: '' } })
      expect(slot in uiAuthoringSession.asset!.elements[1]!.events).toBe(false)
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      expect(uiAuthoringSession.asset).toEqual(bound)
      expect(uiCommandBus.canUndo()).toBe(false)
    }
    unmount()
  })

  it.each(['image', 'progress', 'divider', 'list'] as const)(
    'does not render an empty Events section for %s',
    (type) => {
      uiAuthoringSession.openAsset('builtin:m10b-runtime-hud.ui.json', inspectorEventAsset(type))
      const { container, unmount } = render(<ViewportTabsShell />)
      fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
      fireEvent.click(
        container.querySelector(`[data-haku-ui-tree-item="${INSPECTED_ID}"]`) as HTMLButtonElement,
      )
      expect(screen.queryByRole('region', { name: 'Events' })).toBeNull()
      unmount()
    },
  )

  it('preserves exact event IDs and restores binding and clearing with one Undo each', () => {
    uiAuthoringSession.openAsset(
      'builtin:m10b-runtime-hud.ui.json',
      inspectorEventAsset('button', { bind: NONE_EVENT }),
    )
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(`[data-haku-ui-tree-item="${INSPECTED_ID}"]`) as HTMLButtonElement,
    )
    uiCommandBus.clear()
    const events = screen.getByRole('region', { name: 'Events' })
    const binding = within(events).getByLabelText('Activate event')

    const before = structuredClone(uiAuthoringSession.asset)!
    fireEvent.change(binding, { target: { value: SECOND_NONE_EVENT } })
    expect(uiAuthoringSession.asset!.elements[1]!.events).toEqual({
      activate: SECOND_NONE_EVENT,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(before)
    expect(uiCommandBus.canUndo()).toBe(false)

    fireEvent.change(binding, { target: { value: '' } })
    expect(uiAuthoringSession.asset!.elements[1]!.events).toEqual({})
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(uiAuthoringSession.asset).toEqual(before)
    expect(uiCommandBus.canUndo()).toBe(false)
  })

  it('explains and disables slots with no compatible declaration', () => {
    uiAuthoringSession.openAsset(
      'builtin:m10b-runtime-hud.ui.json',
      inspectorEventAsset('button', { declarations: 'string-only' }),
    )
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(`[data-haku-ui-tree-item="${INSPECTED_ID}"]`) as HTMLButtonElement,
    )
    const events = screen.getByRole('region', { name: 'Events' })

    expect((within(events).getByLabelText('Activate event') as HTMLSelectElement).disabled).toBe(
      true,
    )
    expect(within(events).getByText(/no compatible none-payload events are declared/i)).toBeTruthy()
  })

  it('rejects hidden unknown and incompatible event candidates without mutation or history', () => {
    uiAuthoringSession.openAsset('builtin:m10b-runtime-hud.ui.json', inspectorEventAsset('button'))
    const { container } = render(<ViewportTabsShell />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }))
    fireEvent.click(
      container.querySelector(`[data-haku-ui-tree-item="${INSPECTED_ID}"]`) as HTMLButtonElement,
    )
    uiCommandBus.clear()
    const events = screen.getByRole('region', { name: 'Events' })
    const binding = within(events).getByLabelText('Activate event')
    const before = structuredClone(uiAuthoringSession.asset)!

    const unknownOption = document.createElement('option')
    unknownOption.value = UNKNOWN_EVENT
    binding.append(unknownOption)
    fireEvent.change(binding, { target: { value: UNKNOWN_EVENT } })
    expect(uiAuthoringSession.asset).toEqual(before)
    expect(uiCommandBus.canUndo()).toBe(false)
    expect(within(events).getByRole('alert').textContent).toMatch(/unknown UI event/i)

    const incompatibleOption = document.createElement('option')
    incompatibleOption.value = STRING_EVENT
    binding.append(incompatibleOption)
    fireEvent.change(binding, { target: { value: STRING_EVENT } })
    expect(uiAuthoringSession.asset).toEqual(before)
    expect(uiCommandBus.canUndo()).toBe(false)
    expect(within(events).getByRole('alert').textContent).toMatch(/incompatible payload/i)
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
