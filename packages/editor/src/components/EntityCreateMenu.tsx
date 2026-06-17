import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { MESH_GEOMETRY_TYPE_LABELS, MESH_PRIMITIVE_GEOMETRY_TYPES } from '@haku/schema'
import {
  createEmptyEntity,
  createMeshPrimitive,
  createModelEntity,
} from '../commands/world-commands.js'
import { projectService } from '../services/project-service.js'
import { ModelPickerDialog } from './ModelPickerDialog.js'
import './entity-create-menu.css'

const MESH_PRIMITIVES = MESH_PRIMITIVE_GEOMETRY_TYPES.map((geometryType) => ({
  geometryType,
  label: MESH_GEOMETRY_TYPE_LABELS[geometryType],
}))

function menuPosition(trigger: HTMLElement): CSSProperties {
  const rect = trigger.getBoundingClientRect()
  return {
    top: rect.bottom + 4,
    left: rect.left,
  }
}

export const EntityCreateMenu = memo(function EntityCreateMenu({
  disabled,
  hasSelection,
}: {
  disabled?: boolean
  hasSelection: boolean
}) {
  const [open, setOpen] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [modelAssets, setModelAssets] = useState<string[]>([])
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    setDropdownStyle(menuPosition(triggerRef.current))
  }, [])

  useEffect(() => {
    if (!open) return

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!modelPickerOpen) return
    void projectService.listModelAssets().then(setModelAssets)
  }, [modelPickerOpen])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }

    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [])

  const run = useCallback((action: () => void) => {
    setOpen(false)
    action()
  }, [])

  const openModelPicker = useCallback(() => {
    setOpen(false)
    setModelPickerOpen(true)
  }, [])

  const toggleOpen = useCallback(() => {
    setOpen((value) => {
      const next = !value
      if (next && triggerRef.current) {
        setDropdownStyle(menuPosition(triggerRef.current))
      }
      return next
    })
  }, [])

  return (
    <div className="haku-entity-menu">
      <button
        ref={triggerRef}
        type="button"
        className={`haku-entity-menu__trigger${open ? ' haku-entity-menu__trigger--open' : ''}`}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add entity"
        title="Add entity"
        onClick={toggleOpen}
      >
        <span className="haku-entity-menu__plus" aria-hidden="true">
          +
        </span>
        <span className="haku-entity-menu__chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="haku-entity-menu__dropdown"
            style={dropdownStyle}
            role="menu"
          >
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
                <div className="haku-entity-menu__separator" role="separator" />
                <button
                  type="button"
                  className="haku-entity-menu__item"
                  role="menuitem"
                  onClick={openModelPicker}
                >
                  Model…
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <ModelPickerDialog
        open={modelPickerOpen}
        assets={modelAssets}
        selected=""
        onSelect={(modelAsset) => createModelEntity(modelAsset)}
        onClose={() => setModelPickerOpen(false)}
      />
    </div>
  )
})
