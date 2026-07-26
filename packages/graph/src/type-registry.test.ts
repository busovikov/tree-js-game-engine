import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import {
  ARRAY_TYPE,
  BOOL_TYPE,
  ENTITY_REF_TYPE,
  NODE_REF_TYPE,
  NUMBER_TYPE,
  OPTION_TYPE,
  RESULT_TYPE,
  STRING_TYPE,
  TypeRegistry,
  createBuiltinTypeRegistry,
  defineSchemaDataType,
  defineVisualDataType,
  genericType,
  inferTypeArguments,
  namedType,
  resolveTypeExpression,
  substituteTypeArguments,
  type VisualDataTypeAsset,
} from './index.js'

const projectTypeId = '41000000-0000-4000-8000-000000000101'

const playerAsset: VisualDataTypeAsset = {
  schemaVersion: 1,
  id: projectTypeId,
  name: 'PlayerState',
  version: '1.0.0',
  shape: {
    kind: 'struct',
    fields: [
      { name: 'alive', type: namedType(BOOL_TYPE) },
      { name: 'score', type: namedType(NUMBER_TYPE) },
    ],
  },
  metadata: { editorWidget: 'object' },
}

describe('data type registry', () => {
  it('provides runtime schemas for built-in primitives and generic containers', () => {
    const registry = createBuiltinTypeRegistry()

    expect(resolveTypeExpression(registry, namedType(NUMBER_TYPE)).parse(3)).toBe(3)
    expect(() => resolveTypeExpression(registry, namedType(NUMBER_TYPE)).parse('3')).toThrow()
    expect(
      resolveTypeExpression(
        registry,
        namedType(OPTION_TYPE, [namedType(STRING_TYPE)]),
      ).parse({ kind: 'some', value: 'ready' }),
    ).toEqual({ kind: 'some', value: 'ready' })
    expect(
      resolveTypeExpression(
        registry,
        namedType(RESULT_TYPE, [namedType(NUMBER_TYPE), namedType(STRING_TYPE)]),
      ).parse({ kind: 'error', error: 'nope' }),
    ).toEqual({ kind: 'error', error: 'nope' })
    expect(
      resolveTypeExpression(
        registry,
        namedType(ARRAY_TYPE, [namedType(BOOL_TYPE)]),
      ).parse([true, false]),
    ).toEqual([true, false])
  })

  it('uses strict serializable reference schemas including same-instance NodeRef', () => {
    const registry = createBuiltinTypeRegistry()
    const entity = { $ref: 'entity:41000000-0000-4000-8000-000000000102' }
    const node = { node: '41000000-0000-4000-8000-000000000103' }

    expect(resolveTypeExpression(registry, namedType(ENTITY_REF_TYPE)).parse(entity)).toEqual(entity)
    expect(
      resolveTypeExpression(
        registry,
        namedType(NODE_REF_TYPE, [namedType(BOOL_TYPE)]),
      ).parse(node),
    ).toEqual(node)
    expect(() =>
      resolveTypeExpression(
        registry,
        namedType(NODE_REF_TYPE, [namedType(BOOL_TYPE)]),
      ).parse({
        ...node,
        graphInstance: 'another-instance',
      }),
    ).toThrow()
  })

  it('derives the same registry contract from visual and TypeScript-schema definitions', () => {
    const builtins = createBuiltinTypeRegistry()
    const visual = defineVisualDataType(playerAsset, builtins)
    const schema = defineSchemaDataType({
      ...playerAsset,
      runtimeSchema: z.object({
        alive: z.boolean(),
        score: z.number(),
      }).strict(),
    })

    expect(visual.contract).toEqual(schema.contract)
    expect(visual.runtimeSchema.parse({ alive: true, score: 7 })).toEqual({
      alive: true,
      score: 7,
    })
    expect(schema.runtimeSchema.parse({ alive: true, score: 7 })).toEqual({
      alive: true,
      score: 7,
    })
  })

  it('produces an order-independent fingerprint and changes it for incompatible contracts', () => {
    const first = createBuiltinTypeRegistry()
    first.register(defineVisualDataType(playerAsset, first))
    const second = new TypeRegistry()
    const definitions = [...first.all()].reverse()
    for (const definition of definitions) second.register(definition)

    expect(second.fingerprint()).toBe(first.fingerprint())

    const changed = createBuiltinTypeRegistry()
    changed.register(
      defineVisualDataType({ ...playerAsset, version: '2.0.0' }, changed),
    )
    expect(changed.fingerprint()).not.toBe(first.fingerprint())
  })

  it('infers and substitutes generic arguments without implicit conversion', () => {
    const bindings = inferTypeArguments(
      namedType(ARRAY_TYPE, [genericType('T')]),
      namedType(ARRAY_TYPE, [namedType(NUMBER_TYPE)]),
    )

    expect(bindings).toEqual({ T: namedType(NUMBER_TYPE) })
    expect(substituteTypeArguments(genericType('T'), bindings)).toEqual(
      namedType(NUMBER_TYPE),
    )
    expect(() =>
      inferTypeArguments(genericType('T'), namedType(STRING_TYPE), bindings),
    ).toThrow(/conflicting inference/)
  })

  it('rejects unresolved generics, unknown types, and invalid generic arity', () => {
    const registry = createBuiltinTypeRegistry()

    expect(() => substituteTypeArguments(genericType('T'), {})).toThrow(/Unresolved generic/)
    expect(() =>
      resolveTypeExpression(
        registry,
        namedType('41000000-0000-4000-8000-000000000199'),
      ),
    ).toThrow(/Unknown data type/)
    expect(() =>
      resolveTypeExpression(registry, namedType(OPTION_TYPE, [])),
    ).toThrow(/expects 1 type argument/)
  })

  it('rejects ambiguous visual enum contracts before registration', () => {
    const registry = createBuiltinTypeRegistry()

    expect(() =>
      defineVisualDataType(
        {
          schemaVersion: 1,
          id: projectTypeId,
          name: 'DuplicateEnum',
          version: '1',
          shape: { kind: 'enum', values: ['same', 'same'] },
          metadata: {},
        },
        registry,
      ),
    ).toThrow(/Duplicate enum value/)
  })
})
