#!/usr/bin/env bun
/**
 * Onyx container entrypoint.
 *
 * Wires the container to the OmniRoute gateway service:
 *   1. waits for the gateway to come up,
 *   2. auto-generates an API key on first run (POST /api/keys — open on a
 *      fresh install; the key is reused from the /app/state volume across
 *      restarts),
 *   3. forces the free-coding model pool (OMNIROUTE_MODEL, default
 *      `auto/coding:free` — OmniRoute's auto-routing across free coding
 *      models; override with any model id or combo),
 *   4. execs the Onyx TUI with the mounted project as its working dir.
 */

const GATEWAY_KEY_FILE = '/app/state/omniroute.key'
const CLI_ENTRY = '/app/cli/src/entry.ts'

/**
 * Headless CI smoke (`ONYX_SMOKE=1`): no TTY needed. Waits for the gateway,
 * mints the API key exactly as the TUI path does, then runs one real
 * chat-completion round-trip through the gateway with the `onyx-docker`
 * key. Exit 0 only if the model responds.
 */
async function runSmoke(root: string): Promise<void> {
  const baseUrl = process.env.OMNIROUTE_BASE_URL ?? 'http://omniroute:20128/v1'
  process.env.OMNIROUTE_BASE_URL = baseUrl

  await waitForGateway(root)

  let apiKey = process.env.OMNIROUTE_API_KEY?.trim()
  if (!apiKey) {
    const { existsSync, readFileSync } = await import('node:fs')
    const { mkdir, writeFile } = await import('node:fs/promises')
    if (existsSync(GATEWAY_KEY_FILE)) {
      apiKey = readFileSync(GATEWAY_KEY_FILE, 'utf8').trim()
    } else {
      const minted = await mintKey(root)
      if (minted) {
        apiKey = minted
        await mkdir('/app/state', { recursive: true })
        await writeFile(GATEWAY_KEY_FILE, minted, 'utf8')
      }
    }
  }
  if (!apiKey) {
    console.error('onyx smoke FAIL: no API key available')
    process.exit(1)
  }

  const model = process.env.OMNIROUTE_MODEL?.trim() || 'auto/coding:free'
  console.log(`onyx smoke: POST ${baseUrl}/chat/completions (${model}) …`)
  try {
    const res = await fetch(`${root}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        // Generous budget: free-pool models may be reasoning models that
        // spend tokens on reasoning_content before any visible content.
        max_tokens: 512,
        messages: [{ role: 'user', content: 'Reply with exactly: ONYX-SMOKE-OK' }],
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) {
      console.error(`onyx smoke FAIL: gateway returned ${res.status}: ${await res.text()}`)
      process.exit(1)
    }
    const json = (await res.json()) as {
      choices?: Array<{
        message?: { content?: string | null; reasoning_content?: string | null }
      }>
    }
    const message = json.choices?.[0]?.message
    const content = message?.content?.trim() || ''
    const reasoning = message?.reasoning_content?.trim() || ''
    const reply = content || reasoning
    if (!reply) {
      console.error(`onyx smoke FAIL: empty completion: ${JSON.stringify(json).slice(0, 500)}`)
      process.exit(1)
    }
    const source = content ? 'content' : 'reasoning_content'
    console.log(`onyx smoke ok: model replied (${source}): ${reply.slice(0, 120)}`)

    // Import the agent registry too — the gateway round-trip above doesn't
    // prove the CLI itself starts. cli/src/agents/bundled-agents.generated.ts
    // is a gitignored build artifact imported by local-agent-registry at CLI
    // boot; a missing generated module only surfaces at import time (this
    // bit v0.1.1: "Cannot find module '../agents/bundled-agents.generated'").
    console.log('onyx smoke: booting the CLI runtime …')
    const boot = Bun.spawn(
      [
        process.execPath,
        '-e',
        `const g = await import('/app/cli/src/agents/bundled-agents.generated.ts');` +
          `const r = await import('/app/cli/src/utils/local-agent-registry.ts');` +
          `console.log('registry ok, bundled agents: ' + Object.keys(g.bundledAgents).length +` +
          `', loadAgentDefinitions: ' + (typeof r.loadAgentDefinitions))`,
      ],
      {
        cwd: '/app/cli',
        env: process.env,
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )
    const [bootOut, bootErr, bootCode] = await Promise.all([
      new Response(boot.stdout).text(),
      new Response(boot.stderr).text(),
      boot.exited,
    ])
    if (bootCode !== 0 || !bootOut.includes('registry ok')) {
      console.error(`onyx smoke FAIL: CLI boot failed (exit ${bootCode})\n${bootOut}\n${bootErr}`)
      process.exit(1)
    }
    console.log(`onyx smoke ok: CLI runtime boots (${bootOut.trim().split(': ')[1] ?? ''})`)
    process.exit(0)
  } catch (error) {
    console.error('onyx smoke FAIL:', error)
    process.exit(1)
  }
}

function gatewayRoot(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')
}

async function waitForGateway(root: string, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${root}/api/keys`, { signal: AbortSignal.timeout(5_000) })
      if (res.status < 500) return // up; 401/403 means management auth is enabled
    } catch {
      // not up yet
    }
    await Bun.sleep(2_000)
  }
  console.error(
    `✗ OmniRoute gateway at ${root} did not become reachable within ${Math.round(timeoutMs / 1000)}s`,
  )
  process.exit(1)
}

