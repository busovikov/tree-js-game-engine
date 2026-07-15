import { memo, useState } from 'react'
import type { ColliderBakeMode } from '../viewport/collider-mesh-bake.js'

const backdropStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
} as const

const panelStyle = {
  background: '#1e1e2e',
  border: '1px solid #444',
  borderRadius: 8,
  width: 480,
  maxHeight: '85vh',
  padding: 16,
  color: '#eee',
} as const

export const ColliderBakeDialog = memo(function ColliderBakeDialog({
  open,
  rigidBodyType,
  onConfirm,
  onClose,
}: {
  open: boolean
  rigidBodyType?: 'static' | 'dynamic' | 'kinematic'
  onConfirm: (mode: ColliderBakeMode) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<ColliderBakeMode>('convexHull')

  if (!open) {
    return null
  }

  const trimeshBlocked = rigidBodyType === 'dynamic' || rigidBodyType === 'kinematic'

  return (
    <div role="dialog" aria-modal aria-labelledby="collider-bake-title" style={backdropStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(event) => event.stopPropagation()}>
        <h2 id="collider-bake-title" style={{ margin: '0 0 8px', fontSize: 16 }}>
          Bake collider from mesh
        </h2>
        <p style={{ color: '#aaa', fontSize: 12, marginBottom: 12 }}>
          The render mesh is only a visual — physics uses a separate collider shape baked from
          viewport geometry.
        </p>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
          <input
            type="radio"
            name="collider-bake-mode"
            checked={mode === 'convexHull'}
            onChange={() => setMode('convexHull')}
          />
          <span>Convex hull (dynamic OK)</span>
        </label>
        <p style={{ color: '#aaa', fontSize: 12, margin: '0 0 12px 24px' }}>
          Faster wrap-around shape. Concave gaps are filled — rays can pass through indentations
          that exist in the render mesh.
        </p>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
          <input
            type="radio"
            name="collider-bake-mode"
            checked={mode === 'trimesh'}
            disabled={trimeshBlocked}
            onChange={() => setMode('trimesh')}
          />
          <span>Trimesh (static only)</span>
        </label>
        <p style={{ color: '#aaa', fontSize: 12, margin: '0 0 12px 24px' }}>
          Matches render triangles closely. Use for static level collision; not allowed on dynamic
          bodies.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={trimeshBlocked && mode === 'trimesh'}
            onClick={() => onConfirm(mode)}
          >
            Bake
          </button>
        </div>
      </div>
    </div>
  )
})
