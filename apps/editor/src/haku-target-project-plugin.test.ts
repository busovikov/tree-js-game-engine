import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeTargetTextFile } from '../haku-target-project-plugin.js'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('target project writes', () => {
  it('writes nested files inside the configured target root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haku-target-'))
    temporaryRoots.push(root)

    await writeTargetTextFile(root, 'public/assets/scenes/main.scene.json', '{"ok":true}\n')

    await expect(
      readFile(join(root, 'public/assets/scenes/main.scene.json'), 'utf8'),
    ).resolves.toBe('{"ok":true}\n')
  })

  it('rejects paths outside the target root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haku-target-'))
    temporaryRoots.push(root)

    await expect(writeTargetTextFile(root, '../outside.json', '{}')).rejects.toThrow(
      'Invalid target path',
    )
  })
})
