/**
 * Feedback submission in OmniRoute mode.
 *
 * In OmniRoute mode the CLI talks only to the user's own gateway, so feedback
 * must not POST to the Codebuff backend with the local token. The gate lives
 * in FeedbackContainer's submit handler; this renders the real component and
 * clicks the SUBMIT button in both modes.
 *
 * The mode is env-driven (`OMNIROUTE_BASE_URL`), so these tests set the env
 * var rather than mocking the module — mock.module is process-global and would
 * leak the gate into other test files.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'

// A feedback POST that would otherwise leave the machine is observable here.
const feedbackMock = mock(async () => ({ ok: true, status: 200 }))
mock.module('../../utils/codebuff-api', () => ({
  getApiClient: () => ({ feedback: feedbackMock }),
}))

let clipboardMessages: string[] = []
mock.module('../../utils/clipboard', () => ({
  showClipboardMessage: (message: string) => {
    clipboardMessages.push(message)
  },
}))

import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import React from 'react'

import { FeedbackContainer } from '../feedback-container'
import { initializeThemeStore } from '../../hooks/use-theme'
import { useFeedbackStore } from '../../state/feedback-store'

const ORIGINAL_OMNIROUTE_BASE_URL = process.env.OMNIROUTE_BASE_URL

let cleanupRenderer: (() => void) | undefined

beforeAll(() => {
  initializeThemeStore()
})

beforeEach(() => {
  process.env.OMNIROUTE_BASE_URL = 'http://localhost:20128/v1'
  clipboardMessages = []
  feedbackMock.mockClear()
  useFeedbackStore.getState().reset()
})

afterEach(() => {
  cleanupRenderer?.()
  cleanupRenderer = undefined
  if (ORIGINAL_OMNIROUTE_BASE_URL === undefined) {
    delete process.env.OMNIROUTE_BASE_URL
  } else {
    process.env.OMNIROUTE_BASE_URL = ORIGINAL_OMNIROUTE_BASE_URL
  }
})

/**
 * Open the feedback form with some text and mount the container, returning the
 * renderer plus a settle helper that drains both render loops.
 */
const mountFeedback = async () => {
  useFeedbackStore.getState().openFeedbackForMessage(null)
  useFeedbackStore.getState().setFeedbackText('works great')

  const setup = await createTestRenderer({ width: 70, height: 20 })
  const root = createRoot(setup.renderer)
  cleanupRenderer = () => {
    flushSync(() => root.unmount())
    setup.renderer.destroy()
  }

  const inputRef = { current: null }
  flushSync(() =>
    root.render(<FeedbackContainer inputRef={inputRef} width={70} />),
  )
  await setup.renderOnce()

  const settle = async () => {
    await setup.renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await setup.renderOnce()
  }

  return Object.assign(setup, { settle })
}

/** Find the SUBMIT button's cell from the rendered frame and click it. */
const clickSubmit = async (
  setup: Awaited<ReturnType<typeof mountFeedback>>,
) => {
  const lines = setup.captureCharFrame().split('\n')
  let x = -1
  let y = -1
  for (let i = 0; i < lines.length; i++) {
    const idx = lines[i]!.indexOf('SUBMIT')
    if (idx !== -1) {
      y = i
      x = idx
      break
    }
  }
  expect(x).toBeGreaterThanOrEqual(0)
  await setup.mockMouse.click(x, y, 0)
  await setup.settle()
}

describe('feedback submission in OmniRoute mode', () => {
  test('closes the form with a notice and never POSTs to the backend', async () => {
    const setup = await mountFeedback()

    expect(setup.captureCharFrame()).toContain('SUBMIT')
    await clickSubmit(setup)

    expect(feedbackMock).not.toHaveBeenCalled()
    expect(clipboardMessages).toContain(
      'Feedback is disabled in OmniRoute mode',
    )
    expect(useFeedbackStore.getState().feedbackMode).toBe(false)
  })

  test('submits normally when OmniRoute mode is off', async () => {
    delete process.env.OMNIROUTE_BASE_URL
    const setup = await mountFeedback()

    await clickSubmit(setup)

    expect(feedbackMock).toHaveBeenCalledTimes(1)
    expect(clipboardMessages).toContain('Feedback sent!')
    expect(useFeedbackStore.getState().feedbackMode).toBe(false)
  })
})