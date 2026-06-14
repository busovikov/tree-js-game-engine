import { memo, useCallback, useMemo, useState, type DragEvent } from 'react'
import type { EntityId } from '@haku/core'
import { CameraComponent, entityId } from '@haku/core'
import { useEditorStore } from '../store/editor-store.js'
import { EntityCreateMenu } from '../components/EntityCreateMenu.js'
import { HierarchyFilterBar } from '../components/HierarchyFilterBar.js'
import { moveEntityInHierarchyByDrop } from '../commands/hierarchy-commands.js'
import { computeHierarchyFilterSets } from '../hierarchy/entity-filter.js'
import {
  canDropEntity,
  resolveDropMode,
  type HierarchyDropMode,
} from '../hierarchy/hierarchy-drag.js'

const ENTITY_DRAG_MIME = 'application/x-haku-entity'

type DropTarget = { id: string; mode: HierarchyDropMode }

function EntityNode({
  id,
  depth,
  visibleIds,
  canDrag,
  draggedId,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  id: EntityId
  depth: number
  visibleIds: Set<string> | null
  canDrag: boolean
  draggedId: string | null
  dropTarget: DropTarget | null
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDragOver: (id: string, mode: HierarchyDropMode) => void
  onDragLeave: (id: string) => void
  onDrop: (targetId: string, mode: HierarchyDropMode) => void
}) {
  const worldRevision = useEditorStore((s) => s.worldRevision)
  const world = useEditorStore((s) => s.world)
  const selected = useEditorStore((s) => s.selection?.value === id.value)
  const viewportCameraEntityId = useEditorStore((s) => s.viewportCameraEntityId)
  const setSelection = useEditorStore((s) => s.setSelection)
  const setViewportCameraEntityId = useEditorStore((s) => s.setViewportCameraEntityId)

  if (!world) return null
  if (visibleIds && !visibleIds.has(id.value)) return null

  void worldRevision
  const name = world.getEntityName(id) ?? 'Entity'
  const children = world.getChildren(id)
  const isCamera = world.hasComponent(id, CameraComponent)
  const isGameView = viewportCameraEntityId?.value === id.value
  const isDragging = draggedId === id.value
  const isDropTarget = dropTarget?.id === id.value
  const dropMode = isDropTarget ? dropTarget.mode : null

  const rowClass = [
    'haku-hierarchy-row',
    selected ? 'haku-hierarchy-row--selected' : '',
    canDrag ? 'haku-hierarchy-row--draggable' : '',
    isDragging ? 'haku-hierarchy-row--dragging' : '',
    dropMode === 'before' ? 'haku-hierarchy-row--drop-before' : '',
    dropMode === 'after' ? 'haku-hierarchy-row--drop-after' : '',
    dropMode === 'child' ? 'haku-hierarchy-row--drop-child' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!canDrag) {
        event.preventDefault()
        return
      }
      event.dataTransfer.setData(ENTITY_DRAG_MIME, id.value)
      event.dataTransfer.effectAllowed = 'move'
      onDragStart(id.value)
    },
    [canDrag, id.value, onDragStart],
  )

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!canDrag || !draggedId) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'

      const mode = resolveDropMode(event.clientY, event.currentTarget.getBoundingClientRect())
      const dragged = entityId(draggedId)
      if (!canDropEntity(world, dragged, id, mode)) return

      onDragOver(id.value, mode)
    },
    [canDrag, draggedId, id, onDragOver, world],
  )

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!canDrag || !draggedId) return
      event.preventDefault()
      event.stopPropagation()

      const mode = resolveDropMode(event.clientY, event.currentTarget.getBoundingClientRect())
      onDrop(id.value, mode)
    },
    [canDrag, draggedId, id.value, onDrop],
  )

  return (
    <div>
      <div
        className={rowClass}
        style={{ paddingLeft: 8 + depth * 12 }}
        draggable={canDrag}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={() => onDragLeave(id.value)}
        onDrop={handleDrop}
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
            onDragStart={(event) => event.stopPropagation()}
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
        <EntityNode
          key={child.value}
          id={child}
          depth={depth + 1}
          visibleIds={visibleIds}
          canDrag={canDrag}
          draggedId={draggedId}
          dropTarget={dropTarget}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        />
      ))}
    </div>
  )
}

export const HierarchyPanel = memo(function HierarchyPanel() {
  const world = useEditorStore((s) => s.world)
  const worldRevision = useEditorStore((s) => s.worldRevision)
  const mode = useEditorStore((s) => s.mode)
  const selection = useEditorStore((s) => s.selection)
  const hierarchyFilterQuery = useEditorStore((s) => s.hierarchyFilterQuery)
  const hierarchyFilterMode = useEditorStore((s) => s.hierarchyFilterMode)

  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  void worldRevision

  const visibleIds = useMemo(() => {
    if (!world) return null
    return computeHierarchyFilterSets(world, hierarchyFilterQuery, hierarchyFilterMode).visibleIds
  }, [world, worldRevision, hierarchyFilterQuery, hierarchyFilterMode])

  const roots = world
    ? world
        .getRootEntities()
        .filter((id) => !visibleIds || visibleIds.has(id.value))
    : []

  const canEdit = !!world && mode === 'edit'

  const handleDragStart = useCallback((id: string) => {
    setDraggedId(id)
    setDropTarget(null)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedId(null)
    setDropTarget(null)
  }, [])

  const handleDragOver = useCallback((id: string, dropMode: HierarchyDropMode) => {
    setDropTarget((current) => {
      if (current?.id === id && current.mode === dropMode) return current
      return { id, mode: dropMode }
    })
  }, [])

  const handleDragLeave = useCallback((id: string) => {
    setDropTarget((current) => (current?.id === id ? null : current))
  }, [])

  const handleDrop = useCallback(
    (targetId: string, dropMode: HierarchyDropMode) => {
      if (!draggedId) return
      moveEntityInHierarchyByDrop(entityId(draggedId), entityId(targetId), dropMode)
      setDraggedId(null)
      setDropTarget(null)
    },
    [draggedId],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#252530' }}>
      <div style={{ padding: 8, borderBottom: '1px solid #333', display: 'flex', gap: 4, alignItems: 'stretch' }}>
        <EntityCreateMenu disabled={!canEdit} hasSelection={!!selection} />
        <HierarchyFilterBar />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {!world ? (
          <div style={{ padding: 12, color: '#888', fontSize: 12 }}>Load a scene to edit hierarchy</div>
        ) : roots.length === 0 ? (
          <div style={{ padding: 12, color: '#888', fontSize: 12 }}>
            {visibleIds ? 'No entities match filter' : 'No entities — click +'}
          </div>
        ) : (
          roots.map((id) => (
            <EntityNode
              key={id.value}
              id={id}
              depth={0}
              visibleIds={visibleIds}
              canDrag={canEdit}
              draggedId={draggedId}
              dropTarget={dropTarget}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            />
          ))
        )}
      </div>
    </div>
  )
})
