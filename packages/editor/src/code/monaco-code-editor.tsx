import type { ChangeEvent } from 'react'
import type { CodeEditorProviderProps } from './code-editor-types.js'

export default function MonacoCodeEditor({
  path,
  value,
  readOnly = false,
  onChange,
}: CodeEditorProviderProps) {
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value)
  }

  return (
    <textarea
      aria-label={`Code editor: ${path}`}
      readOnly={readOnly}
      spellCheck={false}
      value={value}
      onChange={handleChange}
    />
  )
}
