import { memo, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  filterModelAssets,
  groupModelAssetsByFolder,
  modelAssetFileName,
} from './model-picker-utils.js'
import './model-picker-dialog.css'

export const ModelPickerDialog = memo(function ModelPickerDialog({
  open,
  assets,
  selected,
  onSelect,
  onClose,
}: {
  open: boolean
  assets: readonly string[]
  selected: string
  onSelect: (assetPath: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    setQuery('')
  }, [open])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const filteredGroups = useMemo(() => {
    const filtered = filterModelAssets(assets, query)
    return groupModelAssetsByFolder(filtered)
  }, [assets, query])

  if (!open) return null

  return createPortal(
    <div className="haku-model-picker__backdrop" onClick={onClose}>
      <div
        className="haku-model-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Select model"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="haku-model-picker__header">
          <h3 className="haku-model-picker__title">Select Model</h3>
          <button type="button" className="haku-model-picker__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <input
          type="search"
          className="haku-model-picker__filter"
          placeholder="Filter models…"
          value={query}
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="haku-model-picker__body">
          {filteredGroups.length === 0 ? (
            <div className="haku-model-picker__empty">No models match filter</div>
          ) : (
            filteredGroups.map((group) => (
              <section key={group.folder} className="haku-model-picker__group">
                <h4 className="haku-model-picker__group-title">{group.folder}</h4>
                <div className="haku-model-picker__items">
                  {group.files.map((assetPath) => {
                    const isSelected = assetPath === selected
                    return (
                      <button
                        key={assetPath}
                        type="button"
                        className={`haku-model-picker__item${isSelected ? ' haku-model-picker__item--selected' : ''}`}
                        title={assetPath}
                        onClick={() => {
                          onSelect(assetPath)
                          onClose()
                        }}
                      >
                        <span className="haku-model-picker__item-name">{modelAssetFileName(assetPath)}</span>
                        <span className="haku-model-picker__item-path">{assetPath}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
})
