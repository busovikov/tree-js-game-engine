import type { SceneDocument } from './index.js'

export function listCameraEntityIds(document: SceneDocument): string[] {
  return document.entities
    .filter((entity) => entity.components.some((component) => component.type === 'Camera'))
    .map((entity) => entity.id)
}

/** Resolve the active scene camera id; falls back to the first Camera entity. */
export function resolveActiveCameraId(document: SceneDocument): string | null {
  const cameras = listCameraEntityIds(document)
  if (cameras.length === 0) return null

  const active = document.metadata.activeCameraId
  if (active && cameras.includes(active)) return active

  return cameras[0] ?? null
}
