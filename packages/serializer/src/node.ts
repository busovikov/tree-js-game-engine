import { readFileSync } from 'node:fs'
import type { ComponentRegistry } from '@haku/core'
import { loadSceneDocument } from './index.js'

export async function loadSceneFromPath(path: string, componentRegistry: ComponentRegistry) {
  const raw = readFileSync(path, 'utf-8')
  return loadSceneDocument(JSON.parse(raw), { componentRegistry })
}
