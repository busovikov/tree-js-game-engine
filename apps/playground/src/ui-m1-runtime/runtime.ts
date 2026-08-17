import { UIDocumentInstance, UIDocumentSchema, type UIElementId } from '@haku/ui'

const id = (value: number): string =>
  `24000000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const ids = {
  root: id(1),
  title: id(2),
  image: id(3),
  button: id(4),
  rectangle: id(5),
  input: id(6),
  area: id(7),
  checkbox: id(8),
  radioA: id(9),
  radioB: id(10),
  toggle: id(11),
  select: id(12),
  slider: id(13),
  progress: id(14),
  divider: id(15),
  spacer: id(16),
  scroll: id(17),
  scrollText: id(18),
  list: id(19),
  listText: id(20),
  frame: id(21),
  instance: id(22),
  component: id(30),
  componentRoot: id(31),
  componentText: id(32),
  eventNone: id(40),
  eventString: id(41),
  eventBoolean: id(42),
  eventNumber: id(43),
} as const

const documentAsset = UIDocumentSchema.parse({
  schemaVersion: 2,
  id: id(90),
  name: 'UI M1 every-widget fixture',
  root: ids.root,
  elements: [
    {
      id: ids.root,
      type: 'frame',
      children: [ids.title, ids.image, ids.button, ids.rectangle, ids.input, ids.area, ids.checkbox,
        ids.radioA, ids.radioB, ids.toggle, ids.select, ids.slider, ids.progress, ids.divider,
        ids.spacer, ids.scroll, ids.list, ids.frame, ids.instance],
      layout: { mode: 'vertical', rowGap: 10, padding: { top: 14, right: 14, bottom: 14, left: 14 } },
      sizing: { width: { mode: 'fixed', value: 640, unit: 'px' }, height: { mode: 'hug' }, minWidth: { value: 300, unit: 'px' }, maxWidth: { value: 640, unit: 'px' } },
      style: { backgroundColor: '#101a31', borderColor: '#30405f', borderWidth: 1, borderRadius: 10 },
      accessibility: { label: 'Every required UI runtime kind' },
    },
    { id: ids.title, type: 'text', text: 'Native controls and primitives', style: { fontSize: 20, fontWeight: 'bold', color: '#f2f5ff' } },
    { id: ids.image, type: 'image', source: { $ref: id(91) }, alt: 'Blue Haku acceptance tile', sizing: { width: { mode: 'fixed', value: 96, unit: 'px' }, height: { mode: 'fixed', value: 56, unit: 'px' } }, style: { objectFit: 'cover', borderRadius: 8 } },
    { id: ids.button, type: 'button', text: 'Activate', events: { activate: ids.eventNone } },
    { id: ids.rectangle, type: 'rectangle', sizing: { width: { mode: 'fill' }, height: { mode: 'fixed', value: 12, unit: 'px' } }, style: { backgroundColor: '#7c9cff', borderRadius: 6 } },
    { id: ids.input, type: 'text-input', value: 'Haku', placeholder: 'Player name', accessibility: { label: 'Player name' }, events: { input: ids.eventString, change: ids.eventString, submit: ids.eventString, focus: ids.eventNone, blur: ids.eventNone } },
    { id: ids.area, type: 'text-area', value: 'Runtime notes', rows: 2, resize: 'vertical', accessibility: { label: 'Runtime notes' }, events: { input: ids.eventString, change: ids.eventString } },
    { id: ids.checkbox, type: 'checkbox', value: false, label: 'Enable checkpoints', events: { change: ids.eventBoolean } },
    { id: ids.radioA, type: 'radio', group: 'difficulty', optionValue: 'normal', value: 'normal', label: 'Normal difficulty', events: { change: ids.eventString } },
    { id: ids.radioB, type: 'radio', group: 'difficulty', optionValue: 'hard', value: 'normal', label: 'Hard difficulty', events: { change: ids.eventString } },
    { id: ids.toggle, type: 'switch', value: true, label: 'Music enabled', events: { change: ids.eventBoolean } },
    { id: ids.select, type: 'select', value: 'forest', placeholder: 'Choose biome', accessibility: { label: 'Biome' }, options: [{ value: 'forest', label: 'Forest' }, { value: 'desert', label: 'Desert' }, { value: 'locked', label: 'Locked', disabled: true }], events: { change: ids.eventString } },
    { id: ids.slider, type: 'slider', min: 0, max: 10, step: 1, value: 4, accessibility: { label: 'Volume' }, events: { input: ids.eventNumber, change: ids.eventNumber } },
    { id: ids.progress, type: 'progress', min: 0, max: 100, value: 68, accessibility: { label: 'Loading progress' } },
    { id: ids.divider, type: 'divider', orientation: 'horizontal', thickness: 2, sizing: { width: { mode: 'fill' }, height: { mode: 'hug' } }, style: { backgroundColor: '#30405f' } },
    { id: ids.spacer, type: 'spacer', sizing: { width: { mode: 'fixed', value: 1, unit: 'px' }, height: { mode: 'fixed', value: 4, unit: 'px' } } },
    { id: ids.scroll, type: 'scroll-container', children: [ids.scrollText], layout: { mode: 'vertical' }, overflowX: 'hidden', overflowY: 'auto', sizing: { width: { mode: 'fill' }, height: { mode: 'fixed', value: 42, unit: 'px' } }, style: { backgroundColor: '#17223a', padding: { top: 8, right: 8, bottom: 8, left: 8 } } },
    { id: ids.scrollText, type: 'text', text: 'Scroll container · deterministic overflow and child hierarchy' },
    { id: ids.list, type: 'list', children: [ids.listText], ordered: true, layout: { mode: 'vertical' } },
    { id: ids.listText, type: 'text', text: 'Static semantic list content' },
    { id: ids.frame, type: 'frame', children: [], layout: { mode: 'grid', columns: 2, columnGap: 8 }, sizing: { width: { mode: 'fill' }, height: { mode: 'fixed', value: 18, unit: 'px' } }, style: { backgroundColor: '#1b2844' } },
    { id: ids.instance, type: 'instance', component: ids.component, overrides: { [ids.componentText]: { text: 'Expanded component instance' } } },
  ],
  components: [{
    id: ids.component,
    name: 'Fixture badge',
    root: ids.componentRoot,
    elements: [
      { id: ids.componentRoot, type: 'frame', children: [ids.componentText], layout: { mode: 'horizontal' }, style: { backgroundColor: '#183b36', padding: { top: 7, right: 9, bottom: 7, left: 9 }, borderRadius: 7 } },
      { id: ids.componentText, type: 'text', text: 'Component instance' },
    ],
  }],
  events: [
    { id: ids.eventNone, name: 'activation', payload: 'none' },
    { id: ids.eventString, name: 'text', payload: 'string' },
    { id: ids.eventBoolean, name: 'boolean', payload: 'boolean' },
    { id: ids.eventNumber, name: 'number', payload: 'number' },
  ],
  themes: [],
})

const host = document.querySelector<HTMLElement>('#runtime-host')
const valueLog = document.querySelector<HTMLElement>('#value-log')
const eventLog = document.querySelector<HTMLOListElement>('#event-log')
if (!host || !valueLog || !eventLog) throw new Error('UI M1 fixture shell is incomplete')

const imageData = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="192" height="112"><rect width="100%" height="100%" rx="16" fill="#3155a6"/><path d="M28 78V34h12v17h20V34h12v44H60V61H40v17z" fill="#fff"/><text x="88" y="68" fill="#dce6ff" font-family="sans-serif" font-size="24">UI v2</text></svg>')}`
const runtime = new UIDocumentInstance(documentAsset, { assets: { resolve: () => imageData } })

const valueTargets = [ids.input, ids.area, ids.checkbox, ids.radioA, ids.toggle, ids.select, ids.slider, ids.progress] as const
const renderValues = (): void => {
  valueLog.textContent = valueTargets.map((elementId) => {
    const name = Object.entries(ids).find(([, value]) => value === elementId)?.[0] ?? elementId
    return `${name.padEnd(10)} ${JSON.stringify(runtime.getValue(elementId))}`
  }).join('\n')
}

runtime.subscribe((event) => {
  const item = document.createElement('li')
  item.dataset.eventType = event.type
  item.dataset.eventElement = event.sourceElementId ?? event.elementId
  item.textContent = `${event.type} · ${event.sourceElementId ?? event.elementId} · ${event.value === undefined ? 'none' : JSON.stringify(event.value)}`
  eventLog.prepend(item)
  eventLog.dataset.eventCount = String(Number(eventLog.dataset.eventCount ?? 0) + 1)
  renderValues()
})

runtime.mount(host)
for (const [name, elementId] of Object.entries(ids)) {
  const element = runtime.getElement(elementId as UIElementId)
  if (element) element.dataset.fixtureKind = name
}
eventLog.dataset.eventCount = '0'
renderValues()
