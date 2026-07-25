import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writePlaygroundProjectTextFile } from '../playground-assets-manifest.js'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('playground project writes', () => {
  it('writes nested files inside the playground root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haku-playground-'))
    temporaryRoots.push(root)

    await writePlaygroundProjectTextFile(root, '.haku/editor.json', '{"version":1}\n')

    await expect(readFile(join(root, '.haku/editor.json'), 'utf8')).resolves.toBe('{"version":1}\n')
  })

  it('rejects paths outside the playground root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haku-playground-'))
    temporaryRoots.push(root)

    await expect(writePlaygroundProjectTextFile(root, '../outside.json', '{}')).rejects.toThrow(
      'Invalid project path',
    )
  })
})
