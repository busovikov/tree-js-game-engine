import { memo, useCallback, useState } from 'react'
import {
  CameraComponent,
  LightComponent,
  MeshRendererComponent,
  ScriptRefComponent,
  TransformComponent,
  getCoreComponent,
} from '@haku/core'
import { useEditorStore } from '../store/editor-store.js'
import { SetTransformCommand, executeCommand } from '../commands/world-commands.js'
import { SchemaFields } from '../components/SchemaFields.js'
import { TransformFields } from '../components/TransformFields.js'
import { assignPrototype, assignMeshPrototype } from '../services/project-service.js'
import type { Transform } from '@haku/schema'

const COMPONENT_MAP = {
  Transform: TransformComponent,
  Camera: CameraComponent,
  Light: LightComponent,
  MeshRenderer: MeshRendererComponent,
  ScriptRef: ScriptRefComponent,
} as const

export const InspectorPanel = memo(function InspectorPanel() {
  const selection = useEditorStore((s) => s.selection)
  const world = useEditorStore((s) => s.world)
  const worldRevision = useEditorStore((s) => s.worldRevision)
  const sceneDocument = useEditorStore((s) => s.sceneDocument)
  const scenePath = useEditorStore((s) => s.scenePath)
  const mode = useEditorStore((s) => s.mode)

  void worldRevision

  const updateComponent = useCallback(
    (componentId: keyof typeof COMPONENT_MAP, before: Record<string, unknown>, after: Record<string, unknown>) => {
      if (!selection || !world || mode === 'play') return
      const type = COMPONENT_MAP[componentId]
      if (componentId === 'Transform') {
        executeCommand(
          new SetTransformCommand(
            selection,
            before as ReturnType<typeof TransformComponent.schema.parse>,
            after as ReturnType<typeof TransformComponent.schema.parse>,
          ),
        )
        return
      }
      world.addComponent(selection, type, after)
      useEditorStore.getState().setWorld(world)
    },
    [selection, world, mode],
  )

  if (!selection || !world) {
    return (
      <div style={{ padding: 12, color: '#888', background: '#252530', height: '100%' }}>
        Select an entity
      </div>
    )
  }

  return (
    <div style={{ padding: 12, background: '#252530', height: '100%', overflow: 'auto', color: '#eee' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>{world.getEntityName(selection)}</h3>

      {world.getComponentTypes(selection).map((typeId) => {
        const key = typeId as keyof typeof COMPONENT_MAP
        if (!(key in COMPONENT_MAP)) return null
        const type = getCoreComponent(typeId)
        const data = type ? world.getComponent(selection, type) : undefined
        if (!data || typeof data !== 'object') return null

        return (
          <section key={typeId} style={{ marginBottom: 16 }}>
            <h4 style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>{typeId}</h4>
            {key === 'Transform' ? (
              <TransformFields
                value={data as Transform}
                disabled={mode === 'play'}
                onChange={(next) =>
                  updateComponent('Transform', data as Record<string, unknown>, next as Record<string, unknown>)
                }
              />
            ) : (
              <SchemaFields
                componentId={key}
                data={data as Record<string, unknown>}
                disabled={mode === 'play'}
                onChange={(next) => updateComponent(key, data as Record<string, unknown>, next)}
              />
            )}
          </section>
        )
      })}

      {sceneDocument && (
        <section>
          <h4 style={{ fontSize: 12, color: '#aaa' }}>Assign Prototype</h4>
          <PrototypeAssigner
            disabled={mode === 'play'}
            prototypes={Object.keys(sceneDocument.prototypes)}
            onAssign={(prototypeId, assetPath) => {
              if (!scenePath) return
              const next = assignPrototype(sceneDocument, prototypeId, assetPath)
              assignMeshPrototype(world, selection, prototypeId)
              useEditorStore.getState().setScene(scenePath, next, world)
            }}
          />
        </section>
      )}
    </div>
  )
})

function PrototypeAssigner({
  prototypes,
  onAssign,
  disabled,
}: {
  prototypes: string[]
  onAssign: (prototypeId: string, assetPath: string) => void
  disabled?: boolean
}) {
  const [prototypeId, setPrototypeId] = useState(prototypes[0] ?? 'mesh')
  const [assetPath, setAssetPath] = useState('assets/models/model.glb')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <input
        value={prototypeId}
        disabled={disabled}
        onChange={(e) => setPrototypeId(e.target.value)}
        placeholder="prototype id"
        style={{ background: '#1a1a2e', color: '#eee', border: '1px solid #444', padding: 4 }}
      />
      <input
        value={assetPath}
        disabled={disabled}
        onChange={(e) => setAssetPath(e.target.value)}
        placeholder="asset path"
        style={{ background: '#1a1a2e', color: '#eee', border: '1px solid #444', padding: 4 }}
      />
      <button type="button" disabled={disabled} onClick={() => onAssign(prototypeId, assetPath)}>
        Assign to entity
      </button>
      {prototypes.length > 0 && (
        <div style={{ fontSize: 11, color: '#666' }}>Existing: {prototypes.join(', ')}</div>
      )}
    </div>
  )
}

export { getCoreComponent }
