import { describe, expect, it } from 'vitest'
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
})
