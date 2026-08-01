/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { UIDocumentInstance, UIDocumentSchema } from './index.js'

describe('UIDocumentInstance', () => {
  it('mounts a strict UUID-addressed document and destroys its DOM tree', () => {
    const rootId = '10000000-0000-4000-8000-000000000001'
    const textId = '10000000-0000-4000-8000-000000000002'
    const documentAsset = UIDocumentSchema.parse({
      schemaVersion: 1,
      id: '10000000-0000-4000-8000-000000000003',
      name: 'HUD',
      root: rootId,
      elements: [
        {
          id: rootId,
          type: 'container',
          children: [textId],
        },
        {
          id: textId,
          type: 'text',
          text: 'Ready',
        },
      ],
    })
    const host = document.createElement('div')

    const instance = new UIDocumentInstance(documentAsset)
    instance.mount(host)

    const renderedText = instance.getElement(textId)
    expect(renderedText).toBeInstanceOf(HTMLElement)
    expect(renderedText?.textContent).toBe('Ready')

    instance.destroy()
    expect(host.childElementCount).toBe(0)
  })

  it('removes flex containers from layout while they are hidden', () => {
    const rootId = '10000000-0000-4000-8000-000000000011'
    const panelId = '10000000-0000-4000-8000-000000000012'
    const documentAsset = UIDocumentSchema.parse({
      schemaVersion: 1,
      id: '10000000-0000-4000-8000-000000000013',
      name: 'Visibility',
      root: rootId,
      elements: [
        { id: rootId, type: 'container', children: [panelId] },
        { id: panelId, type: 'container', children: [] },
      ],
    })
    const instance = new UIDocumentInstance(documentAsset)
    instance.mount(document.createElement('div'))
    const panel = instance.getElement(panelId)

    instance.setVisible(panelId, false)
    expect(panel?.hidden).toBe(true)
    expect(panel?.style.display).toBe('none')

    instance.setVisible(panelId, true)
    expect(panel?.hidden).toBe(false)
    expect(panel?.style.display).toBe('flex')
  })
})