/**
 * Mint a gateway API key.
 *
 * Fresh installs seed a dashboard password (INITIAL_PASSWORD, default
 * `CHANGEME`) and enable management auth, so the direct POST fails with 401.
 * In that case we log into the dashboard (POST /api/auth/login), capture the
 * session cookie, and mint with it.
 */
async function mintKey(root: string): Promise<string | null> {
  const create = async (headers: Record<string, string>): Promise<string | null> => {
    const res = await fetch(`${root}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ name: 'onyx-docker' }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { key?: string }
    return json.key ?? null
  }

  try {
    const direct = await create({})
    if (direct) return direct

    const password = process.env.OMNIROUTE_INITIAL_PASSWORD?.trim() || 'CHANGEME'
    const login = await fetch(`${root}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!login.ok) {
      console.error(
        `⚠ Dashboard login failed (${login.status}) — could not auto-generate an API key. Set OMNIROUTE_INITIAL_PASSWORD (and JWT_SECRET) to match the gateway, or set OMNIROUTE_API_KEY and restart onyx.`,
      )
      return null
    }
    const setCookie = login.headers.get('set-cookie') ?? ''
    const authToken = setCookie.match(/auth_token=([^;]+)/)?.[1]
    if (!authToken) {
      console.error('⚠ Login succeeded but no session cookie was returned — could not mint an API key.')
      return null
    }
    const withSession = await create({ Cookie: `auth_token=${authToken}` })
    if (withSession) return withSession
    console.error('⚠ Could not mint an API key with the dashboard session — continuing without a key.')
    return null
  } catch (error) {
    console.error('⚠ Could not reach the gateway to mint an API key:', error)
    return null
  }
}

async function main(): Promise<void> {
  const baseUrl = process.env.OMNIROUTE_BASE_URL ?? 'http://omniroute:20128/v1'
  process.env.OMNIROUTE_BASE_URL = baseUrl
  const root = gatewayRoot(baseUrl)

  if (process.env.ONYX_SMOKE === '1') {
    await runSmoke(root)
  }

  await waitForGateway(root)

  let apiKey = process.env.OMNIROUTE_API_KEY?.trim()
  if (!apiKey) {
    const { existsSync, readFileSync } = await import('node:fs')
    const { mkdir, writeFile } = await import('node:fs/promises')
    if (existsSync(GATEWAY_KEY_FILE)) {
      apiKey = readFileSync(GATEWAY_KEY_FILE, 'utf8').trim()
    } else {
      const minted = await mintKey(root)
      if (minted) {
        apiKey = minted
        await mkdir('/app/state', { recursive: true })
        await writeFile(GATEWAY_KEY_FILE, minted, 'utf8')
      }
    }
    if (apiKey) process.env.OMNIROUTE_API_KEY = apiKey
  }

  const model = process.env.OMNIROUTE_MODEL?.trim() || 'auto/coding:free'
  process.env.OMNIROUTE_MODEL = model

  const workdir = process.env.WORKDIR ?? '/workspace'

  // A project volume is normally mounted here; `docker run` without one (or
  // a bad WORKDIR) would otherwise die inside Bun.spawn with a bare ENOENT.
  const { existsSync, mkdirSync } = await import('node:fs')
  if (!existsSync(workdir)) {
    mkdirSync(workdir, { recursive: true })
    console.log(`  note     created missing workdir ${workdir}`)
  }

  console.log(
    [
      'ONYX → OmniRoute',
      `  gateway  ${baseUrl}`,
      `  model    ${model} (auto-routed across free coding models)`,
      apiKey ? '  auth     API key ready' : '  auth     no API key — requests will likely be rejected',
      `  workdir  ${workdir}`,
    ].join('\n'),
  )

  // Hand off to the TUI with the project mounted at WORKDIR.
  const proc = Bun.spawn([process.execPath, CLI_ENTRY, '--cwd', workdir], {
    cwd: workdir,
    env: process.env,
    stdio: ['inherit', 'inherit', 'inherit'],
  })
  process.exit(await proc.exited)
}

await main()

// Ensure this file is treated as an ES module (top-level await).
export {}