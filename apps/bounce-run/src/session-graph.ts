import {
  BOOL_TYPE,
  DETERMINISTIC_GRAPH_CONTRACTS,
  FOUNDATION_GRAPH_IDS,
  NUMBER_TYPE,
  STRING_TYPE,
  namedType,
  type GraphAsset,
  type GraphCallsite,
  type GraphNode,
  type JsonValue,
  type NodeRegistry,
} from '@haku/graph'
import { AUDIO_CLIP_ASSET_TYPE, AUDIO_GRAPH_CONTRACTS } from '@haku/audio'
import { UI_GRAPH_CONTRACTS } from '@haku/ui'
import { BOUNCE_RUN_UI_IDS } from './ui-document.js'

const id = (value: number): string =>
  `b1100000-0000-4000-8000-${value.toString().padStart(12, '0')}`

export const BOUNCE_RUN_SESSION_IDS = {
  graph: id(1),
  nodes: { start: id(10) },
  entries: {
    startSession: id(11),
    pauseSession: id(12),
    resumeSession: id(13),
    failSession: id(14),
    restartSession: id(15),
    collectBonus: id(16),
    renderHighScore: id(17),
    renderScore: id(18),
    awardRouteProgress: id(19),
    audioBusVolume: {
      master: id(20),
      music: id(21),
      sfx: id(22),
      ui: id(23),
    },
    audioBusMuted: {
      master: id(24),
      music: id(25),
      sfx: id(26),
      ui: id(27),
    },
  },
  variables: {
    state: 'session.state',
    true: 'constant.true',
    false: 'constant.false',
    start: 'constant.state.start',
    active: 'constant.state.active',
    paused: 'constant.state.paused',
    gameOver: 'constant.state.game-over',
    score: 'session.score',
    highScore: 'session.high-score',
    routePlatformIndex: 'session.route-platform-index',
    furthestScoredPlatform: 'session.furthest-scored-platform',
    scoreZero: 'constant.score.zero',
    bonusValue: 'constant.score.bonus',
    routeProgressValue: 'constant.score.route-progress',
    audioBusVolume: {
      master: 'audio.master.volume',
      music: 'audio.music.volume',
      sfx: 'audio.sfx.volume',
      ui: 'audio.ui.volume',
    },
    audioBusMuted: {
      master: 'audio.master.muted',
      music: 'audio.music.muted',
      sfx: 'audio.sfx.muted',
      ui: 'audio.ui.muted',
    },
  },
} as const

const AUDIO_CLIPS = {
  landing: 'b1400000-0000-4000-8000-000000000002',
  bonus: 'b1400000-0000-4000-8000-000000000003',
  fail: 'b1400000-0000-4000-8000-000000000004',
  ui: 'b1400000-0000-4000-8000-000000000005',
} as const

function callsites(
  registry: NodeRegistry,
  nodeType: string,
  concreteGeneric?: string,
): GraphCallsite[] {
  return registry.require(nodeType).contract.ports.map((port) => ({
    id: port.id,
    port: port.id,
    kind: port.kind,
    direction: port.direction,
    ...(port.kind === 'data' || port.kind === 'event'
      ? {
          type:
            port.type.kind === 'generic' && concreteGeneric
              ? namedType(concreteGeneric)
              : port.type,
        }
      : {}),
  })) as GraphCallsite[]
}

