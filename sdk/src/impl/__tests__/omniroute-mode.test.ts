import { afterEach, describe, expect, test } from 'bun:test'

import {
  OMNIROUTE_BASE_URL_ENV_VAR,
  OMNIROUTE_LOCAL_USER_ID,
  OMNIROUTE_RUN_ID_PREFIX,
} from '@codebuff/common/constants/omniroute'

import { CodebuffClient } from '../../client'
import { executeComposioToolViaServer } from '../../composio'
import { validateAgents } from '../../validate-agents'
import {
  finishAgentRun,
  getUserInfoFromApiKey,
  startAgentRun,
} from '../database'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const ORIGINAL_ENV = { ...process.env }
// Capture the real fetch at module load: `fetch` and `globalThis.fetch` are the
// same property lookup, so restoring via the bare identifier inside afterEach
// would only ever set the property to itself.
const ORIGINAL_FETCH = globalThis.fetch

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  globalThis.fetch = ORIGINAL_FETCH
})

describe('omniroute mode backend stubs', () => {
  test('getUserInfoFromApiKey resolves identity locally without fetching', async () => {
    process.env[OMNIROUTE_BASE_URL_ENV_VAR] = 'http://localhost:20128/v1'
    let fetched = false
    globalThis.fetch = (() => {
      fetched = true
      throw new Error('fetch must not be called in omniroute mode')
    }) as unknown as typeof fetch

    const userInfo = await getUserInfoFromApiKey({
      apiKey: 'omniroute-local',
      fields: ['id', 'email', 'banned'] as const,
      logger: noopLogger,
    })

    expect(fetched).toBe(false)
    // Every requested column resolves to the local placeholder identity,
    // regardless of its declared column type (id, email, banned, ...).
    expect(userInfo?.id).toBe(OMNIROUTE_LOCAL_USER_ID)
    expect(userInfo?.email).toBe(OMNIROUTE_LOCAL_USER_ID)
  })

  test('startAgentRun returns a synthetic run id without fetching', async () => {
    process.env[OMNIROUTE_BASE_URL_ENV_VAR] = 'http://localhost:20128/v1'
    let fetched = false
    globalThis.fetch = (() => {
      fetched = true
      throw new Error('fetch must not be called in omniroute mode')
    }) as unknown as typeof fetch

    const runId = await startAgentRun({
      apiKey: 'omniroute-local',
      agentId: 'base3',
      ancestorRunIds: [],
      logger: noopLogger,
    })

    expect(fetched).toBe(false)
    expect(runId).toStartWith(OMNIROUTE_RUN_ID_PREFIX)
  })

  test('finishAgentRun resolves without fetching', async () => {
    process.env[OMNIROUTE_BASE_URL_ENV_VAR] = 'http://localhost:20128/v1'
    let fetched = false
    globalThis.fetch = (() => {
      fetched = true
      throw new Error('fetch must not be called in omniroute mode')
    }) as unknown as typeof fetch

    await expect(
      finishAgentRun({
        apiKey: 'omniroute-local',
        userId: undefined,
        runId: 'omniroute-1234',
        status: 'completed',
        totalSteps: 5,
        directCredits: 0,
        totalCredits: 0,
        logger: noopLogger,
      }),
    ).resolves.toBeUndefined()

    expect(fetched).toBe(false)
  })

  test('checkConnection reports connected without fetching', async () => {
    process.env[OMNIROUTE_BASE_URL_ENV_VAR] = 'http://localhost:20128/v1'
    let fetched = false
    globalThis.fetch = (() => {
      fetched = true
      throw new Error('fetch must not be called in omniroute mode')
    }) as unknown as typeof fetch

    const client = new CodebuffClient({ apiKey: 'omniroute-local' })

    await expect(client.checkConnection()).resolves.toBe(true)
    expect(fetched).toBe(false)
  })

  test('validateAgents skips remote validation without fetching', async () => {
    process.env[OMNIROUTE_BASE_URL_ENV_VAR] = 'http://localhost:20128/v1'
    let fetched = false
    globalThis.fetch = (() => {
      fetched = true
      throw new Error('fetch must not be called in omniroute mode')
    }) as unknown as typeof fetch

    // remote: true is what the CLI's message-send gate requests; in OmniRoute
    // mode it must degrade to local validation so agent definitions never
    // leave the machine. An empty set validates clean locally.
    const result = await validateAgents([], { remote: true })

    expect(fetched).toBe(false)
    expect(result.success).toBe(true)
  })

  test('composio execution refuses locally without fetching', async () => {
    process.env[OMNIROUTE_BASE_URL_ENV_VAR] = 'http://localhost:20128/v1'
    let fetched = false
    globalThis.fetch = (() => {
      fetched = true
      throw new Error('fetch must not be called in omniroute mode')
    }) as unknown as typeof fetch

    const output = await executeComposioToolViaServer({
      apiKey: 'omniroute-local',
      toolName: 'composio_search_tools',
      input: {},
    })

    expect(fetched).toBe(false)
    const first = output[0]
    expect(first?.type).toBe('json')
    const message =
      first?.type === 'json' &&
      typeof first.value === 'object' &&
      first.value !== null
        ? String(
            (first.value as { errorMessage?: unknown }).errorMessage ?? '',
          )
        : ''
    expect(message).toContain('Composio tools are not available')
  })

  test('backend calls are untouched when omniroute mode is off', async () => {
    delete process.env[OMNIROUTE_BASE_URL_ENV_VAR]
    // A 401 (non-retryable) surfaces as an auth error, proving the real
    // fetch path — not the local stub — is exercised. The request never
    // reaches a server, but the response is what the stub would have
    // bypassed entirely.
    globalThis.fetch = (() =>
      Promise.resolve(new Response('{}', { status: 401 }))) as unknown as typeof fetch

    await expect(
      getUserInfoFromApiKey({
        apiKey: 'sk-test',
        fields: ['id'] as const,
        logger: noopLogger,
      }),
    ).rejects.toThrow()
  })
})