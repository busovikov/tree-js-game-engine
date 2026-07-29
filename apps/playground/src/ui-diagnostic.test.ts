/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { createUIDiagnostic } from './ui-diagnostic.js'

describe('M10b playground UI diagnostic', () => {
  it('mutates the same visible text through native, service, and graph boundaries', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const diagnostic = createUIDiagnostic(host)
    const status = diagnostic.instance.getElement(diagnostic.statusId)
    const button = diagnostic.instance.getElement(diagnostic.buttonId)

    expect(status?.textContent).toBe('Runtime UI ready')
    expect(status?.hidden).toBe(false)
    expect(button).toBeInstanceOf(HTMLButtonElement)
    expect(button?.getAttribute('aria-label')).toBe('Run UI diagnostic')

    button?.click()
    expect(status?.textContent).toBe('Native button activated')

    diagnostic.service.setText(diagnostic.statusTarget, 'UIService mutation')
    expect(status?.textContent).toBe('UIService mutation')

    const result = diagnostic.setTextFromGraph('Graph adapter mutation')
    expect(status?.textContent).toBe('Graph adapter mutation')
    expect(result.effects).toMatchObject([{ kind: 'ui.set-text' }])
    expect(result.flow).toEqual([diagnostic.flowOut])

    const root = diagnostic.instance.getElement(diagnostic.rootId)
    expect(root?.style.position).toBe('relative')

    diagnostic.destroy()
    expect(host.childElementCount).toBe(0)
    host.remove()
  })
})
