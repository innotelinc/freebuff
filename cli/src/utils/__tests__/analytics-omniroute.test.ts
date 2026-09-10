import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { afterEach, describe, expect, mock, test } from 'bun:test'

import {
  flushAnalytics,
  identifyUser,
  initAnalytics,
  resetAnalyticsState,
  trackEvent,
  type AnalyticsDeps,
} from '../analytics'

import type { AnalyticsClientWithIdentify } from '@codebuff/common/analytics-core'

const ORIGINAL_OMNIROUTE_BASE_URL = process.env.OMNIROUTE_BASE_URL

afterEach(() => {
  resetAnalyticsState()
  if (ORIGINAL_OMNIROUTE_BASE_URL === undefined) {
    delete process.env.OMNIROUTE_BASE_URL
  } else {
    process.env.OMNIROUTE_BASE_URL = ORIGINAL_OMNIROUTE_BASE_URL
  }
})

describe('analytics in OmniRoute mode', () => {
  // Production-like deps: PostHog key/host set, prod env. In OmniRoute mode
  // these must never be used — the container's placeholder key must not fire
  // telemetry.
  function createDeps(): AnalyticsDeps & {
    createClient: ReturnType<typeof mock>
  } {
    const createClient = mock(
      (_apiKey: string, _options: unknown): AnalyticsClientWithIdentify => {
        throw new Error('PostHog client must not be created in OmniRoute mode')
      },
    )
    return {
      env: {
        NEXT_PUBLIC_POSTHOG_API_KEY: 'placeholder',
        NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://us.i.posthog.com',
      },
      isProd: true,
      createClient,
      generateAnonymousId: () => 'anon-omniroute-test',
    }
  }

  test('initAnalytics does not create a PostHog client', () => {
    process.env.OMNIROUTE_BASE_URL = 'http://localhost:20128/v1'
    resetAnalyticsState(createDeps())

    expect(() => initAnalytics()).not.toThrow()
  })

  test('trackEvent, identifyUser, and flushAnalytics are no-ops', () => {
    process.env.OMNIROUTE_BASE_URL = 'http://localhost:20128/v1'
    const deps = createDeps()
    resetAnalyticsState(deps)
    initAnalytics()

    // In prod mode these would throw without a client — in OmniRoute mode
    // they must silently no-op.
    expect(trackEvent(AnalyticsEvent.APP_LAUNCHED, { test: true })).toBe(false)
    expect(() => identifyUser('user-123', { email: 'test@example.com' })).not.toThrow()
    expect(() => flushAnalytics()).not.toThrow()

    expect(deps.createClient).not.toHaveBeenCalled()
  })

  test('initAnalytics creates a client when OmniRoute mode is off', () => {
    delete process.env.OMNIROUTE_BASE_URL
    const deps = createDeps()
    resetAnalyticsState(deps)

    // Without OmniRoute mode the normal path runs and tries to create the
    // PostHog client — proving the gate above is what suppresses it.
    expect(() => initAnalytics()).toThrow(
      'PostHog client must not be created in OmniRoute mode',
    )
    expect(deps.createClient).toHaveBeenCalledWith('placeholder', {
      host: 'https://us.i.posthog.com',
      enableExceptionAutocapture: true,
    })
  })
})