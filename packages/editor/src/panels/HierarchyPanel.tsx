import { memo, useCallback } from 'react'
import type { EntityId } from '@haku/core'
import { CameraComponent } from '@haku/core'
import { useEditorStore } from '../store/editor-store.js'
import { deleteEntity } from '../commands/world-commands.js'
import { EntityCreateMenu } from '../components/EntityCreateMenu.js'

function EntityNode({ id, depth }: { id: EntityId; depth: number }) {
  const worldRevision = useEditorStore((s) => s.worldRevision)
  const world = useEditorStore((s) => s.world)
  const selected = useEditorStore((s) => s.selection?.value === id.value)
  const viewportCameraEntityId = useEditorStore((s) => s.viewportCameraEntityId)
  const setSelection = useEditorStore((s) => s.setSelection)
  const setViewportCameraEntityId = useEditorStore((s) => s.setViewportCameraEntityId)

  if (!world) return null

  void worldRevision
  const name = world.getEntityName(id) ?? 'Entity'
  const children = world.getChildren(id)
  const isCamera = world.hasComponent(id, CameraComponent)
  const isGameView = viewportCameraEntityId?.value === id.value

  return (
    <div>
      <div
        className={`haku-hierarchy-row${selected ? ' haku-hierarchy-row--selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <button type="button" className="haku-hierarchy-row__name" onClick={() => setSelection(id)}>
          {name}
        </button>
        {isCamera && (
          <button
            type="button"
            className={`haku-hierarchy-camera-switch${isGameView ? ' haku-hierarchy-camera-switch--game' : ''}`}
            title={isGameView ? 'Viewport: game camera — click for scene camera' : 'Viewport: scene camera — click for game camera'}
            aria-pressed={isGameView}
            onClick={(event) => {
              event.stopPropagation()
              setViewportCameraEntityId(isGameView ? null : id)
            }}
          >
            <span className={!isGameView ? 'haku-hierarchy-camera-switch__label--active' : undefined}>Scene</span>
            <span className="haku-hierarchy-camera-switch__track" aria-hidden="true">
              <span className="haku-hierarchy-camera-switch__thumb" />
            </span>
            <span className={isGameView ? 'haku-hierarchy-camera-switch__label--active' : undefined}>Game</span>
          </button>
        )}
      </div>
      {children.map((child) => (
        <EntityNode key={child.value} id={child} depth={depth + 1} />
      ))}
    </div>
  )
}

export const HierarchyPanel = memo(function HierarchyPanel() {
  const world = useEditorStore((s) => s.world)
  const worldRevision = useEditorStore((s) => s.worldRevision)
  const mode = useEditorStore((s) => s.mode)
  const selection = useEditorStore((s) => s.selection)

  void worldRevision

  const roots = world
    ? world.getAllEntities().filter((id) => world.getParent(id) === null)
    : []

  const onDelete = useCallback(() => {
    const sel = useEditorStore.getState().selection
    if (sel) deleteEntity(sel)
  }, [])

  const canEdit = !!world && mode === 'edit'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#252530' }}>
      <div style={{ padding: 8, borderBottom: '1px solid #333', display: 'flex', gap: 4 }}>
        <EntityCreateMenu disabled={!canEdit} hasSelection={!!selection} />
        <button type="button" onClick={onDelete} disabled={!canEdit || !selection}>
          Delete
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {!world ? (
          <div style={{ padding: 12, color: '#888', fontSize: 12 }}>Load a scene to edit hierarchy</div>
        ) : roots.length === 0 ? (
          <div style={{ padding: 12, color: '#888', fontSize: 12 }}>No entities — click +</div>
        ) : (
          roots.map((id) => <EntityNode key={id.value} id={id} depth={0} />)
        )}
      </div>
    </div>
  )
})
