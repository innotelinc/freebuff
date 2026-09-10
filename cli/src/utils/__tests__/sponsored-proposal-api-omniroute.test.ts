/**
 * The sponsored-proposal transport in OmniRoute mode.
 *
 * In OmniRoute mode there is no Freebuff account to serve a proposal or accept
 * a task, so the whole channel must refuse without ever calling fetch — the
 * local token stays on the machine even if a caller bypasses the ads gate.
 *
 * The mode is env-driven (`OMNIROUTE_BASE_URL`), so these tests set the env
 * var rather than mocking the module — mock.module is process-global and would
 * leak the gate into other test files.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import {
  acceptSponsoredProposal,
  dismissSponsoredProposal,
  fetchSponsoredProposal,
  reportSponsoredProposal,
  reportSponsoredRunState,
  setSponsoredProposalPrefs,
} from '../sponsored-proposal-api'

const ORIGINAL_OMNIROUTE_BASE_URL = process.env.OMNIROUTE_BASE_URL

beforeEach(() => {
  process.env.OMNIROUTE_BASE_URL = 'http://localhost:20128/v1'
})

afterEach(() => {
  if (ORIGINAL_OMNIROUTE_BASE_URL === undefined) {
    delete process.env.OMNIROUTE_BASE_URL
  } else {
    process.env.OMNIROUTE_BASE_URL = ORIGINAL_OMNIROUTE_BASE_URL
  }
})

// Any fetch that fires is a regression: the transport must refuse locally.
const fetchMock = mock(async () => {
  throw new Error('fetch should not be called in OmniRoute mode')
})

const originalFetch = globalThis.fetch

afterEach(() => {
  fetchMock.mockClear()
  globalThis.fetch = originalFetch
})

describe('sponsored-proposal transport in OmniRoute mode', () => {
  test('the read reports authoritative absence without a request', async () => {
    globalThis.fetch = fetchMock as unknown as typeof fetch
    expect(await fetchSponsoredProposal('Acme/Deploys', 'token')).toEqual({
      status: 'absent',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('the prefs write refuses without a request', async () => {
    globalThis.fetch = fetchMock as unknown as typeof fetch
    expect(
      await setSponsoredProposalPrefs({ optedOut: true }, 'token'),
    ).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('accept refuses with a readable reason without a request', async () => {
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const result = await acceptSponsoredProposal('proposal-1', 'token')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(0)
    expect(result.message).toBe(
      'Sponsored proposals are disabled in OmniRoute mode.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('dismiss and report refuse without a request', async () => {
    globalThis.fetch = fetchMock as unknown as typeof fetch
    expect(await dismissSponsoredProposal('proposal-1', 'token')).toBe(false)
    expect(await reportSponsoredProposal('proposal-1', 'token')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('the run-state report refuses without a request', async () => {
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const result = await reportSponsoredRunState(
      'proposal-1',
      'run-token',
      { state: 'running' },
      'token',
    )
    expect(result).toEqual({
      ok: false,
      status: 0,
      message: 'Sponsored proposals are disabled in OmniRoute mode.',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})