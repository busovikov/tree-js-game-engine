import { memo } from 'react'
import { coreComponentSchemas } from '@haku/schema'
import { NumberField } from './NumberField.js'
import './mesh-renderer-fields.css'

function StringField({
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  hint?: string
}) {
  return (
    <label className="mesh-field">
      <span className="mesh-field__label" title={hint}>
        {label}
      </span>
      <input
        type="text"
        className="mesh-field__input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

export const SchemaFields = memo(function SchemaFields({
  componentId,
  data,
  onChange,
  disabled,
}: {
  componentId: keyof typeof coreComponentSchemas
  data: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  disabled?: boolean
}) {
  const schema = coreComponentSchemas[componentId]
  const shape = (schema as { shape: Record<string, { _def?: { typeName?: string; values?: string[] } }> }).shape

  return (
    <div>
      {Object.entries(shape).map(([key, fieldSchema]) => {
        const value = data[key]

        if (fieldSchema._def?.typeName === 'ZodTuple' && Array.isArray(value)) {
          return (
            <div key={key} style={{ marginBottom: 8 }}>
              <div style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }} title={`${key} vector components.`}>
                {key}
              </div>
              {value.map((n, i) => (
                <NumberField
                  key={`${key}-${i}`}
                  label={`${key}[${i}]`}
                  value={Number(n)}
                  disabled={disabled}
                  hint={`${key} component ${i}.`}
                  onChange={(num) => {
                    const next = [...(value as number[])] as number[]
                    next[i] = num
                    onChange({ ...data, [key]: next })
                  }}
                />
              ))}
            </div>
          )
        }

        if (fieldSchema._def?.typeName === 'ZodNumber' && typeof value === 'number') {
          return (
            <NumberField
              key={key}
              label={key}
              value={value}
              disabled={disabled}
              hint={`${key} property.`}
              onChange={(num) => onChange({ ...data, [key]: num })}
            />
          )
        }

        if (fieldSchema._def?.typeName === 'ZodString' && typeof value === 'string') {
          return (
            <StringField
              key={key}
              label={key}
              value={value}
              disabled={disabled}
              hint={`${key} property.`}
              onChange={(str) => onChange({ ...data, [key]: str })}
            />
          )
        }

        if (fieldSchema._def?.typeName === 'ZodEnum' && typeof value === 'string') {
          const options = fieldSchema._def.values ?? []
          return (
            <label key={key} className="mesh-field">
              <span className="mesh-field__label" title={`${key} enum value.`}>
                {key}
              </span>
              <select
                className="mesh-field__input"
                value={value}
                disabled={disabled}
                onChange={(e) => onChange({ ...data, [key]: e.target.value })}
              >
                {options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          )
        }

        return null
      })}
    </div>
  )
})
