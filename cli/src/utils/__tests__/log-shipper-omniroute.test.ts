import { afterEach, describe, expect, mock, test } from 'bun:test'

// The log-shipper's sendBatch calls getApiClient().post('/api/logs', ...). We
// mock the API client module so any actual ship attempt is observable (and
// never hits the network). Must be registered before the import below.
const postMock = mock(async () => ({ ok: true, status: 200 }))

mock.module('../codebuff-api', () => ({
  getApiClient: () => ({ post: postMock }),
}))

import { drainClientLogs, enqueueClientLog, flushClientLogs } from '../log-shipper'

import type { LogRecordInput } from '@codebuff/common/schemas/logs'

const ORIGINAL_OMNIROUTE_BASE_URL = process.env.OMNIROUTE_BASE_URL
const ORIGINAL_SHIP_LOGS = process.env.CODEBUFF_SHIP_LOGS

afterEach(() => {
  postMock.mockClear()
  if (ORIGINAL_OMNIROUTE_BASE_URL === undefined) {
    delete process.env.OMNIROUTE_BASE_URL
  } else {
    process.env.OMNIROUTE_BASE_URL = ORIGINAL_OMNIROUTE_BASE_URL
  }
  if (ORIGINAL_SHIP_LOGS === undefined) {
    delete process.env.CODEBUFF_SHIP_LOGS
  } else {
    process.env.CODEBUFF_SHIP_LOGS = ORIGINAL_SHIP_LOGS
  }
})

const record: LogRecordInput = {
  level: 'info',
  event: 'test.event',
  message: 'test',
  data: { test: true },
}

describe('log-shipper in OmniRoute mode', () => {
  test('never ships logs to the Codebuff backend even when shipping is enabled', async () => {
    process.env.OMNIROUTE_BASE_URL = 'http://localhost:20128/v1'
    // Force the would-be-enabled path: without the OmniRoute gate this flag
    // turns shipping on.
    process.env.CODEBUFF_SHIP_LOGS = 'true'

    enqueueClientLog(record)
    await flushClientLogs()
    await drainClientLogs()

    expect(postMock).not.toHaveBeenCalled()
  })

  test('ships logs when OmniRoute mode is off and shipping is enabled', async () => {
    delete process.env.OMNIROUTE_BASE_URL
    process.env.CODEBUFF_SHIP_LOGS = 'true'

    enqueueClientLog(record)
    await flushClientLogs()
    await drainClientLogs()

    expect(postMock).toHaveBeenCalled()
  })
})