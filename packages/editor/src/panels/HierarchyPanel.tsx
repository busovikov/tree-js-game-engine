import { memo, useCallback } from 'react'
import type { EntityId } from '@haku/core'
import { useEditorStore } from '../store/editor-store.js'
import { createEntity, deleteEntity } from '../commands/world-commands.js'

function uniqueEntityName(world: NonNullable<ReturnType<typeof useEditorStore.getState>['world']>, base: string): string {
  const names = new Set(world.getAllEntities().map((id) => world.getEntityName(id)))
  if (!names.has(base)) return base
  let i = 2
  while (names.has(`${base} ${i}`)) i++
  return `${base} ${i}`
}

function EntityNode({ id, depth }: { id: EntityId; depth: number }) {
  const worldRevision = useEditorStore((s) => s.worldRevision)
  const world = useEditorStore((s) => s.world)
  const selected = useEditorStore((s) => s.selection?.value === id.value)
  const setSelection = useEditorStore((s) => s.setSelection)

  if (!world) return null

  void worldRevision
  const name = world.getEntityName(id) ?? 'Entity'
  const children = world.getChildren(id)

  return (
    <div>
      <button
        type="button"
        onClick={() => setSelection(id)}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          padding: '4px 8px',
          paddingLeft: 8 + depth * 12,
          background: selected ? '#3d5afe' : 'transparent',
          color: '#eee',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {name}
      </button>
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

  const onCreate = useCallback(() => {
    const w = useEditorStore.getState().world
    if (!w) return
    const name = uniqueEntityName(w, 'New Entity')
    createEntity(name)
  }, [])

  const onDelete = useCallback(() => {
    const sel = useEditorStore.getState().selection
    if (sel) deleteEntity(sel)
  }, [])

  const canEdit = !!world && mode === 'edit'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#252530' }}>
      <div style={{ padding: 8, borderBottom: '1px solid #333', display: 'flex', gap: 4 }}>
        <button type="button" onClick={onCreate} disabled={!canEdit} title={canEdit ? 'Add entity' : 'Load a scene first'}>
          + Entity
        </button>
        <button type="button" onClick={onDelete} disabled={!canEdit || !selection}>
          Delete
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {!world ? (
          <div style={{ padding: 12, color: '#888', fontSize: 12 }}>Load a scene to edit hierarchy</div>
        ) : roots.length === 0 ? (
          <div style={{ padding: 12, color: '#888', fontSize: 12 }}>No entities — click + Entity</div>
        ) : (
          roots.map((id) => <EntityNode key={id.value} id={id} depth={0} />)
        )}
      </div>
    </div>
  )
})
