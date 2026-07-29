import { createCrossServiceDiagnostic } from './cross-service-diagnostic.js'

Object.assign(document.body.style, {
  margin: '0',
  minHeight: '100vh',
  background: '#0d0f18',
  padding: '20px',
  boxSizing: 'border-box',
})

const host = document.getElementById('m10f-diagnostic')
if (!(host instanceof HTMLElement)) {
  throw new Error('M10f diagnostic host is missing')
}
Object.assign(host.style, {
  maxWidth: '720px',
  margin: '0 auto',
})

const diagnostic = createCrossServiceDiagnostic(host)
window.addEventListener('beforeunload', () => diagnostic.destroy(), {
  once: true,
})
