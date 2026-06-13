import { memo, useCallback } from 'react'
import type { EntityId } from '@haku/core'
import { useEditorStore } from '../store/editor-store.js'
import { CreateEntityCommand, DeleteEntityCommand, executeCommand } from '../commands/world-commands.js'

function EntityNode({ id, depth }: { id: EntityId; depth: number }) {
  const name = useEditorStore((s) => s.world?.getEntityName(id) ?? 'Entity')
  const selected = useEditorStore((s) => s.selection?.value === id.value)
  const children = useEditorStore((s) => s.world?.getChildren(id) ?? [])
  const setSelection = useEditorStore((s) => s.setSelection)

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
  const roots = world
    ? world.getAllEntities().filter((id) => world.getParent(id) === null)
    : []

  const onCreate = useCallback(() => executeCommand(new CreateEntityCommand('New Entity')), [])
  const onDelete = useCallback(() => {
    const sel = useEditorStore.getState().selection
    if (sel) executeCommand(new DeleteEntityCommand(sel))
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#252530' }}>
      <div style={{ padding: 8, borderBottom: '1px solid #333', display: 'flex', gap: 4 }}>
        <button type="button" onClick={onCreate}>+ Entity</button>
        <button type="button" onClick={onDelete}>Delete</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {roots.map((id) => (
          <EntityNode key={id.value} id={id} depth={0} />
        ))}
      </div>
    </div>
  )
})
