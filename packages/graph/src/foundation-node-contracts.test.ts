import { describe, expect, it } from 'vitest'
import {
  BOOL_TYPE,
  FOUNDATION_GRAPH_CONTRACTS,
  NUMBER_TYPE,
  NodeRegistry,
  STRING_TYPE,
  VEC3_TYPE,
  registerFoundationNodeContracts,
} from './index.js'

const EXPECTED_FOUNDATION_IDS = {
  onStart: '74000000-0000-4000-8000-000000000001',
  branch: '74000000-0000-4000-8000-000000000002',
  add: '74000000-0000-4000-8000-000000000003',
  addVec3: '74000000-0000-4000-8000-000000000004',
  formatNumber: '74000000-0000-4000-8000-000000000005',
  ports: {
    onStartNext: '74000000-0000-4000-8000-000000000101',
    branchIn: '74000000-0000-4000-8000-000000000201',
    branchCondition: '74000000-0000-4000-8000-000000000202',
    branchTrue: '74000000-0000-4000-8000-000000000203',
    branchFalse: '74000000-0000-4000-8000-000000000204',
    addA: '74000000-0000-4000-8000-000000000301',
    addB: '74000000-0000-4000-8000-000000000302',
    addResult: '74000000-0000-4000-8000-000000000303',
    addVec3A: '74000000-0000-4000-8000-000000000401',
    addVec3B: '74000000-0000-4000-8000-000000000402',
    addVec3Result: '74000000-0000-4000-8000-000000000403',
    formatNumberValue: '74000000-0000-4000-8000-000000000501',
    formatNumberResult: '74000000-0000-4000-8000-000000000502',
  },
} as const

describe('foundation graph node contracts', () => {
  it('registers the initial lifecycle, control, scalar, and vector foundation', () => {
    const registry = new NodeRegistry()
    registerFoundationNodeContracts(registry)

    expect(FOUNDATION_GRAPH_CONTRACTS.map(({ contract }) => ({
      id: contract.id,
      name: contract.name,
    }))).toEqual([
      { id: EXPECTED_FOUNDATION_IDS.onStart, name: 'On Start' },
      { id: EXPECTED_FOUNDATION_IDS.branch, name: 'Branch' },
      { id: EXPECTED_FOUNDATION_IDS.add, name: 'Add' },
      { id: EXPECTED_FOUNDATION_IDS.addVec3, name: 'Add Vec3' },
      { id: EXPECTED_FOUNDATION_IDS.formatNumber, name: 'Format Number' },
    ])
    expect(registry.all()).toEqual(FOUNDATION_GRAPH_CONTRACTS)
  })

  it('keeps stable typed port identities and explicit execution domains', () => {
    const contracts = Object.fromEntries(
      FOUNDATION_GRAPH_CONTRACTS.map(({ contract }) => [contract.name, contract]),
    )

    expect(contracts['On Start']?.ports).toEqual([
      {
        id: EXPECTED_FOUNDATION_IDS.ports.onStartNext,
        name: 'Next',
        kind: 'flow',
        direction: 'output',
      },
    ])
    expect(contracts.Branch?.ports).toEqual([
      {
        id: EXPECTED_FOUNDATION_IDS.ports.branchIn,
        name: 'In',
        kind: 'flow',
        direction: 'input',
      },
      {
        id: EXPECTED_FOUNDATION_IDS.ports.branchCondition,
        name: 'Condition',
        kind: 'data',
        direction: 'input',
        type: { kind: 'named', type: BOOL_TYPE, arguments: [] },
      },
      {
        id: EXPECTED_FOUNDATION_IDS.ports.branchTrue,
        name: 'True',
        kind: 'flow',
        direction: 'output',
      },
      {
        id: EXPECTED_FOUNDATION_IDS.ports.branchFalse,
        name: 'False',
        kind: 'flow',
        direction: 'output',
      },
    ])
    expect(contracts.Add?.ports).toEqual([
      {
        id: EXPECTED_FOUNDATION_IDS.ports.addA,
        name: 'A',
        kind: 'data',
        direction: 'input',
        type: { kind: 'named', type: NUMBER_TYPE, arguments: [] },
      },
      {
        id: EXPECTED_FOUNDATION_IDS.ports.addB,
        name: 'B',
        kind: 'data',
        direction: 'input',
        type: { kind: 'named', type: NUMBER_TYPE, arguments: [] },
      },
      {
        id: EXPECTED_FOUNDATION_IDS.ports.addResult,
        name: 'Result',
        kind: 'data',
        direction: 'output',
        type: { kind: 'named', type: NUMBER_TYPE, arguments: [] },
      },
    ])
    expect(contracts['Add Vec3']?.ports).toEqual([
      {
        id: EXPECTED_FOUNDATION_IDS.ports.addVec3A,
        name: 'A',
        kind: 'data',
        direction: 'input',
        type: { kind: 'named', type: VEC3_TYPE, arguments: [] },
      },
      {
        id: EXPECTED_FOUNDATION_IDS.ports.addVec3B,
        name: 'B',
        kind: 'data',
        direction: 'input',
        type: { kind: 'named', type: VEC3_TYPE, arguments: [] },
      },
      {
        id: EXPECTED_FOUNDATION_IDS.ports.addVec3Result,
        name: 'Result',
        kind: 'data',
        direction: 'output',
        type: { kind: 'named', type: VEC3_TYPE, arguments: [] },
      },
    ])
    expect(contracts['Format Number']?.ports).toEqual([
      {
        id: EXPECTED_FOUNDATION_IDS.ports.formatNumberValue,
        name: 'Value',
        kind: 'data',
        direction: 'input',
        type: { kind: 'named', type: NUMBER_TYPE, arguments: [] },
      },
      {
        id: EXPECTED_FOUNDATION_IDS.ports.formatNumberResult,
        name: 'Text',
        kind: 'data',
        direction: 'output',
        type: { kind: 'named', type: STRING_TYPE, arguments: [] },
      },
    ])

    expect(contracts['On Start']?.domains).toEqual(['FrameGameplay'])
    for (const name of ['Branch', 'Add', 'Add Vec3', 'Format Number']) {
      expect(contracts[name]?.domains).toEqual([
        'FixedGameplay',
        'FrameGameplay',
      ])
    }
  })

  it('declares no hidden capabilities or effects and bounded checkpoint metadata', () => {
    for (const { contract } of FOUNDATION_GRAPH_CONTRACTS) {
      expect(contract.capabilities).toEqual([])
      expect(contract.effects).toEqual([])
      expect(contract.reads).toEqual([])
      expect(contract.writes).toEqual([])
      expect(contract.checkpoint).toBe('safe')
      expect(contract.checkpointRole).toBe('none')
      expect(contract.checkpointScope).toBe('bounded')
      expect(contract.asyncCheckpointPolicies).toEqual([])
    }
  })
})
