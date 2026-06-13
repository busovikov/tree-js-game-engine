import { readFileSync } from 'node:fs'
import { loadSceneDocument } from './index.js'

export async function loadSceneFromPath(path: string) {
  const raw = readFileSync(path, 'utf-8')
  return loadSceneDocument(JSON.parse(raw))
}
