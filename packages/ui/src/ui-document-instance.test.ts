/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { UIDocumentInstance, UIDocumentSchema } from './index.js'

const id = (value: number): string =>
  `22000000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const ROOT = id(1)
const TEXT = id(2)
const IMAGE = id(3)
const BUTTON = id(4)
const RECTANGLE = id(5)
const INPUT = id(6)
const AREA = id(7)
const CHECKBOX = id(8)
const RADIO_A = id(9)
const RADIO_B = id(10)
const SWITCH = id(11)
const SELECT = id(12)
const SLIDER = id(13)
const PROGRESS = id(14)
const DIVIDER = id(15)
const SPACER = id(16)
const SCROLL = id(17)
const LIST = id(18)
const NESTED_FRAME = id(19)
const INSTANCE = id(20)
const COMPONENT = id(30)
const COMPONENT_ROOT = id(31)
const COMPONENT_INPUT = id(32)
const NESTED_COMPONENT = id(33)
const NESTED_ROOT = id(34)
const NESTED_TEXT = id(35)
const NESTED_INSTANCE = id(36)
const THEME = id(50)
const ACTIVATE = id(60)
const STRING_EVENT = id(61)
const BOOLEAN_EVENT = id(62)
const NUMBER_EVENT = id(63)

function cardDocument(componentized: boolean) {
  const card = {
    id: COMPONENT_ROOT,
    type: 'frame' as const,
    name: 'Card',
    children: [COMPONENT_INPUT],
    layout: { mode: 'vertical' as const, rowGap: 6 },
    sizing: {
      width: { mode: 'fixed' as const, value: 240, unit: 'px' as const },
      height: { mode: 'hug' as const },
    },
    style: {
      backgroundColor: '#123456',
      padding: { top: 8, right: 9, bottom: 10, left: 11 },
      borderRadius: 4,
    },
    accessibility: { role: 'region', label: 'Card', tabIndex: 0 },
    events: { focus: ACTIVATE, blur: ACTIVATE },
  }
  const button = {
    id: COMPONENT_INPUT,
    type: 'button' as const,
    text: 'Continue',
    accessibility: { label: 'Continue' },
    events: { activate: ACTIVATE },
  }
  return UIDocumentSchema.parse({
    schemaVersion: 2,
    id: id(componentized ? 92 : 93),
    name: componentized ? 'Componentized card' : 'Concrete card',
    root: ROOT,
    elements: [
      {
        id: ROOT,
        type: 'frame',
        children: [componentized ? INSTANCE : COMPONENT_ROOT],
        layout: { mode: 'vertical' },
        sizing: {
          width: { mode: 'fixed', value: 800, unit: 'px' },
          height: { mode: 'fixed', value: 600, unit: 'px' },
        },
      },
      ...(componentized
        ? [
            {
              id: INSTANCE,
              type: 'instance' as const,
              component: COMPONENT,
              name: card.name,
              placement: { positioning: 'flow' as const },
              sizing: card.sizing,
            },
          ]
        : [card, button]),
    ],
    components: componentized
      ? [{ id: COMPONENT, name: 'Card', root: COMPONENT_ROOT, elements: [card, button] }]
      : [],
    events: [{ id: ACTIVATE, name: 'activate', payload: 'none' }],
  })
}

function documentAsset() {
  return UIDocumentSchema.parse({
    schemaVersion: 2,
    id: id(90),
    name: 'Complete runtime',
    root: ROOT,
    elements: [
      {
        id: ROOT,
        type: 'frame',
        children: [TEXT, IMAGE, BUTTON, RECTANGLE, INPUT, AREA, CHECKBOX, RADIO_A, RADIO_B, SWITCH, SELECT, SLIDER, PROGRESS, DIVIDER, SPACER, SCROLL, LIST, NESTED_FRAME, INSTANCE],
        layout: {
          mode: 'vertical',
          padding: { top: 1, right: 2, bottom: 3, left: 4 },
          rowGap: 7,
          columnGap: 9,
          distribution: 'space-between',
          alignment: 'center',
          wrap: true,
        },
        sizing: {
          width: { mode: 'fixed', value: 800, unit: 'px' },
          height: { mode: 'fixed', value: 600, unit: 'px' },
          minWidth: { value: 320, unit: 'px' },
          maxWidth: { value: 900, unit: 'px' },
        },
        accessibility: { role: 'main', label: 'Complete UI' },
      },
      { id: TEXT, type: 'text', text: 'Ready' },
      { id: IMAGE, type: 'image', source: { $ref: id(91) }, alt: 'Star', style: { objectFit: 'contain' } },
      { id: BUTTON, type: 'button', text: 'Run', events: { activate: ACTIVATE } },
      { id: RECTANGLE, type: 'rectangle', style: { backgroundColor: '#222', borderRadius: { topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 } } },
      { id: INPUT, type: 'text-input', value: 'start', placeholder: 'Name', required: true, maxLength: 10, inputMode: 'text', accessibility: { label: 'Name' }, events: { input: STRING_EVENT, change: STRING_EVENT, submit: STRING_EVENT, focus: ACTIVATE, blur: ACTIVATE } },
      { id: AREA, type: 'text-area', value: 'notes', rows: 4, resize: 'none', accessibility: { label: 'Notes' }, events: { input: STRING_EVENT, change: STRING_EVENT } },
      { id: CHECKBOX, type: 'checkbox', value: true, label: 'Accept', events: { change: BOOLEAN_EVENT } },
      { id: RADIO_A, type: 'radio', group: 'mode', optionValue: 'a', value: 'a', label: 'Mode A', events: { change: STRING_EVENT } },
      { id: RADIO_B, type: 'radio', group: 'mode', optionValue: 'b', value: 'a', label: 'Mode B', events: { change: STRING_EVENT } },
      { id: SWITCH, type: 'switch', value: false, label: 'Music', events: { change: BOOLEAN_EVENT } },
      { id: SELECT, type: 'select', value: null, placeholder: 'Choose', accessibility: { label: 'Choice' }, options: [{ value: 'one', label: 'One' }, { value: 'two', label: 'Two', disabled: true }], events: { change: STRING_EVENT } },
      { id: SLIDER, type: 'slider', min: 0, max: 10, step: 2, value: 4, accessibility: { label: 'Volume' }, events: { input: NUMBER_EVENT, change: NUMBER_EVENT } },
      { id: PROGRESS, type: 'progress', min: 0, max: 100, value: null, accessibility: { label: 'Load' } },
      { id: DIVIDER, type: 'divider', orientation: 'vertical', thickness: 2 },
      { id: SPACER, type: 'spacer' },
      { id: SCROLL, type: 'scroll-container', children: [], layout: { mode: 'vertical' }, overflowX: 'hidden', overflowY: 'auto' },
      { id: LIST, type: 'list', children: [], ordered: true, layout: { mode: 'vertical' } },
      { id: NESTED_FRAME, type: 'frame', children: [], layout: { mode: 'grid', columns: 3, rowGap: 2, columnGap: 5 }, overflowX: 'hidden', overflowY: 'scroll' },
      { id: INSTANCE, type: 'instance', component: COMPONENT, overrides: { [COMPONENT_INPUT]: { value: 'overridden', style: { color: '#f00' } } } },
    ],
    components: [
      {
        id: COMPONENT,
        name: 'Field',
        root: COMPONENT_ROOT,
        elements: [
          { id: COMPONENT_ROOT, type: 'frame', children: [COMPONENT_INPUT, NESTED_INSTANCE], layout: { mode: 'vertical' } },
          { id: COMPONENT_INPUT, type: 'text-input', value: 'master', accessibility: { label: 'Component input' } },
          { id: NESTED_INSTANCE, type: 'instance', component: NESTED_COMPONENT },
        ],
      },
      {
        id: NESTED_COMPONENT,
        name: 'Nested',
        root: NESTED_ROOT,
        elements: [
          { id: NESTED_ROOT, type: 'frame', children: [NESTED_TEXT], layout: { mode: 'vertical' } },
          { id: NESTED_TEXT, type: 'text', text: 'Nested' },
        ],
      },
    ],
    events: [
      { id: ACTIVATE, name: 'activate', payload: 'none' },
      { id: STRING_EVENT, name: 'string', payload: 'string' },
      { id: BOOLEAN_EVENT, name: 'boolean', payload: 'boolean' },
      { id: NUMBER_EVENT, name: 'number', payload: 'number' },
    ],
    themes: [{ id: THEME, name: 'Red', styles: { [TEXT]: { color: '#f00' }, [COMPONENT_INPUT]: { backgroundColor: '#fee' } } }],
  })
}

describe('UIDocumentInstance v2', () => {
  it('renders every required kind with native React-free semantics and deterministic layout', () => {
    const host = document.createElement('div')
    const instance = new UIDocumentInstance(documentAsset(), { assets: { resolve: () => '/star.png' } })
    instance.mount(host)

    expect(instance.getElement(ROOT)?.tagName).toBe('DIV')
    expect(instance.getElement(TEXT)?.tagName).toBe('SPAN')
    expect(instance.getElement(IMAGE)?.tagName).toBe('IMG')
    expect(instance.getElement(BUTTON)?.tagName).toBe('BUTTON')
    expect(instance.getElement(INPUT)?.tagName).toBe('INPUT')
    expect(instance.getElement(AREA)?.tagName).toBe('TEXTAREA')
    expect((instance.getElement(CHECKBOX) as HTMLInputElement).type).toBe('checkbox')
    expect((instance.getElement(RADIO_A) as HTMLInputElement).type).toBe('radio')
    expect(instance.getElement(SWITCH)?.getAttribute('role')).toBe('switch')
    expect((instance.getElement(CHECKBOX) as HTMLInputElement).labels?.[0]?.textContent).toBe('Accept')
    expect((instance.getElement(RADIO_A) as HTMLInputElement).labels?.[0]?.textContent).toBe('Mode A')
    expect((instance.getElement(SWITCH) as HTMLInputElement).labels?.[0]?.textContent).toBe('Music')
    expect(instance.getElement(SELECT)?.tagName).toBe('SELECT')
    expect((instance.getElement(SLIDER) as HTMLInputElement).type).toBe('range')
    expect(instance.getElement(PROGRESS)?.tagName).toBe('PROGRESS')
    expect(instance.getElement(DIVIDER)?.getAttribute('role')).toBe('separator')
    expect(instance.getElement(SPACER)?.getAttribute('aria-hidden')).toBe('true')
    expect(instance.getElement(SCROLL)?.style.overflowY).toBe('auto')
    expect(instance.getElement(LIST)?.tagName).toBe('OL')

    const root = instance.getElement(ROOT)!
    expect(root.style.display).toBe('flex')
    expect(root.style.flexDirection).toBe('column')
    expect(root.style.flexWrap).toBe('wrap')
    expect(root.style.justifyContent).toBe('space-between')
    expect(root.style.alignItems).toBe('center')
    expect(root.style.rowGap).toBe('7px')
    expect(root.style.columnGap).toBe('9px')
    expect(root.style.padding).toBe('1px 2px 3px 4px')
    expect(root.style.width).toBe('800px')
    expect(root.style.height).toBe('600px')
    expect(root.style.minWidth).toBe('320px')
    expect(root.style.maxWidth).toBe('900px')
    const grid = instance.getElement(NESTED_FRAME)!
    expect(grid.style.display).toBe('grid')
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))')
    expect(grid.style.rowGap).toBe('2px')
    expect(grid.style.columnGap).toBe('5px')
  })

  it('keeps typed values in instance state, resets them, and never emits for programmatic writes', () => {
    const listener = vi.fn()
    const instance = new UIDocumentInstance(documentAsset(), { assets: { resolve: () => '/star.png' } })
    instance.subscribe(listener)
    instance.mount(document.createElement('div'))

    expect(instance.getValue(INPUT)).toBe('start')
    expect(instance.getValue(CHECKBOX)).toBe(true)
    expect(instance.getValue(RADIO_B)).toBe('a')
    expect(instance.getValue(SELECT)).toBeNull()
    expect(instance.getValue(SLIDER)).toBe(4)
    expect(instance.getValue(PROGRESS)).toBeNull()

    instance.setValue(INPUT, 'changed')
    instance.setValue(CHECKBOX, false)
    instance.setValue(RADIO_A, 'b')
    instance.setValue(SELECT, 'one')
    instance.setValue(SLIDER, 8)
    instance.setValue(PROGRESS, 50)
    expect(listener).not.toHaveBeenCalled()
    expect((instance.getElement(INPUT) as HTMLInputElement).value).toBe('changed')
    expect((instance.getElement(RADIO_B) as HTMLInputElement).checked).toBe(true)

    instance.resetValue(INPUT)
    expect(instance.getValue(INPUT)).toBe('start')
    expect(() => instance.setValue(SLIDER, 9)).toThrow(/Invalid UI value/)
    expect(() => instance.getValue(TEXT)).toThrow(/does not have a runtime value/)
  })

  it('updates state before dispatching correct pointer/keyboard user events', () => {
    const events: unknown[] = []
    const instance = new UIDocumentInstance(documentAsset(), { assets: { resolve: () => '/star.png' } })
    instance.subscribe((event) => events.push(event))
    instance.mount(document.createElement('div'))

    instance.getElement(BUTTON)!.click()
    const input = instance.getElement(INPUT) as HTMLInputElement
    input.value = 'user'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const checkbox = instance.getElement(CHECKBOX) as HTMLInputElement
    checkbox.click()
    const radio = instance.getElement(RADIO_B) as HTMLInputElement
    radio.click()
    const slider = instance.getElement(SLIDER) as HTMLInputElement
    slider.value = '6'
    slider.dispatchEvent(new Event('input', { bubbles: true }))

    expect(instance.getValue(INPUT)).toBe('user')
    expect(instance.getValue(CHECKBOX)).toBe(false)
    expect(instance.getValue(RADIO_A)).toBe('b')
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'activate', elementId: BUTTON, bindingId: ACTIVATE }),
      expect.objectContaining({ type: 'input', elementId: INPUT, bindingId: STRING_EVENT, value: 'user' }),
      expect.objectContaining({ type: 'submit', elementId: INPUT, value: 'user' }),
      expect.objectContaining({ type: 'change', elementId: CHECKBOX, value: false }),
      expect.objectContaining({ type: 'change', elementId: RADIO_B, value: 'b' }),
      expect.objectContaining({ type: 'input', elementId: SLIDER, value: 6 }),
    ]))
  })

  it('keeps natively labeled controls addressable while activation updates values and events', () => {
    const events: unknown[] = []
    const instance = new UIDocumentInstance(documentAsset(), { assets: { resolve: () => '/star.png' } })
    instance.subscribe((event) => events.push(event))
    instance.mount(document.createElement('div'))

    const checkbox = instance.getElement(CHECKBOX) as HTMLInputElement
    const radio = instance.getElement(RADIO_B) as HTMLInputElement
    const toggle = instance.getElement(SWITCH) as HTMLInputElement
    expect(checkbox.dataset.hakuUiId).toBe(CHECKBOX)
    expect(radio.dataset.hakuUiId).toBe(RADIO_B)
    expect(toggle.dataset.hakuUiId).toBe(SWITCH)

    expect(checkbox.labels?.[0]?.htmlFor).toBe(checkbox.id)
    expect(radio.labels?.[0]?.htmlFor).toBe(radio.id)
    expect(toggle.labels?.[0]?.htmlFor).toBe(toggle.id)
    checkbox.click()
    radio.click()
    toggle.focus()
    toggle.click()

    expect(instance.getValue(CHECKBOX)).toBe(false)
    expect(instance.getValue(RADIO_A)).toBe('b')
    expect(instance.getValue(SWITCH)).toBe(true)
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'change', elementId: CHECKBOX, value: false }),
      expect.objectContaining({ type: 'change', elementId: RADIO_B, value: 'b' }),
      expect.objectContaining({ type: 'change', elementId: SWITCH, value: true }),
    ]))
  })

  it('preserves focused nodes across unrelated state/theme changes and enforces hidden/disabled lifecycle', () => {
    const instance = new UIDocumentInstance(documentAsset(), { assets: { resolve: () => '/star.png' } })
    const host = document.createElement('div')
    document.body.append(host)
    instance.mount(host)
    const input = instance.getElement(INPUT) as HTMLInputElement
    input.focus()
    instance.setText(TEXT, 'Updated')
    instance.setTheme(THEME)
    expect(document.activeElement).toBe(input)
    expect(instance.getElement(TEXT)?.style.color).toBe('#f00')

    instance.setVisible(INPUT, false)
    expect(input.hidden).toBe(true)
    expect(document.activeElement).not.toBe(input)
    instance.setEnabled(BUTTON, false)
    instance.setEnabled(RECTANGLE, false)
    expect((instance.getElement(BUTTON) as HTMLButtonElement).disabled).toBe(true)
    expect(instance.getElement(RECTANGLE)?.inert).toBe(true)
  })

  it('expands nested instances with deterministic locators, overrides, and theme source IDs', () => {
    const instance = new UIDocumentInstance(documentAsset(), { assets: { resolve: () => '/star.png' }, theme: THEME })
    instance.mount(document.createElement('div'))
    const componentInput = instance.getInstanceElement({ instancePath: [INSTANCE], sourceElementId: COMPONENT_INPUT }) as HTMLInputElement
    const nestedInstance = instance.getInstanceElement({
      instancePath: [INSTANCE],
      sourceElementId: NESTED_INSTANCE,
    })
    const nestedRoot = instance.getInstanceElement({
      instancePath: [INSTANCE, NESTED_INSTANCE],
      sourceElementId: NESTED_ROOT,
    })
    const nestedText = instance.getInstanceElement({ instancePath: [INSTANCE, NESTED_INSTANCE], sourceElementId: NESTED_TEXT })

    expect(componentInput.value).toBe('overridden')
    expect(componentInput.style.color).toBe('#f00')
    expect(componentInput.style.backgroundColor).toBe('#fee')
    expect(componentInput.dataset.hakuUiId).toBe(INSTANCE)
    expect(componentInput.dataset.hakuUiSourceId).toBe(COMPONENT_INPUT)
    expect(componentInput.dataset.hakuUiInstancePath).toBe(INSTANCE)
    expect(nestedInstance).toBe(nestedRoot)
    expect(nestedText?.textContent).toBe('Nested')
  })

  it('renders an extracted card instance as the concrete root without an appearance wrapper', () => {
    const concrete = new UIDocumentInstance(cardDocument(false))
    const componentized = new UIDocumentInstance(cardDocument(true))
    const concreteHost = document.createElement('div')
    const componentHost = document.createElement('div')
    const events: unknown[] = []
    componentized.subscribe((event) => events.push(event))
    concrete.mount(concreteHost)
    componentized.mount(componentHost)

    const concreteRoot = concrete.getElement(COMPONENT_ROOT)!
    const instanceRoot = componentized.getElement(INSTANCE)!
    const sourceRoot = componentized.getInstanceElement({
      instancePath: [INSTANCE],
      sourceElementId: COMPONENT_ROOT,
    })
    const sourceButton = componentized.getInstanceElement({
      instancePath: [INSTANCE],
      sourceElementId: COMPONENT_INPUT,
    })!

    expect(componentized.getElement(ROOT)?.childElementCount).toBe(1)
    expect(instanceRoot).toBe(sourceRoot)
    expect(instanceRoot.tagName).toBe(concreteRoot.tagName)
    expect(instanceRoot.childElementCount).toBe(concreteRoot.childElementCount)
    expect(instanceRoot.style.cssText).toBe(concreteRoot.style.cssText)
    expect(instanceRoot.getAttribute('role')).toBe(concreteRoot.getAttribute('role'))
    expect(instanceRoot.getAttribute('aria-label')).toBe(concreteRoot.getAttribute('aria-label'))
    expect(instanceRoot.tabIndex).toBe(concreteRoot.tabIndex)
    expect(instanceRoot.dataset.hakuUiId).toBe(INSTANCE)
    expect(instanceRoot.dataset.hakuUiSourceId).toBe(COMPONENT_ROOT)
    expect(instanceRoot.dataset.hakuUiInstancePath).toBe(INSTANCE)

    instanceRoot.dispatchEvent(new FocusEvent('focus'))
    sourceButton.click()
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'focus',
          elementId: INSTANCE,
          instancePath: [INSTANCE],
          sourceElementId: COMPONENT_ROOT,
        }),
        expect.objectContaining({
          type: 'activate',
          elementId: INSTANCE,
          instancePath: [INSTANCE],
          sourceElementId: COMPONENT_INPUT,
        }),
      ]),
    )
  })

  it('composes instance appearance and runtime visibility onto its physical source root', () => {
    const asset = cardDocument(true)
    const composed = UIDocumentSchema.parse({
      ...asset,
      elements: asset.elements.map((element) =>
        element.type === 'instance'
          ? {
              ...element,
              visible: false,
              enabled: false,
              style: { backgroundColor: '#abcdef', opacity: 0.5 },
              accessibility: { label: 'Placed card', description: 'Instance description' },
            }
          : element,
      ),
    })
    const instance = new UIDocumentInstance(composed)
    instance.mount(document.createElement('div'))
    const rootLocator = {
      instancePath: [INSTANCE],
      sourceElementId: COMPONENT_ROOT,
    } as const
    const root = instance.getElement(INSTANCE)!

    expect(root).toBe(instance.getInstanceElement(rootLocator))
    expect(root.style.backgroundColor).toBe('#abcdef')
    expect(root.style.opacity).toBe('0.5')
    expect(root.getAttribute('aria-label')).toBe('Placed card')
    expect(root.getAttribute('aria-description')).toBe('Instance description')
    expect(root.hidden).toBe(true)
    expect(root.inert).toBe(true)

    instance.setVisible(INSTANCE, true)
    instance.setEnabled(INSTANCE, true)
    expect(root.hidden).toBe(false)
    expect(root.inert).toBe(false)

    instance.setVisible(rootLocator, false)
    instance.setVisible(INSTANCE, true)
    expect(root.hidden).toBe(true)
  })

  it('mounts atomically, requires assets, and clears values/DOM on destroy', () => {
    const host = document.createElement('div')
    host.innerHTML = '<p>sentinel</p>'
    const instance = new UIDocumentInstance(documentAsset())
    expect(() => instance.mount(host)).toThrow(`UI image ${IMAGE} requires an asset resolver`)
    expect(host.innerHTML).toBe('<p>sentinel</p>')

    const mounted = new UIDocumentInstance(documentAsset(), { assets: { resolve: () => '/star.png' } })
    mounted.mount(host)
    mounted.setValue(INPUT, 'dirty')
    mounted.destroy()
    expect(host.childElementCount).toBe(0)
    mounted.mount(host)
    expect(mounted.getValue(INPUT)).toBe('start')
  })
})
