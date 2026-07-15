import { memo, useEffect, useState } from 'react'
import {
  DEFAULT_PHYSICS_MATERIAL_ID,
  MAX_PHYSICS_LAYERS,
  PhysicsMaterialSchema,
  PhysicsProjectSettingsSchema,
  defaultPhysicsProjectSettings,
  setLayerCollisionSymmetric,
  type PhysicsMaterial,
  type PhysicsProjectSettings,
} from '@haku/schema'

export const PhysicsProjectSettingsDialog = memo(function PhysicsProjectSettingsDialog({
  open,
  initialSettings,
  onApply,
  onClose,
}: {
  open: boolean
  initialSettings?: PhysicsProjectSettings
  onApply: (settings: PhysicsProjectSettings) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<PhysicsProjectSettings>(defaultPhysicsProjectSettings())
  const [selectedMaterialId, setSelectedMaterialId] = useState(DEFAULT_PHYSICS_MATERIAL_ID)
  const [newMaterialId, setNewMaterialId] = useState('')

  useEffect(() => {
    if (open) {
      const next = initialSettings ?? defaultPhysicsProjectSettings()
      setDraft(next)
      setSelectedMaterialId(
        next.materials[DEFAULT_PHYSICS_MATERIAL_ID]
          ? DEFAULT_PHYSICS_MATERIAL_ID
          : Object.keys(next.materials)[0] ?? DEFAULT_PHYSICS_MATERIAL_ID,
      )
      setNewMaterialId('')
    }
  }, [open, initialSettings])

  if (!open) {
    return null
  }

  const apply = () => {
    onApply(PhysicsProjectSettingsSchema.parse(draft))
    onClose()
  }

  const setLayerName = (index: number, name: string) => {
    const layers = [...draft.layers]
    layers[index] = name
    setDraft({ ...draft, layers })
  }

  const toggleCollision = (row: number, col: number) => {
    const current = draft.layerCollisionMatrix[row]?.[col] ?? false
    setDraft({
      ...draft,
      layerCollisionMatrix: setLayerCollisionSymmetric(
        draft.layerCollisionMatrix,
        row,
        col,
        !current,
      ),
    })
  }

  const materialIds = Object.keys(draft.materials)
  const selectedMaterial =
    draft.materials[selectedMaterialId] ?? draft.materials[DEFAULT_PHYSICS_MATERIAL_ID]

  const patchMaterial = (patch: Partial<PhysicsMaterial>) => {
    if (!selectedMaterial) return
    setDraft({
      ...draft,
      materials: {
        ...draft.materials,
        [selectedMaterialId]: PhysicsMaterialSchema.parse({ ...selectedMaterial, ...patch }),
      },
    })
  }

  const addMaterial = () => {
    const id = newMaterialId.trim()
    if (!id || draft.materials[id]) return
    setDraft({
      ...draft,
      materials: {
        ...draft.materials,
        [id]: PhysicsMaterialSchema.parse({}),
      },
    })
    setSelectedMaterialId(id)
    setNewMaterialId('')
  }

  const inputStyle = {
    padding: '4px 8px',
    background: '#111',
    border: '1px solid #444',
    color: '#eee',
    borderRadius: 4,
  } as const

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Physics project settings"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1e1e2e',
          border: '1px solid #444',
          borderRadius: 8,
          width: 560,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <header style={{ padding: '12px 16px', borderBottom: '1px solid #333' }}>
          <strong style={{ color: '#eee' }}>Physics Settings</strong>
        </header>

        <div style={{ padding: 16, overflow: 'auto', flex: 1, display: 'grid', gap: 16 }}>
          <section>
            <h4 style={{ color: '#ccc', margin: '0 0 8px', fontSize: 13 }}>Layer names</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {draft.layers.map((name, index) => (
                <label key={index} style={{ display: 'grid', gap: 4, color: '#aaa', fontSize: 12 }}>
                  <span>{index}</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setLayerName(index, event.target.value)}
                    style={{
                      padding: '4px 8px',
                      background: '#111',
                      border: '1px solid #444',
                      color: '#eee',
                      borderRadius: 4,
                    }}
                  />
                </label>
              ))}
            </div>
          </section>

          <section>
            <h4 style={{ color: '#ccc', margin: '0 0 8px', fontSize: 13 }}>
              Layer collision matrix (symmetric)
            </h4>
            <div style={{ overflow: 'auto', maxHeight: 360 }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 11, color: '#ccc' }}>
                <thead>
                  <tr>
                    <th style={{ padding: 4 }} />
                    {Array.from({ length: MAX_PHYSICS_LAYERS }, (_, col) => (
                      <th key={col} style={{ padding: 4, minWidth: 28, textAlign: 'center' }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: MAX_PHYSICS_LAYERS }, (_, row) => (
                    <tr key={row}>
                      <th style={{ padding: 4, textAlign: 'left', whiteSpace: 'nowrap' }}>
                        {row}: {draft.layers[row]}
                      </th>
                      {Array.from({ length: MAX_PHYSICS_LAYERS }, (_, col) => (
                        <td key={col} style={{ padding: 2, textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            aria-label={`Layer ${row} collides with layer ${col}`}
                            checked={draft.layerCollisionMatrix[row]?.[col] ?? false}
                            onChange={() => toggleCollision(row, col)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h4 style={{ color: '#ccc', margin: '0 0 8px', fontSize: 13 }}>Physics materials</h4>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4, color: '#aaa', fontSize: 12 }}>
                <span>Asset</span>
                <select
                  value={selectedMaterialId}
                  onChange={(event) => setSelectedMaterialId(event.target.value)}
                  style={inputStyle}
                >
                  {materialIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>

              {selectedMaterial && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  <label style={{ display: 'grid', gap: 4, color: '#aaa', fontSize: 12 }}>
                    <span>Friction</span>
                    <input
                      type="number"
                      min={0}
                      step={0.05}
                      value={selectedMaterial.friction}
                      onChange={(event) => patchMaterial({ friction: Number(event.target.value) })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, color: '#aaa', fontSize: 12 }}>
                    <span>Restitution</span>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={selectedMaterial.restitution}
                      onChange={(event) => patchMaterial({ restitution: Number(event.target.value) })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, color: '#aaa', fontSize: 12 }}>
                    <span>Density</span>
                    <input
                      type="number"
                      min={0.001}
                      step={0.1}
                      value={selectedMaterial.density}
                      onChange={(event) => patchMaterial({ density: Number(event.target.value) })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, color: '#aaa', fontSize: 12 }}>
                    <span>Friction combine</span>
                    <select
                      value={selectedMaterial.frictionCombine}
                      onChange={(event) =>
                        patchMaterial({
                          frictionCombine: event.target.value as PhysicsMaterial['frictionCombine'],
                        })
                      }
                      style={inputStyle}
                    >
                      <option value="average">average</option>
                      <option value="multiply">multiply</option>
                      <option value="min">min</option>
                      <option value="max">max</option>
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 4, color: '#aaa', fontSize: 12 }}>
                    <span>Restitution combine</span>
                    <select
                      value={selectedMaterial.restitutionCombine}
                      onChange={(event) =>
                        patchMaterial({
                          restitutionCombine: event.target.value as PhysicsMaterial['restitutionCombine'],
                        })
                      }
                      style={inputStyle}
                    >
                      <option value="average">average</option>
                      <option value="multiply">multiply</option>
                      <option value="min">min</option>
                      <option value="max">max</option>
                    </select>
                  </label>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
                <label style={{ display: 'grid', gap: 4, color: '#aaa', fontSize: 12, flex: 1 }}>
                  <span>New material id</span>
                  <input
                    type="text"
                    value={newMaterialId}
                    onChange={(event) => setNewMaterialId(event.target.value)}
                    style={inputStyle}
                  />
                </label>
                <button type="button" onClick={addMaterial} disabled={!newMaterialId.trim()}>
                  Add
                </button>
              </div>
            </div>
          </section>
        </div>

        <footer
          style={{
            padding: '12px 16px',
            borderTop: '1px solid #333',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={apply}>
            Apply
          </button>
        </footer>
      </div>
    </div>
  )
})
