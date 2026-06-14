import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  HIERARCHY_FILTER_MODE_LABELS,
  type HierarchyFilterMode,
} from '../hierarchy/entity-filter.js'
import { useEditorStore } from '../store/editor-store.js'
import './hierarchy-filter.css'

const FILTER_MODES: HierarchyFilterMode[] = ['all', 'name', 'type', 'tag']

export const HierarchyFilterBar = memo(function HierarchyFilterBar() {
  const query = useEditorStore((s) => s.hierarchyFilterQuery)
  const mode = useEditorStore((s) => s.hierarchyFilterMode)
  const setQuery = useEditorStore((s) => s.setHierarchyFilterQuery)
  const setMode = useEditorStore((s) => s.setHierarchyFilterMode)

  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [])

  const selectMode = useCallback(
    (next: HierarchyFilterMode) => {
      setMode(next)
      setMenuOpen(false)
    },
    [setMode],
  )

  return (
    <div ref={rootRef} className="haku-hierarchy-filter">
      <button
        type="button"
        className="haku-hierarchy-filter__mode"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {HIERARCHY_FILTER_MODE_LABELS[mode]}
        <span className="haku-hierarchy-filter__caret" aria-hidden="true">
          ▾
        </span>
      </button>
      <input
        type="search"
        className="haku-hierarchy-filter__input"
        placeholder="Filter hierarchy…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {menuOpen && (
        <div className="haku-hierarchy-filter__menu" role="menu">
          {FILTER_MODES.map((item) => (
            <button
              key={item}
              type="button"
              role="menuitemradio"
              aria-checked={mode === item}
              className={`haku-hierarchy-filter__menu-item${mode === item ? ' haku-hierarchy-filter__menu-item--active' : ''}`}
              onClick={() => selectMode(item)}
            >
              {HIERARCHY_FILTER_MODE_LABELS[item]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
