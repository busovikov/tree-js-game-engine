import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { MESH_GEOMETRY_TYPES } from '@haku/schema'
import {
  MESH_PRIMITIVE_LABELS,
  createEmptyEntity,
  createMeshPrimitive,
} from '../commands/world-commands.js'
import './entity-create-menu.css'

const MESH_PRIMITIVES = MESH_GEOMETRY_TYPES.map((geometryType) => ({
  geometryType,
  label: MESH_PRIMITIVE_LABELS[geometryType],
}))

export const EntityCreateMenu = memo(function EntityCreateMenu({
  disabled,
  hasSelection,
}: {
  disabled?: boolean
  hasSelection: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [])

  const run = useCallback((action: () => void) => {
    setOpen(false)
    action()
  }, [])

  return (
    <div ref={rootRef} className="haku-entity-menu">
      <button
        type="button"
        className={`haku-entity-menu__trigger${open ? ' haku-entity-menu__trigger--open' : ''}`}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        + Entity
      </button>

      {open && (
        <div className="haku-entity-menu__dropdown" role="menu">
          <button
            type="button"
            className="haku-entity-menu__item"
            role="menuitem"
            onClick={() => run(() => createEmptyEntity('root'))}
          >
            Empty Entity
          </button>
          <button
            type="button"
            className="haku-entity-menu__item"
            role="menuitem"
            disabled={!hasSelection}
            onClick={() => run(() => createEmptyEntity('child'))}
          >
            Empty Child
          </button>
          <button
            type="button"
            className="haku-entity-menu__item"
            role="menuitem"
            disabled={!hasSelection}
            onClick={() => run(() => createEmptyEntity('parent'))}
          >
            Empty Parent
          </button>

          <div className="haku-entity-menu__separator" role="separator" />

          <div className="haku-entity-menu__submenu">
            <button
              type="button"
              className="haku-entity-menu__item haku-entity-menu__item--submenu"
              aria-haspopup="menu"
            >
              <span>3D Object</span>
              <span className="haku-entity-menu__arrow" aria-hidden="true">
                ›
              </span>
            </button>
            <div className="haku-entity-menu__flyout" role="menu">
              {MESH_PRIMITIVES.map(({ geometryType, label }) => (
                <button
                  key={geometryType}
                  type="button"
                  className="haku-entity-menu__item"
                  role="menuitem"
                  onClick={() => run(() => createMeshPrimitive(geometryType))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
