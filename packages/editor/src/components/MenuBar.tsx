import { memo, useCallback, useEffect, useRef, useState } from 'react'
import './menu-bar.css'

export interface MenuItem {
  id: string
  label: string
  shortcut?: string
  disabled?: boolean
  onClick: () => void | Promise<void>
}

export interface MenuDefinition {
  id: string
  label: string
  items: MenuItem[]
}

export const MenuBar = memo(function MenuBar({
  menus,
}: {
  menus: MenuDefinition[]
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!barRef.current?.contains(event.target as Node)) {
        setOpenMenuId(null)
      }
    }

    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [])

  const runItem = useCallback((item: MenuItem) => {
    setOpenMenuId(null)
    void item.onClick()
  }, [])

  return (
    <div ref={barRef} className="menu-bar">
      {menus.map((menu) => {
        const open = openMenuId === menu.id
        return (
          <div key={menu.id} className="menu-bar__menu">
            <button
              type="button"
              className={`menu-bar__trigger${open ? ' menu-bar__trigger--open' : ''}`}
              onClick={() => setOpenMenuId(open ? null : menu.id)}
            >
              {menu.label}
            </button>
            {open && (
              <div className="menu-bar__dropdown" role="menu">
                {menu.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="menu-bar__item"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => void runItem(item)}
                  >
                    <span>{item.label}</span>
                    {item.shortcut ? <span className="menu-bar__shortcut">{item.shortcut}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
})
