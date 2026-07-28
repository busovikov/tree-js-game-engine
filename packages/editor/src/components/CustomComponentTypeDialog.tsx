import { memo, useEffect, useMemo, useState } from 'react'
import { NumberField } from './NumberField.js'
import { useModalFocus } from './modal-focus.js'

export type VisualComponentFieldDraft =
  | { readonly name: string; readonly type: 'number'; readonly default: number }
  | { readonly name: string; readonly type: 'string'; readonly default: string }
  | {
      readonly name: string
      readonly type: 'boolean'
      readonly default: boolean
    }

export interface VisualComponentTypeDraft {
  readonly name: string
  readonly fields: readonly VisualComponentFieldDraft[]
}

function emptyNumberField(): VisualComponentFieldDraft {
  return { name: '', type: 'number', default: 0 }
}

function validateDraft(
  name: string,
  fields: readonly VisualComponentFieldDraft[],
): string | null {
  if (!name.trim()) return 'Component name is required.'
  if (fields.length === 0) return 'Add at least one field.'
  const names = new Set<string>()
  for (const field of fields) {
    const fieldName = field.name.trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(fieldName)) {
      return 'Field names must be valid TypeScript identifiers.'
    }
    if (names.has(fieldName)) return `Duplicate field: ${fieldName}`
    names.add(fieldName)
  }
  return null
}

export const CustomComponentTypeDialog = memo(
  function CustomComponentTypeDialog({
    open,
    onCreate,
    onClose,
  }: {
    open: boolean
    onCreate: (draft: VisualComponentTypeDraft) => void | Promise<void>
    onClose: () => void
  }) {
    const [name, setName] = useState('')
    const [fields, setFields] = useState<VisualComponentFieldDraft[]>([
      emptyNumberField(),
    ])
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const { dialogRef, onDialogKeyDown } = useModalFocus(open, onClose)

    useEffect(() => {
      if (!open) return
      setName('')
      setFields([emptyNumberField()])
      setError(null)
      setSaving(false)
    }, [open])

    const validation = useMemo(
      () => validateDraft(name, fields),
      [fields, name],
    )

    if (!open) return null

    const updateField = (
      index: number,
      next: VisualComponentFieldDraft,
    ): void => {
      setFields((current) =>
        current.map((field, fieldIndex) =>
          fieldIndex === index ? next : field,
        ),
      )
      setError(null)
    }

    const create = async (): Promise<void> => {
      if (validation) {
        setError(validation)
        return
      }
      setSaving(true)
      setError(null)
      try {
        await onCreate({
          name: name.trim(),
          fields: fields.map((field) => ({
            ...field,
            name: field.name.trim(),
          })),
        })
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
        setSaving(false)
      }
    }

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1100,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={onClose}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="haku-component-type-title"
          tabIndex={-1}
          onKeyDown={onDialogKeyDown}
          onClick={(event) => event.stopPropagation()}
          style={{
            width: 440,
            maxHeight: '80vh',
            overflow: 'auto',
            padding: 16,
            border: '1px solid #444',
            borderRadius: 8,
            background: '#1e1e2e',
            color: '#eee',
          }}
        >
          <h2 id="haku-component-type-title" style={{ marginTop: 0 }}>
            New Component Type
          </h2>
          <label className="mesh-field">
            <span className="mesh-field__label">Component name</span>
            <input
              aria-label="Component name"
              className="mesh-field__input"
              value={name}
              disabled={saving}
              onChange={(event) => {
                setName(event.target.value)
                setError(null)
              }}
            />
          </label>
          {fields.map((field, index) => (
            <fieldset
              key={index}
              style={{
                margin: '12px 0',
                padding: 10,
                border: '1px solid #444',
              }}
            >
              <legend>Field {index + 1}</legend>
              <label className="mesh-field">
                <span className="mesh-field__label">Field name</span>
                <input
                  aria-label="Field name"
                  className="mesh-field__input"
                  value={field.name}
                  disabled={saving}
                  onChange={(event) =>
                    updateField(index, {
                      ...field,
                      name: event.target.value,
                    })
                  }
                />
              </label>
              <label className="mesh-field">
                <span className="mesh-field__label">Field type</span>
                <select
                  aria-label="Field type"
                  className="mesh-field__input"
                  value={field.type}
                  disabled={saving}
                  onChange={(event) => {
                    const type = event.target.value
                    updateField(
                      index,
                      type === 'string'
                        ? { name: field.name, type, default: '' }
                        : type === 'boolean'
                          ? { name: field.name, type, default: false }
                          : {
                              name: field.name,
                              type: 'number',
                              default: 0,
                            },
                    )
                  }}
                >
                  <option value="number">Number</option>
                  <option value="string">String</option>
                  <option value="boolean">Boolean</option>
                </select>
              </label>
              {field.type === 'number' ? (
                <NumberField
                  label="Default value"
                  value={field.default}
                  disabled={saving}
                  onChange={(value) =>
                    updateField(index, { ...field, default: value })
                  }
                />
              ) : field.type === 'string' ? (
                <label className="mesh-field">
                  <span className="mesh-field__label">Default value</span>
                  <input
                    aria-label="Default value"
                    className="mesh-field__input"
                    value={field.default}
                    disabled={saving}
                    onChange={(event) =>
                      updateField(index, {
                        ...field,
                        default: event.target.value,
                      })
                    }
                  />
                </label>
              ) : (
                <label className="mesh-field">
                  <span className="mesh-field__label">Default value</span>
                  <input
                    aria-label="Default value"
                    type="checkbox"
                    checked={field.default}
                    disabled={saving}
                    onChange={(event) =>
                      updateField(index, {
                        ...field,
                        default: event.target.checked,
                      })
                    }
                  />
                </label>
              )}
              <button
                type="button"
                disabled={saving || fields.length === 1}
                onClick={() =>
                  setFields((current) =>
                    current.filter((_, fieldIndex) => fieldIndex !== index),
                  )
                }
              >
                Remove Field
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              setFields((current) => [...current, emptyNumberField()])
            }
          >
            Add Field
          </button>
          {error && <p role="alert">{error}</p>}
          <footer
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 16,
            }}
          >
            <button type="button" disabled={saving} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void create()}
            >
              Create Component Type
            </button>
          </footer>
        </div>
      </div>
    )
  },
)
