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

  it('supports explicit desktop preview sizes', () => {
    const session = new UIAuthoringSession(
      new CommandBus(),
      { readText: async () => '', writeText: async () => undefined },
      ids(),
    )
    session.openAsset(
      'assets/ui/hud.ui.json',
      createEmptyUIDocument('HUD', DOCUMENT, ROOT),
    )

    session.setViewport('desktop-1920x1080')

    expect(session.viewport).toEqual(UI_DESKTOP_VIEWPORTS['desktop-1920x1080'])
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
    session.openAsset(
      'assets/ui/hud.ui.json',
      createEmptyUIDocument('HUD', DOCUMENT, ROOT),
    )
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
    session.openAsset(
      'assets/ui/hud.ui.json',
      createEmptyUIDocument('HUD', DOCUMENT, ROOT),
    )

    session.select('13000000-0000-4000-8000-000000000099')

    expect(session.selectedElementId).toBeNull()
    expect(session.asset).not.toHaveProperty('selectedElementId')
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
    session.openAsset(
      'assets/ui/hud.ui.json',
      createEmptyUIDocument('HUD', DOCUMENT, ROOT),
    )
    const root = session.asset!.elements[0]!
    if (root.type !== 'frame') throw new Error('Expected root frame fixture')
    root.children.push(TEXT as typeof root.children[number])

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
    session.openAsset(
      'assets/ui/hud.ui.json',
      createEmptyUIDocument('HUD', DOCUMENT, ROOT),
    )
    session.updateElement(ROOT, { name: 'Changed root' })

    await expect(session.save()).rejects.toThrow('Read-only project')
    expect(session.isDirty).toBe(true)
  })
})
