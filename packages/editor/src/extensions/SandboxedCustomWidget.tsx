import { memo, useEffect, useRef } from 'react'
import type { BrowserProjectTrustMode } from '@haku/build'

const EXAMPLE_WIDGET_DOCUMENT = `<!doctype html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
  <style>
    html, body { margin: 0; background: #171721; color: #ddd; font: 12px system-ui; }
    label { display: grid; grid-template-columns: 72px 1fr 42px; gap: 8px; align-items: center; padding: 8px; }
    input { width: 100%; }
  </style>
</head>
<body>
  <label>
    <span>Speed</span>
    <input id="speed" type="range" min="0" max="10" step="0.1">
    <output id="value"></output>
  </label>
  <script>
    const speed = document.getElementById('speed')
    const output = document.getElementById('value')
    addEventListener('message', (event) => {
      if (event.data?.type !== 'haku-widget:init') return
      const value = Number(event.data.value?.speed ?? 0)
      speed.value = String(Number.isFinite(value) ? value : 0)
      output.value = speed.value
    })
    speed.addEventListener('input', () => {
      output.value = speed.value
      parent.postMessage({
        type: 'haku-widget:patch',
        patch: { speed: Number(speed.value) },
      }, '*')
    })
  </script>
</body>
</html>`

export const SandboxedCustomWidget = memo(function SandboxedCustomWidget({
  trustMode,
  componentName,
  value,
  onPatch,
}: {
  trustMode: BrowserProjectTrustMode
  componentName: string
  value: Readonly<Record<string, unknown>>
  onPatch: (patch: Readonly<Record<string, unknown>>) => void
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const trusted = trustMode !== 'imported-untrusted'

  useEffect(() => {
    if (!trusted) return
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== frameRef.current?.contentWindow) return
      const message = event.data
      if (
        typeof message !== 'object' ||
        message === null ||
        !('type' in message) ||
        message.type !== 'haku-widget:patch' ||
        !('patch' in message) ||
        typeof message.patch !== 'object' ||
        message.patch === null ||
        !('speed' in message.patch) ||
        typeof message.patch.speed !== 'number' ||
        !Number.isFinite(message.patch.speed)
      ) {
        return
      }
      onPatch({ speed: message.patch.speed })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onPatch, trusted])

  if (!trusted) {
    return (
      <div role="status" className="haku-inspector__extension-unresolved">
        Editor extension for {componentName} is unresolved because this project is untrusted.
      </div>
    )
  }

  return (
    <iframe
      ref={frameRef}
      title={`${componentName} custom widget sandbox`}
      sandbox="allow-scripts"
      srcDoc={EXAMPLE_WIDGET_DOCUMENT}
      style={{ width: '100%', height: 42, border: '1px solid #3a3a48' }}
      onLoad={() =>
        frameRef.current?.contentWindow?.postMessage({ type: 'haku-widget:init', value }, '*')
      }
    />
  )
})
