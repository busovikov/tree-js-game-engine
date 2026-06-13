import { memo } from 'react'
import { coreComponentSchemas } from '@haku/schema'

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
      <span style={{ width: 72, color: '#aaa', fontSize: 12 }}>{label}</span>
      <input
        type="number"
        value={value}
        step={0.1}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, background: '#1a1a2e', color: '#eee', border: '1px solid #444', padding: 4 }}
      />
    </label>
  )
}

function StringField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
      <span style={{ width: 72, color: '#aaa', fontSize: 12 }}>{label}</span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ flex: 1, background: '#1a1a2e', color: '#eee', border: '1px solid #444', padding: 4 }}
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
              <div style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }}>{key}</div>
              {value.map((n, i) => (
                <NumberField
                  key={`${key}-${i}`}
                  label={`${key}[${i}]`}
                  value={Number(n)}
                  disabled={disabled}
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
              onChange={(str) => onChange({ ...data, [key]: str })}
            />
          )
        }

        if (fieldSchema._def?.typeName === 'ZodEnum' && typeof value === 'string') {
          const options = fieldSchema._def.values ?? []
          return (
            <label key={key} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <span style={{ width: 72, color: '#aaa', fontSize: 12 }}>{key}</span>
              <select
                value={value}
                disabled={disabled}
                onChange={(e) => onChange({ ...data, [key]: e.target.value })}
                style={{ flex: 1, background: '#1a1a2e', color: '#eee', border: '1px solid #444', padding: 4 }}
              >
                {options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
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
