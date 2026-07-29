/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { World } from '@haku/core'
import {
  AUDIO_CLIP_ASSET_TYPE,
  AudioSourceComponent,
  AudioSourceSchema,
} from '@haku/audio'
import { SCENE_ASSET_TYPE, validateProjectManifest } from '@haku/assets'
import { validateSceneDocument } from '@haku/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { globalCommandBus } from '../commands/command-bus.js'
import { projectService } from '../services/project-service.js'
import { useEditorStore } from '../store/editor-store.js'
import { InspectorPanel } from './InspectorPanel.js'

afterEach(() => {
  cleanup()
  globalCommandBus.clear()
})

describe('InspectorPanel AudioSource', () => {
  it('renders authored audio controls and a gesture preview action', () => {
    const clipId = '10000000-0000-4000-8000-000000000052'
    projectService.openFromManifest(
      'audio-project',
      validateProjectManifest({
        schemaVersion: 1,
        name: 'Audio project',
        entryScene: {
          $ref: '10000000-0000-4000-8000-000000000001',
          type: SCENE_ASSET_TYPE,
        },
        assetsDir: 'public/assets',
        scriptsDir: 'scripts',
        assets: [
          {
            id: '10000000-0000-4000-8000-000000000001',
            type: SCENE_ASSET_TYPE,
            path: 'scenes/main.scene.json',
          },
          {
            id: clipId,
            type: AUDIO_CLIP_ASSET_TYPE,
            path: 'audio/tone.wav',
          },
        ],
      }),
    )
    const world = new World()
    const entity = world.createEntity('Speaker')
    world.addComponent(
      entity,
      AudioSourceComponent,
      AudioSourceSchema.parse({
        clip: { $ref: clipId, type: AUDIO_CLIP_ASSET_TYPE },
      }),
    )
    useEditorStore.getState().setScene(
      'public/assets/scenes/main.scene.json',
      validateSceneDocument({
        schemaVersion: 1,
        metadata: { name: 'Main' },
        entities: [],
      }),
      world,
    )
    useEditorStore.getState().setSelection([entity])

    render(<InspectorPanel />)

    expect(screen.getByText('AudioSource')).toBeTruthy()
    expect(screen.getByLabelText('Audio Clip')).toBeTruthy()
    expect(screen.getByLabelText('Bus')).toBeTruthy()
    expect(screen.getByLabelText('Volume')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Preview audio' })).toBeTruthy()
  })
})
