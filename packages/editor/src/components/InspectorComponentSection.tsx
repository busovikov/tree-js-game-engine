import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './inspector-component-section.css'

type ContextMenuState = {
  x: number
  y: number
}

export const InspectorComponentSection = memo(function InspectorComponentSection({
  title,
  badge,
  collapsed,
  enabled,
  canToggleEnabled = true,
  canCopyPaste = true,
  canDelete = true,
  canPaste,
  disabled,
  onToggleCollapsed,
  onToggleEnabled,
  onCopy,
  onPaste,
  onDelete,
  children,
}: {
  title: string
  badge?: ReactNode
  collapsed: boolean
  enabled?: boolean
  canToggleEnabled?: boolean
  canCopyPaste?: boolean
  canDelete?: boolean
  canPaste?: boolean
  disabled?: boolean
  onToggleCollapsed: () => void
  onToggleEnabled?: () => void
  onCopy?: () => void
  onPaste?: () => void
  onDelete?: () => void
  children: ReactNode
}) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const closeMenu = useCallback(() => setMenu(null), [])

  useEffect(() => {
    if (!menu) return

    const onPointerDown = (event: globalThis.MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      closeMenu()
    }

    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [closeMenu, menu])

  const openMenu = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (disabled) return
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY })
  }, [disabled])

  const menuStyle: CSSProperties = menu
    ? { top: menu.y, left: menu.x }
    : { top: 0, left: 0 }

  const run = useCallback(
    (action?: () => void) => {
      closeMenu()
      action?.()
    },
    [closeMenu],
  )

  const sectionClass = [
    'haku-inspector__section',
    collapsed ? 'haku-inspector__section--collapsed' : '',
    enabled === false ? 'haku-inspector__section--disabled' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={sectionClass}>
      <div
        className="haku-inspector__section-header"
        onContextMenu={canCopyPaste || canDelete ? openMenu : undefined}
      >
        <button
          type="button"
          className="haku-inspector__section-collapse"
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand component' : 'Collapse component'}
          onClick={onToggleCollapsed}
        >
          <span className="haku-inspector__section-chevron" aria-hidden="true">
            {collapsed ? '▸' : '▾'}
          </span>
        </button>

        <button
          type="button"
          className="haku-inspector__section-title-btn"
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
        >
          <h4 className="haku-inspector__section-title">
            {title}
            {badge}
          </h4>
        </button>

        <div className="haku-inspector__section-actions">
          {canToggleEnabled && onToggleEnabled && (
            <button
              type="button"
              className={`haku-inspector__section-enable${enabled ? ' haku-inspector__section-enable--on' : ''}`}
              disabled={disabled}
              title={enabled ? 'Disable component' : 'Enable component'}
              aria-pressed={enabled ?? true}
              onClick={onToggleEnabled}
            >
              <span className="haku-inspector__section-enable-dot" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {!collapsed && children}

      {menu &&
        createPortal(
          <div
            ref={menuRef}
            className="haku-inspector__component-menu"
            style={menuStyle}
            role="menu"
          >
            {canCopyPaste && (
              <button
                type="button"
                className="haku-inspector__component-menu-item"
                role="menuitem"
                onClick={() => run(onCopy)}
              >
                Copy Component
              </button>
            )}
            {canCopyPaste && (
              <button
                type="button"
                className="haku-inspector__component-menu-item"
                role="menuitem"
                disabled={!canPaste}
                onClick={() => run(onPaste)}
              >
                Paste Component
              </button>
            )}
            {canCopyPaste && canDelete && <div className="haku-inspector__component-menu-sep" role="separator" />}
            {canDelete && (
              <button
                type="button"
                className="haku-inspector__component-menu-item haku-inspector__component-menu-item--danger"
                role="menuitem"
                disabled={disabled}
                onClick={() => run(onDelete)}
              >
                Delete Component
              </button>
            )}
          </div>,
          document.body,
        )}
    </section>
  )
})
