import { afterEach, describe, expect, test } from 'bun:test'

import {
  getOmnirouteConfig,
  isOmnirouteMode,
  OMNIROUTE_API_KEY_ENV_VAR,
  OMNIROUTE_BASE_URL_ENV_VAR,
  OMNIROUTE_MODEL_ENV_VAR,
} from '../omniroute'

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('omniroute mode', () => {
  test('is off when OMNIROUTE_BASE_URL is unset', () => {
    delete process.env[OMNIROUTE_BASE_URL_ENV_VAR]
    delete process.env[OMNIROUTE_API_KEY_ENV_VAR]
    delete process.env[OMNIROUTE_MODEL_ENV_VAR]
    expect(isOmnirouteMode()).toBe(false)
    expect(getOmnirouteConfig()).toBeNull()
  })

  test('is on when OMNIROUTE_BASE_URL is set', () => {
    process.env[OMNIROUTE_BASE_URL_ENV_VAR] = 'http://localhost:20128/v1'
    expect(isOmnirouteMode()).toBe(true)
  })

  test('strips trailing slashes from the base url', () => {
    process.env[OMNIROUTE_BASE_URL_ENV_VAR] = 'http://localhost:20128/v1/'
    expect(getOmnirouteConfig()?.baseUrl).toBe('http://localhost:20128/v1')
  })

  test('carries the optional api key and model override', () => {
    process.env[OMNIROUTE_BASE_URL_ENV_VAR] = 'http://localhost:20128/v1'
    process.env[OMNIROUTE_API_KEY_ENV_VAR] = 'sk-test'
    process.env[OMNIROUTE_MODEL_ENV_VAR] = 'anthropic/claude-sonnet-4'
    expect(getOmnirouteConfig()).toEqual({
      baseUrl: 'http://localhost:20128/v1',
      apiKey: 'sk-test',
      model: 'anthropic/claude-sonnet-4',
    })
  })

  test('a blank base url is treated as off', () => {
    process.env[OMNIROUTE_BASE_URL_ENV_VAR] = '   '
    expect(isOmnirouteMode()).toBe(false)
  })

  test('unset optional env vars are omitted, not empty', () => {
    process.env[OMNIROUTE_BASE_URL_ENV_VAR] = 'http://localhost:20128/v1'
    delete process.env[OMNIROUTE_API_KEY_ENV_VAR]
    delete process.env[OMNIROUTE_MODEL_ENV_VAR]
    expect(getOmnirouteConfig()).toEqual({
      baseUrl: 'http://localhost:20128/v1',
    })
  })
})