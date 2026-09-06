import { describe, expect, it } from 'vitest'
import config, { createEditorViteConfig } from '../vite.config.js'

describe('editor Vite React boundary', () => {
  it('deduplicates React for lazy editor adapters', () => {
    expect(typeof config).toBe('object')
    if (typeof config !== 'object' || config === null) return

    expect(config.resolve?.dedupe).toEqual(expect.arrayContaining(['react', 'react-dom']))
  })

  it('isolates a dev-target project from protected playground assets', () => {
    const targetConfig = createEditorViteConfig('/workspace/apps/bounce-run')
    const pluginNames = (targetConfig.plugins ?? [])
      .flat()
      .filter((plugin): plugin is Exclude<typeof plugin, false | null | undefined> =>
        Boolean(plugin),
      )
      .map((plugin) => (typeof plugin === 'object' && 'name' in plugin ? plugin.name : undefined))

    expect(pluginNames).toContain('haku-target-project')
    expect(pluginNames).not.toContain('playground-assets-manifest')
    expect(targetConfig.publicDir).toBe(false)
  })
})
