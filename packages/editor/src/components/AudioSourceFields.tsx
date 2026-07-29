import { memo, useEffect, useMemo, useState } from 'react'
import {
  AUDIO_BUSES,
  AUDIO_CLIP_ASSET_TYPE,
  AudioSourceSchema,
  type AudioSourceData,
} from '@haku/audio'
import { EditorAudioPreview } from '../audio/audio-preview.js'
import { projectService } from '../services/project-service.js'
import { NumberField } from './NumberField.js'
import './mesh-renderer-fields.css'

export function normalizeAudioSource(data: unknown): AudioSourceData {
  return AudioSourceSchema.parse(data)
}

export const AudioSourceFields = memo(function AudioSourceFields({
  value,
  onChange,
  disabled,
}: {
  value: AudioSourceData
  onChange: (next: AudioSourceData) => void
  disabled?: boolean
}) {
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'playing' | 'error'>(
    'idle',
  )
  const [previewError, setPreviewError] = useState('')
  const preview = useMemo(
    () =>
      new EditorAudioPreview((reference) =>
        projectService.loadAudioClipAsset(reference),
      ),
    [],
  )
  const clips =
    projectService
      .getManifest()
      ?.assets.filter((entry) => entry.type === AUDIO_CLIP_ASSET_TYPE) ?? []

  useEffect(() => () => preview.stop(), [preview])

  const patch = (partial: Partial<AudioSourceData>) =>
    onChange(AudioSourceSchema.parse({ ...value, ...partial }))

  return (
    <div className="mesh-renderer-fields">
      <div className="mesh-renderer-fields__section">
        <label className="mesh-field">
          <span className="mesh-field__label">Audio Clip</span>
          <select
            aria-label="Audio Clip"
            className="mesh-field__input"
            value={value.clip.$ref}
            disabled={disabled || clips.length === 0}
            onChange={(event) => {
              const clip = clips.find((entry) => entry.id === event.target.value)
              if (clip) {
                patch({
                  clip: { $ref: clip.id, type: AUDIO_CLIP_ASSET_TYPE },
                })
              }
            }}
          >
            {clips.length === 0 && <option value="">No audio clips in project</option>}
            {clips.map((clip) => (
              <option key={clip.id} value={clip.id}>
                {typeof clip.metadata.name === 'string' ? clip.metadata.name : clip.path}
              </option>
            ))}
          </select>
        </label>

        <label className="mesh-field">
          <span className="mesh-field__label">Bus</span>
          <select
            aria-label="Bus"
            className="mesh-field__input"
            value={value.bus}
            disabled={disabled}
            onChange={(event) =>
              patch({ bus: event.target.value as AudioSourceData['bus'] })
            }
          >
            {AUDIO_BUSES.filter((bus) => bus !== 'master').map((bus) => (
              <option key={bus} value={bus}>
                {bus.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        <NumberField
          label="Volume"
          value={value.volume}
          min={0}
          max={1}
          step={0.05}
          disabled={disabled}
          onChange={(volume) => patch({ volume })}
        />
        <NumberField
          label="Playback Rate"
          value={value.playbackRate}
          min={0.01}
          step={0.05}
          disabled={disabled}
          onChange={(playbackRate) => patch({ playbackRate })}
        />

        {(['loop', 'autoplay', 'muted'] as const).map((field) => (
          <label key={field} className="mesh-field mesh-field--checkbox">
            <input
              type="checkbox"
              checked={value[field] ?? false}
              disabled={disabled}
              onChange={(event) => patch({ [field]: event.target.checked })}
            />
            {field[0]!.toUpperCase() + field.slice(1)}
          </label>
        ))}

        <label className="mesh-field mesh-field--checkbox">
          <input
            type="checkbox"
            checked={value.spatial !== null}
            disabled={disabled}
            onChange={(event) =>
              patch({
                spatial: event.target.checked ? { x: 0, y: 0, z: 0 } : null,
              })
            }
          />
          Spatial
        </label>
        {value.spatial &&
          (['x', 'y', 'z'] as const).map((axis) => (
            <NumberField
              key={axis}
              label={`Position ${axis.toUpperCase()}`}
              value={value.spatial![axis]}
              disabled={disabled}
              onChange={(coordinate) =>
                patch({ spatial: { ...value.spatial!, [axis]: coordinate } })
              }
            />
          ))}
      </div>

      <div className="haku-inspector__section-toolbar">
        <button
          type="button"
          aria-label="Preview audio"
          disabled={previewState === 'loading'}
          onClick={async () => {
            setPreviewState('loading')
            setPreviewError('')
            try {
              await preview.unlock()
              await preview.playUnlocked(value)
              setPreviewState('playing')
            } catch (error) {
              setPreviewState('error')
              setPreviewError(error instanceof Error ? error.message : String(error))
            }
          }}
        >
          Preview
        </button>
        <button
          type="button"
          aria-label="Stop audio preview"
          disabled={previewState === 'idle'}
          onClick={() => {
            preview.stop()
            setPreviewState('idle')
          }}
        >
          Stop
        </button>
        <span role="status">
          {previewState === 'loading'
            ? 'Unlocking audio…'
            : previewState === 'playing'
              ? 'Preview playing'
              : previewState === 'error'
                ? previewError
                : 'Preview stopped'}
        </span>
      </div>
    </div>
  )
})
