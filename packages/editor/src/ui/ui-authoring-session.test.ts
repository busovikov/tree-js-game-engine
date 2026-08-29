import { describe, expect, it, vi } from 'vitest'
import { CommandBus } from '../commands/command-bus.js'
import {
  UIAuthoringSession,
  UI_DESKTOP_VIEWPORTS,
  createEmptyUIDocument,
} from './ui-authoring-session.js'

const DOCUMENT = '13000000-0000-4000-8000-000000000001'
const ROOT = '13000000-0000-4000-8000-000000000002'
const TEXT = '13000000-0000-4000-8000-000000000003'
const DESCENDANT = '13000000-0000-4000-8000-000000000004'
const EVENT = '13000000-0000-4000-8000-000000000005'

function ids() {
  const values = [DOCUMENT, ROOT, TEXT]
  return () => values.shift() ?? crypto.randomUUID()
}

describe('UIAuthoringSession', () => {
  it('edits hierarchy through commands and restores strict assets on undo', () => {
    const commands = new CommandBus()
    const session = new UIAuthoringSession(
      commands,
      { readText: async () => '', writeText: async () => undefined },
      ids(),
    )
    session.create('assets/ui/hud.ui.json', 'HUD')
    const root = session.asset!.root

    const text = session.addElement(root, 'text')
    session.updateElement(text, { text: 'Score' })
    expect(session.hierarchy()).toEqual([
      expect.objectContaining({
        id: root,
        children: [expect.objectContaining({ id: text, type: 'text' })],
      }),
    ])

    commands.undo()
    expect(session.asset!.elements.find((element) => element.id === text)).toMatchObject({
      text: '',
    })
    commands.undo()
    expect(session.asset!.elements).toHaveLength(1)
  })

  it('groups one continuous Inspector edit into one undo command', () => {
    const commands = new CommandBus()
    const session = new UIAuthoringSession(
      commands,
      { readText: async () => '', writeText: async () => undefined },
      ids(),
    )
    session.create('assets/ui/hud.ui.json', 'HUD')
    const root = session.asset!.root
    const before = structuredClone(session.asset)

    session.updateElement(root, { style: { opacity: 0.9 } }, { historyGroup: 'opacity-drag' })
    session.updateElement(root, { style: { opacity: 0.8 } }, { historyGroup: 'opacity-drag' })
    session.updateElement(root, { style: { opacity: 0.7 } }, { historyGroup: 'opacity-drag' })

    expect(session.asset!.elements[0]).toMatchObject({ style: { opacity: 0.7 } })
    commands.undo()
    expect(session.asset).toEqual(before)
    expect(commands.canUndo()).toBe(true)
  })

  it('creates, places, and detaches components as atomic undoable commands', () => {
    const commands = new CommandBus()
    const generated = [
      '13000000-0000-4000-8000-000000000010',
      '13000000-0000-4000-8000-000000000011',
      '13000000-0000-4000-8000-000000000012',
      '13000000-0000-4000-8000-000000000013',
    ]
    const session = new UIAuthoringSession(
      commands,
      { readText: async () => '', writeText: async () => undefined },
      () => generated.shift() ?? crypto.randomUUID(),
    )
    const base = createEmptyUIDocument('HUD', DOCUMENT, ROOT)
    session.openAsset('assets/ui/hud.ui.json', {
      ...base,
      elements: [
        { ...base.elements[0], layout: { mode: 'vertical' }, children: [TEXT] },
        { id: TEXT, type: 'text', name: 'Label', text: 'Ready' },
      ],
    })
    const beforeCreate = structuredClone(session.asset)

    const created = session.createComponent(TEXT, 'Status label')
    expect(created).toEqual({
      componentId: '13000000-0000-4000-8000-000000000010',
      instanceId: '13000000-0000-4000-8000-000000000011',
    })
    expect(session.selectedElementId).toBe(created.instanceId)
    commands.undo()
    expect(session.asset).toEqual(beforeCreate)
    commands.redo()

    const placed = session.placeComponent(created.componentId, { selectedId: ROOT })
    expect(placed).toBe('13000000-0000-4000-8000-000000000012')
    expect(session.selectedElementId).toBe(placed)

    const detached = session.detachComponentInstance(placed)
    expect(detached).toBe('13000000-0000-4000-8000-000000000013')
    expect(session.selectedElementId).toBe(detached)
    expect(session.asset?.elements.find((element) => element.id === detached)).toMatchObject({
      type: 'text',
      text: 'Ready',
    })
    commands.undo()
    expect(session.asset?.elements.find((element) => element.id === placed)).toMatchObject({
      type: 'instance',
    })
    expect(session.selectedElementId).toBe(placed)
    commands.redo()
    expect(session.asset?.elements.find((element) => element.id === detached)).toMatchObject({
      type: 'text',
      text: 'Ready',
    })
    expect(session.selectedElementId).toBe(detached)
  })

  it('rejects an invalid instance override before it enters history', () => {
    const commands = new CommandBus()
    const generated = [
      '13000000-0000-4000-8000-000000000010',
      '13000000-0000-4000-8000-000000000011',
    ]
    const session = new UIAuthoringSession(
      commands,
      { readText: async () => '', writeText: async () => undefined },
      () => generated.shift() ?? crypto.randomUUID(),
    )
    const base = createEmptyUIDocument('HUD', DOCUMENT, ROOT)
    session.openAsset('assets/ui/hud.ui.json', {
      ...base,
      elements: [
        { ...base.elements[0], layout: { mode: 'vertical' }, children: [TEXT] },
        { id: TEXT, type: 'text', text: 'Ready' },
      ],
    })
    const created = session.createComponent(TEXT, 'Status label')
    const before = structuredClone(session.asset)
    const state = commands.getStateId()

    expect(() => session.setInstanceOverride(created.instanceId, TEXT, { value: true })).toThrow(
      'Value override is invalid for text',
    )
    expect(commands.getStateId()).toBe(state)
    expect(session.asset).toEqual(before)
  })

  it('resets an instance override atomically and restores it on undo', () => {
    const commands = new CommandBus()
    const generated = [
      '13000000-0000-4000-8000-000000000010',
      '13000000-0000-4000-8000-000000000011',
    ]
    const session = new UIAuthoringSession(
      commands,
      { readText: async () => '', writeText: async () => undefined },
      () => generated.shift() ?? crypto.randomUUID(),
    )
    const base = createEmptyUIDocument('HUD', DOCUMENT, ROOT)
    session.openAsset('assets/ui/hud.ui.json', {
      ...base,
      elements: [
        { ...base.elements[0], layout: { mode: 'vertical' }, children: [TEXT] },
        { id: TEXT, type: 'text', text: 'Ready' },
      ],
    })
    const created = session.createComponent(TEXT, 'Status label')
    session.setInstanceOverride(created.instanceId, TEXT, { text: 'Retry' })

    session.resetInstanceOverride(created.instanceId, TEXT)
    expect(
      session.asset?.elements.find((element) => element.id === created.instanceId),
    ).toMatchObject({ overrides: {} })
    commands.undo()
    expect(
      session.asset?.elements.find((element) => element.id === created.instanceId),
    ).toMatchObject({ overrides: { [TEXT]: { text: 'Retry' } } })
  })

  it('merges and resets instance override fields and all overrides as atomic commands', () => {
    const commands = new CommandBus()
    const generated = [
      '13000000-0000-4000-8000-000000000010',
      '13000000-0000-4000-8000-000000000011',
    ]
    const session = new UIAuthoringSession(
      commands,
      { readText: async () => '', writeText: async () => undefined },
      () => generated.shift() ?? crypto.randomUUID(),
    )
    const base = createEmptyUIDocument('HUD', DOCUMENT, ROOT)
    session.openAsset('assets/ui/hud.ui.json', {
      ...base,
      elements: [
        { ...base.elements[0], layout: { mode: 'vertical' }, children: [TEXT] },
        { id: TEXT, type: 'text', text: 'Ready' },
      ],
    })
    const created = session.createComponent(TEXT, 'Status label')
    session.setInstanceOverride(created.instanceId, TEXT, { text: 'Retry' })
    session.setInstanceOverride(created.instanceId, TEXT, { style: { color: '#f00' } })
    expect(
      session.asset?.elements.find((element) => element.id === created.instanceId),
    ).toMatchObject({
      overrides: { [TEXT]: { text: 'Retry', style: { color: '#f00' } } },
    })

    session.resetInstanceOverrideField(created.instanceId, TEXT, 'style')
    expect(
      session.asset?.elements.find((element) => element.id === created.instanceId),
    ).toMatchObject({
      overrides: { [TEXT]: { text: 'Retry' } },
    })
    commands.undo()
    expect(
      session.asset?.elements.find((element) => element.id === created.instanceId),
    ).toMatchObject({
      overrides: { [TEXT]: { text: 'Retry', style: { color: '#f00' } } },
    })
    commands.redo()

    session.resetAllInstanceOverrides(created.instanceId)
    expect(
      session.asset?.elements.find((element) => element.id === created.instanceId),
    ).toMatchObject({
      overrides: {},
    })
    commands.undo()
    expect(
      session.asset?.elements.find((element) => element.id === created.instanceId),
    ).toMatchObject({
      overrides: { [TEXT]: { text: 'Retry' } },
    })
    commands.redo()

    const state = commands.getStateId()
    const before = structuredClone(session.asset)
    expect(() => session.resetAllInstanceOverrides(created.instanceId)).toThrow(
      'UI component instance has no overrides',
    )
    expect(commands.getStateId()).toBe(state)
    expect(session.asset).toEqual(before)
  })

  it('keeps document and component-master selection distinct through exit and undo/redo', () => {
    const commands = new CommandBus()
    const generated = [
      '13000000-0000-4000-8000-000000000010',
      '13000000-0000-4000-8000-000000000011',
    ]
    const session = new UIAuthoringSession(
      commands,
      { readText: async () => '', writeText: async () => undefined },
      () => generated.shift() ?? crypto.randomUUID(),
    )
    const base = createEmptyUIDocument('HUD', DOCUMENT, ROOT)
    session.openAsset('assets/ui/hud.ui.json', {
      ...base,
      elements: [
        { ...base.elements[0], children: [TEXT] },
        {
          id: TEXT,
          type: 'frame',
          name: 'Card',
          children: [DESCENDANT],
          layout: { mode: 'vertical' },
        },
        { id: DESCENDANT, type: 'text', name: 'Label', text: 'Ready' },
      ],
    })
    session.select(TEXT)
    const created = session.createComponent(TEXT, 'Card')

    session.enterComponentMaster(created.componentId)

    expect(session.editScope).toEqual({ type: 'component', componentId: created.componentId })
    expect(session.selectedElementIds).toEqual([TEXT])
    session.select(DESCENDANT)
    expect(session.selectedElementIds).toEqual([DESCENDANT])

    session.exitComponentMaster()
    expect(session.editScope).toEqual({ type: 'document' })
    expect(session.selectedElementIds).toEqual([created.instanceId])

    commands.undo()
    expect(session.editScope).toEqual({ type: 'document' })
    expect(session.selectedElementIds).toEqual([TEXT])
    commands.redo()
    expect(session.editScope).toEqual({ type: 'document' })
    expect(session.selectedElementIds).toEqual([created.instanceId])
  })

  it('rejects unknown component masters and source elements without changing document selection', () => {
    const generated = [
      '13000000-0000-4000-8000-000000000010',
      '13000000-0000-4000-8000-000000000011',
    ]
    const session = new UIAuthoringSession(
      new CommandBus(),
      { readText: async () => '', writeText: async () => undefined },
      () => generated.shift() ?? crypto.randomUUID(),
    )
    const base = createEmptyUIDocument('HUD', DOCUMENT, ROOT)
    session.openAsset('assets/ui/hud.ui.json', {
      ...base,
      elements: [
        { ...base.elements[0], children: [TEXT] },
        { id: TEXT, type: 'text', text: 'Ready' },
      ],
    })
    session.select(TEXT)
    const created = session.createComponent(TEXT, 'Status label')

    expect(() => session.enterComponentMaster('13000000-0000-4000-8000-000000000099')).toThrow(
      'Unknown UI component',
    )
    expect(() =>
      session.enterComponentMaster(created.componentId, '13000000-0000-4000-8000-000000000098'),
    ).toThrow('Unknown UI component source')
    expect(session.editScope).toEqual({ type: 'document' })
    expect(session.selectedElementIds).toEqual([created.instanceId])
  })

  it('keeps component edit scope and selection out of serialized UI JSON', async () => {
    let saved = ''
    const generated = [
      '13000000-0000-4000-8000-000000000010',
      '13000000-0000-4000-8000-000000000011',
    ]
    const session = new UIAuthoringSession(
      new CommandBus(),
      {
        readText: async () => saved,
        writeText: async (_path, value) => {
          saved = value
        },
      },
      () => generated.shift() ?? crypto.randomUUID(),
    )
    const base = createEmptyUIDocument('HUD', DOCUMENT, ROOT)
    session.openAsset('assets/ui/hud.ui.json', {
      ...base,
      elements: [
        { ...base.elements[0], children: [TEXT] },
        { id: TEXT, type: 'text', text: 'Ready' },
      ],
    })
    const created = session.createComponent(TEXT, 'Status label')
    session.enterComponentMaster(created.componentId)

    await session.save()

    expect(JSON.parse(saved)).not.toHaveProperty('editScope')
    expect(JSON.parse(saved)).not.toHaveProperty('selection')
  })

  it('edits component-master elements and structure as strict undoable replacements', () => {
    const commands = new CommandBus()
    const generated = [
      '13000000-0000-4000-8000-000000000010',
      '13000000-0000-4000-8000-000000000011',
      '13000000-0000-4000-8000-000000000012',
    ]
    const session = new UIAuthoringSession(
      commands,
      { readText: async () => '', writeText: async () => undefined },
      () => generated.shift() ?? crypto.randomUUID(),
    )
    const base = createEmptyUIDocument('HUD', DOCUMENT, ROOT)
    session.openAsset('assets/ui/hud.ui.json', {
      ...base,
      elements: [
        { ...base.elements[0], children: [TEXT] },
        {
          id: TEXT,
          type: 'frame',
          children: [DESCENDANT],
          layout: { mode: 'vertical' },
        },
        { id: DESCENDANT, type: 'text', text: 'Ready' },
      ],
    })
    const created = session.createComponent(TEXT, 'Card')
    session.enterComponentMaster(created.componentId, DESCENDANT)

    session.updateElement(DESCENDANT, { text: 'Go' })
    const added = session.addElement(TEXT, 'text')

    expect(session.selectedElementIds).toEqual([added])
    expect(session.asset?.elements).toHaveLength(2)
    expect(
      session.asset?.components[0]?.elements.find((element) => element.id === DESCENDANT),
    ).toMatchObject({ text: 'Go' })
    expect(
      session.asset?.components[0]?.elements.find((element) => element.id === created.instanceId),
    ).toBeUndefined()
    expect(
      session.asset?.elements.find((element) => element.id === created.instanceId),
    ).toMatchObject({ type: 'instance', overrides: {} })

    commands.undo()
    expect(session.editScope).toEqual({ type: 'component', componentId: created.componentId })
    expect(session.selectedElementIds).toEqual([DESCENDANT])
    expect(session.asset?.components[0]?.elements).toHaveLength(2)
    commands.undo()
    expect(
      session.asset?.components[0]?.elements.find((element) => element.id === DESCENDANT),
    ).toMatchObject({ text: 'Ready' })
    expect(session.selectedElementIds).toEqual([DESCENDANT])
    commands.redo()
    commands.redo()
    expect(session.selectedElementIds).toEqual([added])

    session.exitComponentMaster()
    expect(session.selectedElementIds).toEqual([created.instanceId])
    commands.undo()
    expect(session.selectedElementIds).toEqual([created.instanceId])
    expect(session.asset?.components[0]?.elements).toHaveLength(2)
    commands.redo()
    expect(session.selectedElementIds).toEqual([created.instanceId])
    expect(session.asset?.components[0]?.elements).toHaveLength(3)
    const state = commands.getStateId()
    expect(() => session.removeElement(added)).toThrow(`Unknown UI element: ${added}`)
    expect(commands.getStateId()).toBe(state)
  })

  it('rejects master type and event changes that invalidate an instance override atomically', () => {
    const commands = new CommandBus()
    const generated = [
      '13000000-0000-4000-8000-000000000010',
      '13000000-0000-4000-8000-000000000011',
    ]
    const session = new UIAuthoringSession(
      commands,
      { readText: async () => '', writeText: async () => undefined },
      () => generated.shift() ?? crypto.randomUUID(),
    )
    const base = createEmptyUIDocument('HUD', DOCUMENT, ROOT)
    session.openAsset('assets/ui/hud.ui.json', {
      ...base,
      events: [{ id: EVENT, name: 'Activate', payload: 'none' }],
      elements: [
        { ...base.elements[0], children: [TEXT] },
        { id: TEXT, type: 'button', text: 'Ready' },
      ],
    })
    const created = session.createComponent(TEXT, 'Status label')
    session.setInstanceOverride(created.instanceId, TEXT, {
      text: 'Retry',
      events: { activate: EVENT as never },
    })
    session.enterComponentMaster(created.componentId)
    const before = structuredClone(session.asset)
    const state = commands.getStateId()

    expect(() =>
      session.replaceComponentMasterElement(TEXT, { id: TEXT, type: 'rectangle' }),
    ).toThrow(
      /Invalid UI component master edit.*Text override is invalid for rectangle.*UI event slot rectangle.activate is invalid/,
    )
    expect(commands.getStateId()).toBe(state)
    expect(session.asset).toEqual(before)
    expect(session.editScope).toEqual({ type: 'component', componentId: created.componentId })
    expect(session.selectedElementIds).toEqual([TEXT])
  })

  it('rejects option and range edits that invalidate overrides on any instance', () => {
    const commands = new CommandBus()
    const selectId = TEXT
    const sliderId = DESCENDANT
    const generated = [
      '13000000-0000-4000-8000-000000000010',
      '13000000-0000-4000-8000-000000000011',
      '13000000-0000-4000-8000-000000000012',
      '13000000-0000-4000-8000-000000000013',
      '13000000-0000-4000-8000-000000000014',
    ]
    const session = new UIAuthoringSession(
      commands,
      { readText: async () => '', writeText: async () => undefined },
      () => generated.shift() ?? crypto.randomUUID(),
    )
    const base = createEmptyUIDocument('HUD', DOCUMENT, ROOT)
    session.openAsset('assets/ui/hud.ui.json', {
      ...base,
      elements: [
        { ...base.elements[0], children: [selectId, sliderId] },
        {
          id: selectId,
          type: 'select',
          value: 'a',
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
          accessibility: { label: 'Choice' },
        },
        {
          id: sliderId,
          type: 'slider',
          min: 0,
          max: 10,
          step: 1,
          value: 0,
          accessibility: { label: 'Amount' },
        },
      ],
    })
    const select = session.createComponent(selectId, 'Choice')
    const slider = session.createComponent(sliderId, 'Amount')
    const secondSelect = session.placeComponent(select.componentId, { selectedId: ROOT })
    session.setInstanceOverride(secondSelect, selectId, { value: 'b' })
    session.setInstanceOverride(slider.instanceId, sliderId, { value: 8 })

    session.enterComponentMaster(select.componentId)
    const selectState = commands.getStateId()
    expect(() =>
      session.updateElement(selectId, { options: [{ value: 'a', label: 'A' }] }),
    ).toThrow(/Invalid UI component master edit.*Value override is invalid for select/)
    expect(commands.getStateId()).toBe(selectState)
    session.exitComponentMaster()

    session.enterComponentMaster(slider.componentId)
    const sliderState = commands.getStateId()
    expect(() => session.updateElement(sliderId, { max: 5 })).toThrow(
      /Invalid UI component master edit.*Value override is invalid for slider/,
    )
    expect(commands.getStateId()).toBe(sliderState)
    expect(session.selectedElementIds).toEqual([sliderId])
  })

  it('renames, duplicates, and deletes component masters as atomic commands without disturbing another active scope', () => {
    const commands = new CommandBus()
    const generated = [
      '13000000-0000-4000-8000-000000000020',
      '13000000-0000-4000-8000-000000000021',
    ]
    const session = new UIAuthoringSession(
      commands,
      { readText: async () => '', writeText: async () => undefined },
      () => generated.shift() ?? crypto.randomUUID(),
    )
    const base = createEmptyUIDocument('HUD', DOCUMENT, ROOT)
    session.openAsset('assets/ui/hud.ui.json', {
      ...base,
      components: [
        {
          id: '13000000-0000-4000-8000-000000000010',
          name: 'Card',
          root: TEXT,
          elements: [{ id: TEXT, type: 'text', text: 'Card' }],
        },
        {
          id: '13000000-0000-4000-8000-000000000011',
          name: 'Badge',
          root: DESCENDANT,
          elements: [{ id: DESCENDANT, type: 'text', text: 'Badge' }],
        },
      ],
    })
    session.enterComponentMaster('13000000-0000-4000-8000-000000000010')
    const scope = session.editScope
    const selection = session.selectedElementIds

    session.renameComponent('13000000-0000-4000-8000-000000000011', 'Status badge')
    expect(session.asset?.components[1]?.name).toBe('Status badge')
    expect(session.editScope).toEqual(scope)
    expect(session.selectedElementIds).toEqual(selection)
    commands.undo()
    expect(session.asset?.components[1]?.name).toBe('Badge')
    commands.redo()

    const duplicated = session.duplicateComponent('13000000-0000-4000-8000-000000000011')
    expect(duplicated).toBe('13000000-0000-4000-8000-000000000020')
    expect(session.asset?.components.at(-1)).toMatchObject({ name: 'Status badge 2' })
    expect(session.editScope).toEqual(scope)
    expect(session.selectedElementIds).toEqual(selection)
    commands.undo()
    expect(session.asset?.components).toHaveLength(2)
    commands.redo()

    session.deleteComponent(duplicated)
    expect(session.asset?.components).toHaveLength(2)
    expect(session.editScope).toEqual(scope)
    expect(session.selectedElementIds).toEqual(selection)
    commands.undo()
    expect(session.asset?.components).toHaveLength(3)
    commands.redo()
    expect(session.asset?.components).toHaveLength(2)
  })

  it('rejects deleting referenced masters without changing asset, history, scope, or selection', () => {
    const commands = new CommandBus()
    const generated = [
      '13000000-0000-4000-8000-000000000010',
      '13000000-0000-4000-8000-000000000011',
    ]
    const session = new UIAuthoringSession(
      commands,
      { readText: async () => '', writeText: async () => undefined },
      () => generated.shift() ?? crypto.randomUUID(),
    )
    const base = createEmptyUIDocument('HUD', DOCUMENT, ROOT)
    session.openAsset('assets/ui/hud.ui.json', {
      ...base,
      elements: [
        { ...base.elements[0], children: [TEXT] },
        { id: TEXT, type: 'text', name: 'Status', text: 'Ready' },
      ],
    })
    const created = session.createComponent(TEXT, 'Status')
    const before = structuredClone(session.asset)
    const state = commands.getStateId()
    const scope = session.editScope
    const selection = session.selectedElementIds

    expect(() => session.deleteComponent(created.componentId)).toThrow(
      /document instance .* references it/,
    )
    expect(session.asset).toEqual(before)
    expect(commands.getStateId()).toBe(state)
    expect(session.editScope).toEqual(scope)
    expect(session.selectedElementIds).toEqual(selection)
  })

  it('supports explicit desktop preview sizes', () => {
    const session = new UIAuthoringSession(
      new CommandBus(),
      { readText: async () => '', writeText: async () => undefined },
      ids(),
    )
    session.openAsset('assets/ui/hud.ui.json', createEmptyUIDocument('HUD', DOCUMENT, ROOT))

    session.setViewport('desktop-1920x1080')

    expect(session.viewport).toEqual(UI_DESKTOP_VIEWPORTS['desktop-1920x1080'])
  })

  it('keeps custom preview size and edit mode outside the serialized UI document', async () => {
    let saved = ''
    const session = new UIAuthoringSession(
      new CommandBus(),
      {
        readText: async () => saved,
        writeText: async (_path, value) => {
          saved = value
        },
      },
      ids(),
    )
    session.openAsset('assets/ui/hud.ui.json', createEmptyUIDocument('HUD', DOCUMENT, ROOT))

    session.setCustomViewport(900, 700)
    session.setPreviewMode('preview')
    await session.save()

    expect(session.viewport).toEqual({
      id: 'custom',
      label: 'Custom 900 × 700',
      width: 900,
      height: 700,
    })
    expect(session.previewMode).toBe('preview')
    expect(JSON.parse(saved)).not.toHaveProperty('viewport')
    expect(JSON.parse(saved)).not.toHaveProperty('previewMode')
  })

  it('rejects invalid custom preview sizes without changing editor view state', () => {
    const session = new UIAuthoringSession(
      new CommandBus(),
      { readText: async () => '', writeText: async () => undefined },
      ids(),
    )
    session.openAsset('assets/ui/hud.ui.json', createEmptyUIDocument('HUD', DOCUMENT, ROOT))

    expect(() => session.setCustomViewport(0, 720)).toThrow('positive finite')
    expect(session.viewport).toEqual(UI_DESKTOP_VIEWPORTS['desktop-1280x720'])
  })

  it('saves and reloads through project storage without editor state in the asset', async () => {
    let saved = ''
    const storage = {
      readText: async () => saved,
      writeText: async (_path: string, value: string) => {
        saved = value
      },
    }
    const session = new UIAuthoringSession(new CommandBus(), storage, ids())
    session.openAsset('assets/ui/hud.ui.json', createEmptyUIDocument('HUD', DOCUMENT, ROOT))
    session.addElement(ROOT, 'text')

    await session.save()
    session.close()
    await session.open('assets/ui/hud.ui.json')

    expect(session.isDirty).toBe(false)
    expect(session.asset?.elements).toHaveLength(2)
    expect(JSON.parse(saved)).not.toHaveProperty('viewport')
    expect(JSON.parse(saved)).not.toHaveProperty('selectedElementId')
  })

  it('keeps selection editor-only and clears unknown selections', () => {
    const session = new UIAuthoringSession(
      new CommandBus(),
      { readText: async () => '', writeText: async () => undefined },
      ids(),
    )
    session.openAsset('assets/ui/hud.ui.json', createEmptyUIDocument('HUD', DOCUMENT, ROOT))

    session.select('13000000-0000-4000-8000-000000000099')

    expect(session.selectedElementId).toBeNull()
    expect(session.asset).not.toHaveProperty('selectedElementId')
  })

  it('shares multi-selection and rejects a toggle without a common parent', () => {
    const session = new UIAuthoringSession(
      new CommandBus(),
      { readText: async () => '', writeText: async () => undefined },
      ids(),
    )
    session.openAsset('assets/ui/hud.ui.json', {
      ...createEmptyUIDocument('HUD', DOCUMENT, ROOT),
      elements: [
        {
          ...createEmptyUIDocument('HUD', DOCUMENT, ROOT).elements[0],
          children: [TEXT, '13000000-0000-4000-8000-000000000004'],
          layout: { mode: 'free', padding: {} },
        },
        {
          id: TEXT,
          type: 'text',
          text: 'A',
          placement: {
            positioning: 'free',
            x: 0,
            y: 0,
            horizontalConstraint: 'left',
            verticalConstraint: 'top',
            referenceWidth: 1280,
            referenceHeight: 720,
          },
        },
        {
          id: '13000000-0000-4000-8000-000000000004',
          type: 'text',
          text: 'B',
          placement: {
            positioning: 'free',
            x: 10,
            y: 10,
            horizontalConstraint: 'left',
            verticalConstraint: 'top',
            referenceWidth: 1280,
            referenceHeight: 720,
          },
        },
      ],
    })

    session.select(TEXT)
    session.toggleSelection('13000000-0000-4000-8000-000000000004')

    expect(session.selectedElementIds).toEqual([TEXT, '13000000-0000-4000-8000-000000000004'])
    expect(session.selectedElementId).toBe('13000000-0000-4000-8000-000000000004')
  })

  it('restores selection with a deleted subtree across undo and redo', () => {
    const commands = new CommandBus()
    const session = new UIAuthoringSession(
      commands,
      { readText: async () => '', writeText: async () => undefined },
      ids(),
    )
    session.create('assets/ui/hud.ui.json', 'HUD')
    const root = session.asset!.root
    const text = session.addElement(root, 'text')
    session.select(text)

    session.removeElement(text)
    expect(session.selectedElementIds).toEqual([root])
    commands.undo()
    expect(session.selectedElementIds).toEqual([text])
    commands.redo()
    expect(session.selectedElementIds).toEqual([root])
  })

  it('commits a hierarchy move once and restores exact order and placement on undo', () => {
    const commands = new CommandBus()
    const session = new UIAuthoringSession(
      commands,
      { readText: async () => '', writeText: async () => undefined },
      ids(),
    )
    const base = createEmptyUIDocument('HUD', DOCUMENT, ROOT)
    session.openAsset('assets/ui/hud.ui.json', {
      ...base,
      elements: [
        {
          ...base.elements[0],
          layout: { mode: 'vertical' },
          children: [TEXT, '13000000-0000-4000-8000-000000000004'],
        },
        { id: TEXT, type: 'text', text: 'A' },
        { id: '13000000-0000-4000-8000-000000000004', type: 'text', text: 'B' },
      ],
    })
    const before = structuredClone(session.asset)
    const state = commands.getStateId()

    session.moveElements([TEXT], {
      targetId: '13000000-0000-4000-8000-000000000004' as never,
      position: 'after',
    })

    expect(commands.getStateId()).not.toBe(state)
    expect(session.hierarchy()[0]?.children.map((item) => item.id)).toEqual([
      '13000000-0000-4000-8000-000000000004',
      TEXT,
    ])
    commands.undo()
    expect(session.asset).toEqual(before)
  })

  it('rejects invalid hierarchy operations without dirtying or entering command history', () => {
    const commands = new CommandBus()
    const session = new UIAuthoringSession(
      commands,
      { readText: async () => '', writeText: async () => undefined },
      ids(),
    )
    session.openAsset('assets/ui/hud.ui.json', createEmptyUIDocument('HUD', DOCUMENT, ROOT))
    const state = commands.getStateId()

    expect(() =>
      session.moveElements([ROOT], { targetId: ROOT as never, position: 'inside' }),
    ).toThrow('root')
    expect(() => session.renameElement(ROOT, '   ')).toThrow('cannot be empty')
    expect(commands.getStateId()).toBe(state)
    expect(session.isDirty).toBe(false)
  })

  it('duplicates and deletes multiple subtrees as single undoable operations with fresh IDs', () => {
    const commands = new CommandBus()
    let sequence = 10
    const session = new UIAuthoringSession(
      commands,
      { readText: async () => '', writeText: async () => undefined },
      () => `13000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
    )
    const base = createEmptyUIDocument('HUD', DOCUMENT, ROOT)
    session.openAsset('assets/ui/hud.ui.json', {
      ...base,
      elements: [
        { ...base.elements[0], layout: { mode: 'vertical' }, children: [TEXT] },
        {
          id: TEXT,
          type: 'frame',
          layout: { mode: 'vertical' },
          children: ['13000000-0000-4000-8000-000000000004'],
        },
        { id: '13000000-0000-4000-8000-000000000004', type: 'text', text: 'Nested' },
      ],
    })

    const duplicated = session.duplicateElements([TEXT])
    expect(duplicated).toHaveLength(1)
    expect(session.asset?.elements).toHaveLength(5)
    commands.undo()
    expect(session.asset?.elements).toHaveLength(3)

    session.removeElements([TEXT])
    expect(session.asset?.elements).toHaveLength(1)
    commands.undo()
    expect(session.asset?.elements).toHaveLength(3)
  })

  it('keeps editor lock state outside serialized assets and excludes it after replacement', async () => {
    let saved = ''
    const session = new UIAuthoringSession(
      new CommandBus(),
      {
        readText: async () => saved,
        writeText: async (_path, value) => {
          saved = value
        },
      },
      ids(),
    )
    session.openAsset('assets/ui/hud.ui.json', createEmptyUIDocument('HUD', DOCUMENT, ROOT))
    session.setEditorLocked(ROOT, true)
    await session.save()

    expect(session.isEditorLocked(ROOT)).toBe(true)
    expect(JSON.parse(saved)).not.toHaveProperty('editorLocked')
    expect(JSON.parse(saved).elements[0]).not.toHaveProperty('editorLocked')
  })

  it('replaces the full strict asset atomically and restores it on undo', () => {
    const commands = new CommandBus()
    const session = new UIAuthoringSession(
      commands,
      { readText: async () => '', writeText: async () => undefined },
      ids(),
    )
    const original = createEmptyUIDocument('HUD', DOCUMENT, ROOT)
    session.openAsset('assets/ui/hud.ui.json', original)
    session.replaceAsset({ ...original, name: 'HUD updated' })

    expect(session.asset?.name).toBe('HUD updated')

    expect(() =>
      session.replaceAsset({
        ...original,
        root: TEXT,
        elements: [{ id: TEXT, type: 'text', text: 'Not a root container' }],
      }),
    ).toThrow('UI root must reference a frame element')
    expect(session.asset?.name).toBe('HUD updated')

    commands.undo()
    expect(session.asset).toEqual(original)
  })

  it('rejects an invalid in-memory asset before save without writing it', async () => {
    const writeText = vi.fn(async () => undefined)
    const session = new UIAuthoringSession(
      new CommandBus(),
      { readText: async () => '', writeText },
      ids(),
    )
    session.openAsset('assets/ui/hud.ui.json', createEmptyUIDocument('HUD', DOCUMENT, ROOT))
    const root = session.asset!.elements[0]!
    if (root.type !== 'frame') throw new Error('Expected root frame fixture')
    root.children.push(TEXT as (typeof root.children)[number])

    await expect(session.save()).rejects.toThrow('Unknown UI child')
    expect(writeText).not.toHaveBeenCalled()
    expect(session.isDirty).toBe(true)
  })

  it('keeps the asset dirty when project storage rejects save', async () => {
    const session = new UIAuthoringSession(
      new CommandBus(),
      {
        readText: async () => '',
        writeText: async () => {
          throw new Error('Read-only project')
        },
      },
      ids(),
    )
    session.openAsset('assets/ui/hud.ui.json', createEmptyUIDocument('HUD', DOCUMENT, ROOT))
    session.updateElement(ROOT, { name: 'Changed root' })

    await expect(session.save()).rejects.toThrow('Read-only project')
    expect(session.isDirty).toBe(true)
  })
})
