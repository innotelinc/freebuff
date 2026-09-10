import { afterEach, describe, expect, test } from 'bun:test'

import {
  OMNIROUTE_API_KEY_ENV_VAR,
  OMNIROUTE_BASE_URL_ENV_VAR,
  OMNIROUTE_LOCAL_TOKEN,
} from '@codebuff/common/constants/omniroute'

import { callDocsSearchAPI, callWebSearchAPI } from '../llm-api/codebuff-web-api'

import type { ClientEnv, CiEnv } from '@codebuff/common/types/contracts/env'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const env = {
  clientEnv: {
    NEXT_PUBLIC_CODEBUFF_APP_URL: 'https://codebuff.test',
  } as ClientEnv,
  ciEnv: { CODEBUFF_API_KEY: 'sk-codebuff-test' } as CiEnv,
}

const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_FETCH = globalThis.fetch

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  globalThis.fetch = ORIGINAL_FETCH
})

type CapturedRequest = {
  url: string
  headers: Record<string, string>
  body: string
}

/** Installs a fetch stub that records the request and answers with `bodyJson`. */
function stubFetch(bodyJson: unknown): () => CapturedRequest | null {
  let captured: CapturedRequest | null = null
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    captured = {
      url: String(input),
      headers: (init?.headers as Record<string, string>) ?? {},
      body: String(init?.body),
    }
    return new Response(JSON.stringify(bodyJson), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return () => captured
}

describe('omniroute tool routing', () => {
  test('web-search hits the gateway /tools endpoint with the gateway key', async () => {
    process.env[OMNIROUTE_BASE_URL_ENV_VAR] = 'http://localhost:20128/v1'
    process.env[OMNIROUTE_API_KEY_ENV_VAR] = 'sk-omniroute'
    const captured = stubFetch({ result: 'search results' })

    const res = await callWebSearchAPI({
      query: 'free coding models',
      depth: 'standard',
      repoUrl: null,
      fetch: globalThis.fetch,
      logger: noopLogger,
      env,
    })

    expect(res.result).toBe('search results')
    expect(captured()?.url).toBe('http://localhost:20128/v1/tools/web-search')
    expect(captured()?.headers.Authorization).toBe('Bearer sk-omniroute')
    // The Codebuff-specific key header must not advertise the old backend.
    expect(captured()?.headers['x-codebuff-api-key']).toBeUndefined()
    expect(JSON.parse(captured()?.body ?? '{}')).toMatchObject({
      query: 'free coding models',
    })
  })

  test('without OMNIROUTE_API_KEY the local placeholder is sent', async () => {
    process.env[OMNIROUTE_BASE_URL_ENV_VAR] = 'http://localhost:20128/v1'
    delete process.env[OMNIROUTE_API_KEY_ENV_VAR]
    const captured = stubFetch({ result: 'ok' })

    await callWebSearchAPI({
      query: 'test',
      repoUrl: null,
      fetch: globalThis.fetch,
      logger: noopLogger,
      env,
    })

    expect(captured()?.headers.Authorization).toBe(
      `Bearer ${OMNIROUTE_LOCAL_TOKEN}`,
    )
  })

  test('without omniroute mode the request targets the Codebuff backend', async () => {
    delete process.env[OMNIROUTE_BASE_URL_ENV_VAR]
    const captured = stubFetch({ result: 'backend results' })

    await callWebSearchAPI({
      query: 'test',
      repoUrl: null,
      fetch: globalThis.fetch,
      logger: noopLogger,
      env,
    })

    expect(captured()?.url).toBe('https://codebuff.test/api/v1/web-search')
    expect(captured()?.headers.Authorization).toBe('Bearer sk-codebuff-test')
    expect(captured()?.headers['x-codebuff-api-key']).toBe('sk-codebuff-test')
  })

  test('docs-search routes through the gateway too', async () => {
    process.env[OMNIROUTE_BASE_URL_ENV_VAR] = 'http://localhost:20128/v1'
    const captured = stubFetch({ documentation: 'the docs' })

    const res = await callDocsSearchAPI({
      libraryTitle: 'bun',
      repoUrl: null,
      fetch: globalThis.fetch,
      logger: noopLogger,
      env,
    })

    expect(res.documentation).toBe('the docs')
    expect(captured()?.url).toBe('http://localhost:20128/v1/tools/docs-search')
  })
})