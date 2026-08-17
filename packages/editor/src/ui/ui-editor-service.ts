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
    schemaVersion: 2,
    id: '13000000-0000-4000-8000-000000000100',
    name: 'Runtime HUD',
    root: '13000000-0000-4000-8000-000000000101',
    elements: [
      {
        id: '13000000-0000-4000-8000-000000000101',
        type: 'frame',
        name: 'HUD Root',
        children: [
          '13000000-0000-4000-8000-000000000102',
          '13000000-0000-4000-8000-000000000103',
          '13000000-0000-4000-8000-000000000104',
        ],
        layout: { mode: 'free', padding: { top: 24, right: 24, bottom: 24, left: 24 } },
        sizing: {
          width: { mode: 'fixed', value: 1280, unit: 'px' },
          height: { mode: 'fixed', value: 720, unit: 'px' },
        },
        style: { backgroundColor: '#172033' },
        accessibility: { role: 'main', label: 'Runtime HUD preview' },
      },
      {
        id: '13000000-0000-4000-8000-000000000102',
        type: 'text',
        name: 'Score',
        text: 'SCORE 001250',
        placement: {
          positioning: 'free',
          x: 500,
          y: 220,
          horizontalConstraint: 'center',
          verticalConstraint: 'top',
          referenceWidth: 1280,
          referenceHeight: 720,
        },
        accessibility: { live: 'polite' },
        style: { color: '#f7d154', fontSize: 42, fontWeight: 'bold' },
      },
      {
        id: '13000000-0000-4000-8000-000000000103',
        type: 'button',
        name: 'Continue',
        text: 'Continue',
        placement: {
          positioning: 'free',
          x: 540,
          y: 330,
          horizontalConstraint: 'center',
          verticalConstraint: 'center',
          referenceWidth: 1280,
          referenceHeight: 720,
        },
        accessibility: { label: 'Continue game' },
        style: {
          color: '#ffffff',
          backgroundColor: '#3d5afe',
          fontSize: 22,
          padding: { top: 14, right: 14, bottom: 14, left: 14 },
          borderRadius: 8,
          cursor: 'pointer',
        },
      },
      {
        id: '13000000-0000-4000-8000-000000000104',
        type: 'text',
        name: 'Hint',
        text: 'Press Continue',
        placement: {
          positioning: 'free',
          x: 570,
          y: 430,
          horizontalConstraint: 'center',
          verticalConstraint: 'bottom',
          referenceWidth: 1280,
          referenceHeight: 720,
        },
        sizing: { width: { mode: 'hug' } },
        style: { color: '#aeb8d0', fontSize: 16 },
      },
    ],
  }),
)

export async function requestOpenUIDocument(path: string): Promise<void> {
  await uiAuthoringSession.open(path)
  window.dispatchEvent(new CustomEvent(UI_WORKSPACE_OPEN_EVENT))
}
