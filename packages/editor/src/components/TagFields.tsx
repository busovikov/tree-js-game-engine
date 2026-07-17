import { memo, useCallback, useRef, useState, type KeyboardEvent } from 'react'
import './tag-fields.css'

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of tags) {
    const tag = raw.trim()
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
  }
  return result
}

function splitDraftOnSpaces(
  value: string,
  currentTags: readonly string[],
): { tags: string[]; draft: string } {
  if (!/\s/.test(value)) {
    return { tags: [...currentTags], draft: value }
  }

  const endsWithSpace = /\s$/.test(value)
  const tokens = value.split(/\s+/).filter(Boolean)

  if (endsWithSpace) {
    return {
      tags: normalizeTags([...currentTags, ...tokens]),
      draft: '',
    }
  }

  const draft = tokens[tokens.length - 1] ?? ''
  const additions = tokens.slice(0, -1)
  return {
    tags: normalizeTags([...currentTags, ...additions]),
    draft,
  }
}

export const TagFields = memo(function TagFields({
  tags,
  onChange,
  disabled,
}: {
  tags: readonly string[]
  onChange: (tags: string[]) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const commitDraft = useCallback(() => {
    const trimmed = draft.trim()
    if (!trimmed) {
      setDraft('')
      return
    }
    const next = normalizeTags([...tags, trimmed])
    if (next.length !== tags.length) {
      onChange(next)
    }
    setDraft('')
  }, [draft, onChange, tags])

  const handleDraftChange = useCallback(
    (value: string) => {
      const { tags: nextTags, draft: nextDraft } = splitDraftOnSpaces(value, tags)
      if (nextTags.length !== tags.length) {
        onChange(nextTags)
      }
      setDraft(nextDraft)
    },
    [onChange, tags],
  )

  const removeTag = useCallback(
    (index: number) => {
      onChange(tags.filter((_, i) => i !== index))
      inputRef.current?.focus()
    },
    [onChange, tags],
  )

  const onDraftKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
        event.preventDefault()
        onChange(tags.slice(0, -1))
      }
    },
    [draft, onChange, tags],
  )

  const focusInput = useCallback(() => {
    if (!disabled) {
      inputRef.current?.focus()
    }
  }, [disabled])

  return (
    <div className="haku-tag-fields">
      <div
        className={`haku-tag-fields__editor${disabled ? ' haku-tag-fields__editor--disabled' : ''}`}
        title="Entity tags for grouping and script lookups. Space or blur commits a tag; Backspace removes the last one."
        onClick={focusInput}
      >
        {tags.map((tag, index) => (
          <span key={`${tag}-${index}`} className="haku-tag-fields__chip">
            <span className="haku-tag-fields__chip-label">{tag}</span>
            {!disabled && (
              <button
                type="button"
                className="haku-tag-fields__chip-remove"
                aria-label={`Remove tag ${tag}`}
                onClick={(event) => {
                  event.stopPropagation()
                  removeTag(index)
                }}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            ref={inputRef}
            type="text"
            className="haku-tag-fields__input"
            placeholder={tags.length === 0 ? 'Add tags…' : ''}
            value={draft}
            onChange={(event) => handleDraftChange(event.target.value)}
            onBlur={commitDraft}
            onKeyDown={onDraftKeyDown}
          />
        )}
      </div>
    </div>
  )
})