export function createBounceRunSessionGraph(registry: NodeRegistry): GraphAsset {
  const nodes: GraphNode[] = []
  const connections: GraphAsset['graph']['connections'][number][] = []
  let nextNodeId = 100
  let nextConnectionId = 90_000

  const addNode = (
    type: string,
    properties: Record<string, JsonValue> = {},
    domain: GraphNode['domain'] = 'FrameGameplay',
    fixedId?: string,
    concreteGeneric?: string,
  ): GraphNode => {
    const node: GraphNode = {
      id: fixedId ?? id(nextNodeId++),
      type,
      version: '1',
      callsites: callsites(registry, type, concreteGeneric),
      properties,
      layout: { x: nodes.length * 24, y: nodes.length * 16 },
      domain,
    }
    nodes.push(node)
    return node
  }
  const callsite = (node: GraphNode, port: string): string => {
    const match = node.callsites.find((item) => item.port === port)
    if (!match) throw new Error(`Node ${node.id} has no port ${port}`)
    return match.id
  }
  const connect = (from: GraphNode, fromPort: string, to: GraphNode, toPort: string): void => {
    connections.push({
      id: id(nextConnectionId++),
      from: { node: from.id, callsite: callsite(from, fromPort) },
      to: { node: to.id, callsite: callsite(to, toPort) },
    })
  }
  const variable = (key: string, type: string): GraphNode =>
    addNode(
      DETERMINISTIC_GRAPH_CONTRACTS.getVariable.nodeType,
      { key },
      'FrameGameplay',
      undefined,
      type,
    )
  const appendScoreText = (
    previous: GraphNode,
    previousFlowPort: string,
    source: GraphNode,
    elementId: string,
    prefix: string,
  ): GraphNode => {
    const format = addNode(FOUNDATION_GRAPH_IDS.formatNumber.nodeType, {
      prefix,
      suffix: '',
    })
    connect(
      source,
      DETERMINISTIC_GRAPH_CONTRACTS.getVariable.ports.value,
      format,
      FOUNDATION_GRAPH_IDS.formatNumber.ports.value,
    )
    const setText = addNode(
      UI_GRAPH_CONTRACTS.setText.nodeType,
      { documentId: BOUNCE_RUN_UI_IDS.document, elementId },
      'FrameGameplay',
    )
    connect(previous, previousFlowPort, setText, UI_GRAPH_CONTRACTS.setText.ports.flowIn)
    connect(
      format,
      FOUNDATION_GRAPH_IDS.formatNumber.ports.result,
      setText,
      UI_GRAPH_CONTRACTS.setText.ports.value,
    )
    return setText
  }
  const addSound = (
    previous: GraphNode,
    previousFlowPort: string,
    clip: string,
    bus: 'sfx' | 'ui',
  ): GraphNode => {
    const play = addNode(AUDIO_GRAPH_CONTRACTS.play.nodeType, {
      clip: { $ref: clip, type: AUDIO_CLIP_ASSET_TYPE },
      bus,
      loop: false,
      autoplay: false,
      volume: bus === 'ui' ? 0.65 : 0.8,
      playbackRate: 1,
      spatial: null,
      muted: false,
    })
    connect(previous, previousFlowPort, play, AUDIO_GRAPH_CONTRACTS.play.ports.flowIn)
    return play
  }

  const constantTrue = variable(BOUNCE_RUN_SESSION_IDS.variables.true, BOOL_TYPE)
  const constantFalse = variable(BOUNCE_RUN_SESSION_IDS.variables.false, BOOL_TYPE)
  const scoreZero = variable(BOUNCE_RUN_SESSION_IDS.variables.scoreZero, NUMBER_TYPE)
  const currentScore = variable(BOUNCE_RUN_SESSION_IDS.variables.score, NUMBER_TYPE)
  const highScore = variable(BOUNCE_RUN_SESSION_IDS.variables.highScore, NUMBER_TYPE)
  const stateSources = {
    start: variable(BOUNCE_RUN_SESSION_IDS.variables.start, STRING_TYPE),
    active: variable(BOUNCE_RUN_SESSION_IDS.variables.active, STRING_TYPE),
    paused: variable(BOUNCE_RUN_SESSION_IDS.variables.paused, STRING_TYPE),
    'game-over': variable(BOUNCE_RUN_SESSION_IDS.variables.gameOver, STRING_TYPE),
  } as const

  const transition = (
    state: keyof typeof stateSources,
    visibility: readonly [boolean, boolean, boolean, boolean],
    entryId: string,
    resetScore = false,
    sound?: keyof typeof AUDIO_CLIPS,
  ): GraphNode => {
    const source = stateSources[state]
    const setState = addNode(
      DETERMINISTIC_GRAPH_CONTRACTS.setVariable.nodeType,
      { key: BOUNCE_RUN_SESSION_IDS.variables.state },
      'FrameGameplay',
      undefined,
      STRING_TYPE,
    )
    connect(
      source,
      DETERMINISTIC_GRAPH_CONTRACTS.getVariable.ports.value,
      setState,
      DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.value,
    )

    let previous = setState
    const targets = [
      BOUNCE_RUN_UI_IDS.startPanel,
      BOUNCE_RUN_UI_IDS.hudPanel,
      BOUNCE_RUN_UI_IDS.pausePanel,
      BOUNCE_RUN_UI_IDS.gameOverPanel,
    ] as const
    targets.forEach((elementId, index) => {
      const setVisible = addNode(
        UI_GRAPH_CONTRACTS.setVisible.nodeType,
        { documentId: BOUNCE_RUN_UI_IDS.document, elementId },
        'FrameGameplay',
      )
      connect(
        previous,
        previous === setState
          ? DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.flowOut
          : UI_GRAPH_CONTRACTS.setVisible.ports.flowOut,
        setVisible,
        UI_GRAPH_CONTRACTS.setVisible.ports.flowIn,
      )
      connect(
        visibility[index] ? constantTrue : constantFalse,
        DETERMINISTIC_GRAPH_CONTRACTS.getVariable.ports.value,
        setVisible,
        UI_GRAPH_CONTRACTS.setVisible.ports.value,
      )
      previous = setVisible
    })
    const setText = addNode(
      UI_GRAPH_CONTRACTS.setText.nodeType,
      { documentId: BOUNCE_RUN_UI_IDS.document, elementId: BOUNCE_RUN_UI_IDS.stateText },
      'FrameGameplay',
    )
    connect(
      previous,
      UI_GRAPH_CONTRACTS.setVisible.ports.flowOut,
      setText,
      UI_GRAPH_CONTRACTS.setText.ports.flowIn,
    )
    connect(
      source,
      DETERMINISTIC_GRAPH_CONTRACTS.getVariable.ports.value,
      setText,
      UI_GRAPH_CONTRACTS.setText.ports.value,
    )
    const scoreText = appendScoreText(
      setText,
      UI_GRAPH_CONTRACTS.setText.ports.flowOut,
      currentScore,
      BOUNCE_RUN_UI_IDS.scoreText,
      'Score ',
    )
    appendScoreText(
      scoreText,
      UI_GRAPH_CONTRACTS.setText.ports.flowOut,
      highScore,
      BOUNCE_RUN_UI_IDS.highScoreText,
      'Best ',
    )
    const entry = addNode(FOUNDATION_GRAPH_IDS.onStart.nodeType, {}, 'FrameGameplay', entryId)
    const entryFlow = sound
      ? addSound(
          entry,
          FOUNDATION_GRAPH_IDS.onStart.ports.next,
          AUDIO_CLIPS[sound],
          sound === 'ui' ? 'ui' : 'sfx',
        )
      : entry
    const entryPort = sound
      ? AUDIO_GRAPH_CONTRACTS.play.ports.flowOut
      : FOUNDATION_GRAPH_IDS.onStart.ports.next
    if (resetScore) {
      const clearScore = addNode(
        DETERMINISTIC_GRAPH_CONTRACTS.setVariable.nodeType,
        { key: BOUNCE_RUN_SESSION_IDS.variables.score },
        'FrameGameplay',
        undefined,
        NUMBER_TYPE,
      )
      connect(
        scoreZero,
        DETERMINISTIC_GRAPH_CONTRACTS.getVariable.ports.value,
        clearScore,
        DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.value,
      )
      connect(
        entryFlow,
        entryPort,
        clearScore,
        DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.flowIn,
      )
      const clearRouteProgress = addNode(
        DETERMINISTIC_GRAPH_CONTRACTS.setVariable.nodeType,
        { key: BOUNCE_RUN_SESSION_IDS.variables.furthestScoredPlatform },
        'FrameGameplay',
        undefined,
        NUMBER_TYPE,
      )
      connect(
        scoreZero,
        DETERMINISTIC_GRAPH_CONTRACTS.getVariable.ports.value,
        clearRouteProgress,
        DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.value,
      )
      connect(
        clearScore,
        DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.flowOut,
        clearRouteProgress,
        DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.flowIn,
      )
      connect(
        clearRouteProgress,
        DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.flowOut,
        setState,
        DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.flowIn,
      )
    } else {
      connect(
        entryFlow,
        entryPort,
        setState,
        DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.flowIn,
      )
    }
    return entry
  }

  transition('start', [true, false, false, false], BOUNCE_RUN_SESSION_IDS.nodes.start)
  const startSession = transition(
    'active',
    [false, true, false, false],
    BOUNCE_RUN_SESSION_IDS.entries.startSession,
    true,
    'ui',
  )
  transition(
    'paused',
    [false, false, true, false],
    BOUNCE_RUN_SESSION_IDS.entries.pauseSession,
    false,
    'ui',
  )
  transition(
    'active',
    [false, true, false, false],
    BOUNCE_RUN_SESSION_IDS.entries.resumeSession,
    false,
    'ui',
  )
  transition(
    'game-over',
    [false, false, false, true],
    BOUNCE_RUN_SESSION_IDS.entries.failSession,
    false,
    'fail',
  )
  transition(
    'active',
    [false, true, false, false],
    BOUNCE_RUN_SESSION_IDS.entries.restartSession,
    true,
    'ui',
  )

  const score = variable(BOUNCE_RUN_SESSION_IDS.variables.score, NUMBER_TYPE)
  const bonusValue = variable(BOUNCE_RUN_SESSION_IDS.variables.bonusValue, NUMBER_TYPE)
  const addScore = addNode(FOUNDATION_GRAPH_IDS.add.nodeType)
  connect(
    score,
    DETERMINISTIC_GRAPH_CONTRACTS.getVariable.ports.value,
    addScore,
    FOUNDATION_GRAPH_IDS.add.ports.a,
  )
  connect(
    bonusValue,
    DETERMINISTIC_GRAPH_CONTRACTS.getVariable.ports.value,
    addScore,
    FOUNDATION_GRAPH_IDS.add.ports.b,
  )
  const setScore = addNode(
    DETERMINISTIC_GRAPH_CONTRACTS.setVariable.nodeType,
    { key: BOUNCE_RUN_SESSION_IDS.variables.score },
    'FrameGameplay',
    undefined,
    NUMBER_TYPE,
  )
  connect(
    addScore,
    FOUNDATION_GRAPH_IDS.add.ports.result,
    setScore,
    DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.value,
  )
  const collectBonus = addNode(
    FOUNDATION_GRAPH_IDS.onStart.nodeType,
    {},
    'FrameGameplay',
    BOUNCE_RUN_SESSION_IDS.entries.collectBonus,
  )
  connect(
    addSound(collectBonus, FOUNDATION_GRAPH_IDS.onStart.ports.next, AUDIO_CLIPS.bonus, 'sfx'),
    AUDIO_GRAPH_CONTRACTS.play.ports.flowOut,
    setScore,
    DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.flowIn,
  )

  const routePlatformIndex = variable(
    BOUNCE_RUN_SESSION_IDS.variables.routePlatformIndex,
    NUMBER_TYPE,
  )
  const furthestScoredPlatform = variable(
    BOUNCE_RUN_SESSION_IDS.variables.furthestScoredPlatform,
    NUMBER_TYPE,
  )
  const routeProgressValue = variable(
    BOUNCE_RUN_SESSION_IDS.variables.routeProgressValue,
    NUMBER_TYPE,
  )
  const isNewRouteProgress = addNode(FOUNDATION_GRAPH_IDS.greaterThan.nodeType)
  connect(
    routePlatformIndex,
    DETERMINISTIC_GRAPH_CONTRACTS.getVariable.ports.value,
    isNewRouteProgress,
    FOUNDATION_GRAPH_IDS.greaterThan.ports.a,
  )
  connect(
    furthestScoredPlatform,
    DETERMINISTIC_GRAPH_CONTRACTS.getVariable.ports.value,
    isNewRouteProgress,
    FOUNDATION_GRAPH_IDS.greaterThan.ports.b,
  )
  const routeBranch = addNode(FOUNDATION_GRAPH_IDS.branch.nodeType)
  connect(
    isNewRouteProgress,
    FOUNDATION_GRAPH_IDS.greaterThan.ports.result,
    routeBranch,
    FOUNDATION_GRAPH_IDS.branch.ports.condition,
  )
  const routeAddScore = addNode(FOUNDATION_GRAPH_IDS.add.nodeType)
  connect(
    score,
    DETERMINISTIC_GRAPH_CONTRACTS.getVariable.ports.value,
    routeAddScore,
    FOUNDATION_GRAPH_IDS.add.ports.a,
  )
  connect(
    routeProgressValue,
    DETERMINISTIC_GRAPH_CONTRACTS.getVariable.ports.value,
    routeAddScore,
    FOUNDATION_GRAPH_IDS.add.ports.b,
  )
  const setRouteScore = addNode(
    DETERMINISTIC_GRAPH_CONTRACTS.setVariable.nodeType,
    { key: BOUNCE_RUN_SESSION_IDS.variables.score },
    'FrameGameplay',
    undefined,
    NUMBER_TYPE,
  )
  connect(
    routeAddScore,
    FOUNDATION_GRAPH_IDS.add.ports.result,
    setRouteScore,
    DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.value,
  )
  connect(
    addSound(routeBranch, FOUNDATION_GRAPH_IDS.branch.ports.whenTrue, AUDIO_CLIPS.landing, 'sfx'),
    AUDIO_GRAPH_CONTRACTS.play.ports.flowOut,
    setRouteScore,
    DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.flowIn,
  )
  const setFurthestScoredPlatform = addNode(
    DETERMINISTIC_GRAPH_CONTRACTS.setVariable.nodeType,
    { key: BOUNCE_RUN_SESSION_IDS.variables.furthestScoredPlatform },
    'FrameGameplay',
    undefined,
    NUMBER_TYPE,
  )
  connect(
    routePlatformIndex,
    DETERMINISTIC_GRAPH_CONTRACTS.getVariable.ports.value,
    setFurthestScoredPlatform,
    DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.value,
  )
  connect(
    setRouteScore,
    DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.flowOut,
    setFurthestScoredPlatform,
    DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.flowIn,
  )
  const awardRouteProgress = addNode(
    FOUNDATION_GRAPH_IDS.onStart.nodeType,
    {},
    'FrameGameplay',
    BOUNCE_RUN_SESSION_IDS.entries.awardRouteProgress,
  )
  connect(
    awardRouteProgress,
    FOUNDATION_GRAPH_IDS.onStart.ports.next,
    routeBranch,
    FOUNDATION_GRAPH_IDS.branch.ports.flowIn,
  )
  const renderScore = addNode(
    FOUNDATION_GRAPH_IDS.onStart.nodeType,
    {},
    'FrameGameplay',
    BOUNCE_RUN_SESSION_IDS.entries.renderScore,
  )
  appendScoreText(
    renderScore,
    FOUNDATION_GRAPH_IDS.onStart.ports.next,
    score,
    BOUNCE_RUN_UI_IDS.scoreText,
    'Score ',
  )

  const renderHighScore = addNode(
    FOUNDATION_GRAPH_IDS.onStart.nodeType,
    {},
    'FrameGameplay',
    BOUNCE_RUN_SESSION_IDS.entries.renderHighScore,
  )
  appendScoreText(
    renderHighScore,
    FOUNDATION_GRAPH_IDS.onStart.ports.next,
    highScore,
    BOUNCE_RUN_UI_IDS.highScoreText,
    'Best ',
  )

  for (const bus of ['master', 'music', 'sfx', 'ui'] as const) {
    const volumeSource = variable(BOUNCE_RUN_SESSION_IDS.variables.audioBusVolume[bus], NUMBER_TYPE)
    const setVolume = addNode(AUDIO_GRAPH_CONTRACTS.setBusVolume.nodeType, { bus })
    connect(
      volumeSource,
      DETERMINISTIC_GRAPH_CONTRACTS.getVariable.ports.value,
      setVolume,
      AUDIO_GRAPH_CONTRACTS.setBusVolume.ports.value,
    )
    const volumeEntry = addNode(
      FOUNDATION_GRAPH_IDS.onStart.nodeType,
      {},
      'FrameGameplay',
      BOUNCE_RUN_SESSION_IDS.entries.audioBusVolume[bus],
    )
    connect(
      volumeEntry,
      FOUNDATION_GRAPH_IDS.onStart.ports.next,
      setVolume,
      AUDIO_GRAPH_CONTRACTS.setBusVolume.ports.flowIn,
    )

    const mutedSource = variable(BOUNCE_RUN_SESSION_IDS.variables.audioBusMuted[bus], BOOL_TYPE)
    const setMuted = addNode(AUDIO_GRAPH_CONTRACTS.setBusMuted.nodeType, { bus })
    connect(
      mutedSource,
      DETERMINISTIC_GRAPH_CONTRACTS.getVariable.ports.value,
      setMuted,
      AUDIO_GRAPH_CONTRACTS.setBusMuted.ports.value,
    )
    const mutedEntry = addNode(
      FOUNDATION_GRAPH_IDS.onStart.nodeType,
      {},
      'FrameGameplay',
      BOUNCE_RUN_SESSION_IDS.entries.audioBusMuted[bus],
    )
    connect(
      mutedEntry,
      FOUNDATION_GRAPH_IDS.onStart.ports.next,
      setMuted,
      AUDIO_GRAPH_CONTRACTS.setBusMuted.ports.flowIn,
    )
  }

  return {
    schemaVersion: 1,
    graph: {
      id: BOUNCE_RUN_SESSION_IDS.graph,
      name: 'Bounce Run session orchestration',
      nodes,
      connections,
      publicInterface: { ports: [] },
      metadata: {
        orchestration: 'graph',
        states: ['start', 'active', 'paused', 'game-over'],
        transitions: [
          'start->active',
          'active->paused',
          'paused->active',
          'active->game-over',
          'game-over->active',
          'active->bonus-score',
        ],
        ui: ['start', 'session', 'game-over'],
        entryNodes: {
          start: startSession.id,
          pause: BOUNCE_RUN_SESSION_IDS.entries.pauseSession,
          resume: BOUNCE_RUN_SESSION_IDS.entries.resumeSession,
          fail: BOUNCE_RUN_SESSION_IDS.entries.failSession,
          restart: BOUNCE_RUN_SESSION_IDS.entries.restartSession,
        },
      },
    },
  }
}
