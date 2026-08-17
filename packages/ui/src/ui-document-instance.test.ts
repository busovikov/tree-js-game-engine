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

  it('translates the current flex, sizing, and anchor model into DOM styles', () => {
    const rootId = '10000000-0000-4000-8000-000000000021'
    const childId = '10000000-0000-4000-8000-000000000022'
    const documentAsset = UIDocumentSchema.parse({
      schemaVersion: 1,
      id: '10000000-0000-4000-8000-000000000023',
      name: 'Layout translation',
      root: rootId,
      elements: [
        {
          id: rootId,
          type: 'container',
          children: [childId],
          layout: {
            direction: 'row',
            wrap: true,
            justify: 'space-around',
            align: 'end',
            gap: 12,
          },
          sizing: { width: '100%', height: 'auto' },
        },
        {
          id: childId,
          type: 'text',
          text: 'Anchored',
          sizing: { width: 160, height: '50%', grow: 1, shrink: 0, basis: 'auto' },
          anchors: { right: 16, bottom: '10%' },
        },
      ],
    })
    const instance = new UIDocumentInstance(documentAsset)
    instance.mount(document.createElement('div'))

    const root = instance.getElement(rootId)
    const child = instance.getElement(childId)
    expect(root?.style).toMatchObject({
      display: 'flex',
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-around',
      alignItems: 'flex-end',
      gap: '12px',
      width: '100%',
      height: 'auto',
    })
    expect(child?.style).toMatchObject({
      position: 'absolute',
      width: '160px',
      height: '50%',
      flexGrow: '1',
      flexShrink: '0',
      flexBasis: 'auto',
      right: '16px',
      bottom: '10%',
    })
  })
})
