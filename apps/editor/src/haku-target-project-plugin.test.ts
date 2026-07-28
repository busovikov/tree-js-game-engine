import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  scanTargetWorkspaceFiles,
  writeTargetTextFile,
} from '../haku-target-project-plugin.js'

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

  it('scans only browser code workspace text files from the target', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haku-target-'))
    temporaryRoots.push(root)
    await mkdir(join(root, 'src'), { recursive: true })
    await mkdir(join(root, '.haku/generated'), { recursive: true })
    await mkdir(join(root, 'node_modules/package'), { recursive: true })
    await mkdir(join(root, 'public/assets'), { recursive: true })
    await writeFile(join(root, 'src/gameplay.ts'), 'export const gameplay = true\n')
    await writeFile(join(root, 'src/readme.md'), 'not source')
    await writeFile(join(root, 'tsconfig.json'), '{}\n')
    await writeFile(join(root, '.haku/generated/project.d.ts'), 'declare const project: true\n')
    await writeFile(join(root, 'node_modules/package/index.ts'), 'ignored')
    await writeFile(join(root, 'public/assets/data.json'), '{}')

    await expect(scanTargetWorkspaceFiles(root)).resolves.toEqual({
      '.haku/generated/project.d.ts': 'declare const project: true\n',
      'src/gameplay.ts': 'export const gameplay = true\n',
      'tsconfig.json': '{}\n',
    })
  })
})
