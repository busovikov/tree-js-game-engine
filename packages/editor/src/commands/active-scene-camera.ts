import { entityId, type EntityId } from '@haku/core'
import { resolveActiveCameraId } from '@haku/schema'
import { commitSceneEdit } from './scene-history.js'
import { useEditorStore } from '../store/editor-store.js'

export function getActiveSceneCameraId(): EntityId | null {
  const document = useEditorStore.getState().sceneDocument
  if (!document) return null
  const id = resolveActiveCameraId(document)
  return id ? entityId(id) : null
}

export function commitActiveSceneCamera(cameraEntityId: EntityId): void {
  commitSceneEdit((draft) => {
    if (!draft.sceneDocument) return
    draft.sceneDocument.metadata = {
      ...draft.sceneDocument.metadata,
      activeCameraId: cameraEntityId.value,
    }
  })
}
