/**
 * OmniRoute-mode launcher gating.
 *
 * In OmniRoute mode the CLI talks only to the user's own gateway, so the
 * release wrapper must not phone home: no npm-registry version lookups, no
 * binary downloads from codebuff.com, no background self-update. These tests
 * pin each gate so a future refactor can't re-arm the network calls.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

// launcher.js requires 'tar' for binary extraction; this snapshot's install
// lacks the package (it ships inside the published cli/release package), so
// stub it — the gated paths under test never extract anything.
mock.module('tar', () => ({ x: () => {} }))

const { createLauncher } = require('../../release-core/launcher.js')

let tempConfigDir: string
let restoreOmnirouteEnv = () => {}
let restoreReleaseEnv = () => {}

beforeEach(() => {
  tempConfigDir = mkdtempSync(join(tmpdir(), 'launcher-omniroute-'))
  const original = process.env.OMNIROUTE_BASE_URL
  restoreOmnirouteEnv = () => {
    if (original === undefined) delete process.env.OMNIROUTE_BASE_URL
    else process.env.OMNIROUTE_BASE_URL = original
  }
  const originalAppUrl = process.env.NEXT_PUBLIC_CODEBUFF_APP_URL
  // The download/release host, unused by the gated paths but required to
  // construct the launcher's HTTP client.
  process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = 'http://127.0.0.1:1'
  restoreReleaseEnv = () => {
    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_CODEBUFF_APP_URL
    } else {
      process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = originalAppUrl
    }
  }
})

afterEach(() => {
  restoreOmnirouteEnv()
  restoreReleaseEnv()
  rmSync(tempConfigDir, { recursive: true, force: true })
})

/**
 * Capture console.error and process.exit like the launcher tests do, but have
 * exit THROW after recording: the launcher's own exit paths are stubbed by
 * these tests, and continuing past an exit would otherwise start a real
 * download. The caller expects the promise to reject with this sentinel.
 */
function captureOutput() {
  const original = {
    error: console.error,
    exit: process.exit,
  }
  const lines: string[] = []
  const exitCodes: (number | undefined)[] = []
  console.error = (...args: unknown[]) => lines.push(args.join(' '))
  ;(process as { exit: unknown }).exit = (code?: number) => {
    exitCodes.push(code)
    throw new Error('process.exit captured')
  }
  return {
    lines,
    exitCodes,
    restore: () => {
      console.error = original.error
      ;(process as { exit: unknown }).exit = original.exit
    },
  }
}

function makeLauncher(extra: Record<string, unknown> = {}) {
  return createLauncher({
    packageName: 'freebuff',
    configDir: tempConfigDir,
    ...extra,
  }).__testing
}

describe('omniroute launcher gating', () => {
  test('getLatestVersion returns null without a registry lookup', async () => {
    process.env.OMNIROUTE_BASE_URL = 'http://localhost:20128/v1'
    const t = makeLauncher()
    expect(await t.getLatestVersion()).toBeNull()
  })

  test('checkForUpdates is inert in omniroute mode', async () => {
    process.env.OMNIROUTE_BASE_URL = 'http://localhost:20128/v1'
    const t = makeLauncher()
    // A live child would normally be stopped when an update is found; with the
    // registry gated off the check must resolve without touching the child.
    const child = {
      exitCode: null,
      signalCode: null,
      removeListener: () => {},
    }
    await t.checkForUpdates(child, () => {})
    expect(child.exitCode).toBeNull()
  })

  test('ensureBinaryReady refuses to download a missing binary', async () => {
    process.env.OMNIROUTE_BASE_URL = 'http://localhost:20128/v1'
    const t = makeLauncher()
    const capture = captureOutput()
    try {
      await expect(t.ensureBinaryReady()).rejects.toThrow(
        'process.exit captured',
      )
    } finally {
      capture.restore()
    }
    expect(capture.exitCodes).toContain(1)
    expect(capture.lines.join('\n')).toContain(
      'OmniRoute mode does not download the binary from codebuff.com',
    )
  })

  test('ensureBinaryReady keeps a cached binary without self-updating', async () => {
    process.env.OMNIROUTE_BASE_URL = 'http://localhost:20128/v1'
    writeFileSync(join(tempConfigDir, 'freebuff'), '#!/bin/sh\n', {
      mode: 0o755,
    })
    writeFileSync(
      join(tempConfigDir, 'freebuff-metadata.json'),
      JSON.stringify({ version: '1.0.0' }),
    )
    // A newer wrapper would normally trigger a synchronous binary repair
    // download; in OmniRoute mode the cached binary must win untouched.
    const t = makeLauncher({ wrapperVersion: '2.0.0' })
    const capture = captureOutput()
    try {
      await t.ensureBinaryReady()
    } finally {
      capture.restore()
    }
    expect(capture.exitCodes).toEqual([])
    expect(capture.lines.join('\n')).not.toContain('Downloading')
  })
})