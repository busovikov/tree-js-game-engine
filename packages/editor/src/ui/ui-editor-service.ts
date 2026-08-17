import { UIDocumentSchema } from '@haku/ui'
import { CommandBus } from '../commands/command-bus.js'
import { projectService } from '../services/project-service.js'
import { UIAuthoringSession } from './ui-authoring-session.js'

export const UI_WORKSPACE_OPEN_EVENT = 'haku-open-ui-workspace'

export const uiCommandBus = new CommandBus()

export const uiAuthoringSession = new UIAuthoringSession(uiCommandBus, {
  async readText(path) {
    return JSON.stringify(await projectService.loadUIDocumentAsset(path))
  },
  async writeText(path, value) {
    await projectService.saveUIDocumentAsset(path, JSON.parse(value))
  },
})

uiAuthoringSession.openAsset(
  'builtin:m10b-runtime-hud.ui.json',
  UIDocumentSchema.parse({
    schemaVersion: 1,
    id: '13000000-0000-4000-8000-000000000100',
    name: 'Runtime HUD',
    root: '13000000-0000-4000-8000-000000000101',
    elements: [
      {
        id: '13000000-0000-4000-8000-000000000101',
        type: 'container',
        name: 'HUD Root',
        children: [
          '13000000-0000-4000-8000-000000000102',
          '13000000-0000-4000-8000-000000000103',
          '13000000-0000-4000-8000-000000000104',
        ],
        layout: { direction: 'column', align: 'center', justify: 'center', gap: 20 },
        sizing: { width: '100%', height: '100%' },
        style: { backgroundColor: '#172033' },
        accessibility: { role: 'main', label: 'Runtime HUD preview' },
      },
      {
        id: '13000000-0000-4000-8000-000000000102',
        type: 'text',
        name: 'Score',
        text: 'SCORE 001250',
        accessibility: { live: 'polite' },
        style: { color: '#f7d154', fontSize: 42, fontWeight: 'bold' },
      },
      {
        id: '13000000-0000-4000-8000-000000000103',
        type: 'button',
        name: 'Continue',
        text: 'Continue',
        accessibility: { label: 'Continue game' },
        style: {
          color: '#ffffff',
          backgroundColor: '#3d5afe',
          fontSize: 22,
          padding: 14,
          borderRadius: 8,
          cursor: 'pointer',
        },
      },
      {
        id: '13000000-0000-4000-8000-000000000104',
        type: 'text',
        name: 'Hint',
        text: 'Press Continue',
        sizing: { width: 'auto' },
        style: { color: '#aeb8d0', fontSize: 16 },
      },
    ],
  }),
)

export async function requestOpenUIDocument(path: string): Promise<void> {
  await uiAuthoringSession.open(path)
  window.dispatchEvent(new CustomEvent(UI_WORKSPACE_OPEN_EVENT))
}
