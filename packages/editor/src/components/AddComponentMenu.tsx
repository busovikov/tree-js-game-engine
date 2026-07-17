import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import './add-component-menu.css'

export type AddComponentMenuItem = {
  id: string
  label: string
  disabled: boolean
}

function menuPosition(trigger: HTMLElement): CSSProperties {
  const rect = trigger.getBoundingClientRect()
  return {
    bottom: window.innerHeight - rect.top + 4,
    left: rect.left,
  }
}

export const AddComponentMenu = memo(function AddComponentMenu({
  items,
  onAdd,
  disabled,
}: {
  items: AddComponentMenuItem[]
  onAdd: (id: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
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
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }

    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const toggleOpen = useCallback(() => {
    setOpen((value) => {
      const next = !value
      if (next && triggerRef.current) {
        setDropdownStyle(menuPosition(triggerRef.current))
      }
      return next
    })
  }, [])

  const run = useCallback(
    (id: string) => {
      setOpen(false)
      onAdd(id)
    },
    [onAdd],
  )

  return (
    <div className="haku-add-component-menu">
      <button
        ref={triggerRef}
        type="button"
        className={`haku-add-component-menu__trigger${open ? ' haku-add-component-menu__trigger--open' : ''}`}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add Component"
        title="Add Component"
        data-testid="add-component-menu"
        onClick={toggleOpen}
      >
        <span className="haku-add-component-menu__plus" aria-hidden="true">
          +
        </span>
        <span className="haku-add-component-menu__label">Add Component</span>
        <span className="haku-add-component-menu__chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="haku-add-component-menu__dropdown"
            style={dropdownStyle}
            role="menu"
          >
            {items.map(({ id, label, disabled: itemDisabled }) => (
              <button
                key={id}
                type="button"
                role="menuitem"
                disabled={itemDisabled}
                data-testid={`add-component-${id.toLowerCase()}`}
                className={`haku-add-component-menu__item${itemDisabled ? ' haku-add-component-menu__item--present' : ''}`}
                onClick={() => run(id)}
              >
                {label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
})
