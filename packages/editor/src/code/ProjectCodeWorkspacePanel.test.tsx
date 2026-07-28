/**
 * @vitest-environment happy-dom
 */
import { createCustomComponentDefinition } from '@haku/core'
import { describe, expect, it } from 'vitest'
import { createProjectBrowserTooling } from './ProjectCodeWorkspacePanel.js'
import type { ProjectService } from '../services/project-service.js'

describe('createProjectBrowserTooling', () => {
  it('includes project component field declarations', () => {
    const component = createCustomComponentDefinition({
      schemaVersion: 1,
      id: '42000000-0000-4000-8000-000000000031',
      name: 'Mover',
      version: 1,
      fields: [{ name: 'speed', type: 'number', default: 4 }],
    })
    const service = {
      getManifest: () => ({
        assets: [],
      }),
      getCustomComponentTypes: () => [component],
    } as unknown as ProjectService

    const tooling = createProjectBrowserTooling(service)

    expect(tooling.files['.haku/generated/project.d.ts']).toContain(
      component.id,
    )
    expect(tooling.files['.haku/generated/project.d.ts']).toContain(
      'readonly "speed": number',
    )
  })
})
