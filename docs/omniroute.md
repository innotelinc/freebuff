# Self-hosted OmniRoute gateway mode

Set `OMNIROUTE_BASE_URL` to point the CLI at your own OpenAI-compatible
gateway (e.g. an OmniRoute instance) instead of the Codebuff backend. The
gateway owns auth, billing, and model routing — no Codebuff account, free-tier
session admission, or ads involved.

> **Want the whole stack in Docker?** `docker-compose.yml` + `Dockerfile` run
> OmniRoute and Freebuff together with an auto-generated API key and the free
> coding model pool selected for you — see [docs/omniroute-docker.md](omniroute-docker.md).

## How to use

```bash
export OMNIROUTE_BASE_URL='http://localhost:20128/v1'   # required; include the /v1 path
export OMNIROUTE_API_KEY='...'                          # optional bearer token
export OMNIROUTE_MODEL='anthropic/claude-sonnet-4'      # optional: force one model for every call
freebuff
```

- **`OMNIROUTE_BASE_URL`** — gateway base URL **including the version path**
  (e.g. `http://host:20128/v1`). The client appends `/chat/completions` to it,
  the same way the normal path composes `${websiteUrl}/api/v1`. A trailing
  slash is trimmed. Unset/blank means the mode is off and everything behaves as
  before.
- **`OMNIROUTE_API_KEY`** — sent as a `Bearer` token. Gateways that don't
  check auth still receive a non-empty placeholder (`local`) which they ignore,
  so an empty install works out of the box.
- **`OMNIROUTE_MODEL`** — forces every request onto this model id, overriding
  whatever model each agent declares. Leave unset to pass agent model ids
  through verbatim and let the gateway's routing decide.

## What changes in gateway mode

- **Model requests** go straight to `{base}/chat/completions` and never touch
  the Codebuff backend (`sdk/src/impl/model-provider.ts`).
- **Ads are off.** The ad rail, inline ads, and the dock never fetch or render
  (`cli/src/commands/ads.ts`, `cli/src/chat.tsx`,
  `cli/src/components/freebuff-landing-screen.tsx`).
- **No login wall, no session admission.** The free-session gate (model-picker
  landing, session polling, rate limits, country/region checks) is disabled and
  the auth flow resolves a local placeholder identity instead of calling
  `/api/v1/me`. A synthetic auth token keeps the client plumbing happy; it
  never reaches codebuff.com (`cli/src/utils/auth.ts`,
  `cli/src/hooks/use-freebuff-session.ts`, `cli/src/hooks/use-auth-query.ts`).
- **Any agent, any mode.** The agent-mode picker (DEFAULT / LITE / MAX / PLAN)
  and the mode slash commands are unlocked, so every bundled agent runs
  (`cli/src/state/chat-store.ts`, `cli/src/utils/constants.ts`,
  `cli/src/components/agent-mode-toggle.tsx`).
- **Run bookkeeping is local.** `startAgentRun` returns a synthetic
  `omniroute-` run id and `finishAgentRun` is a no-op, so nothing tries to
  register the run with the backend (`sdk/src/impl/database.ts`).
- **No backend health pings, no agent validation uploads.** The SDK's
  `checkConnection` reports connected without touching codebuff.com's
  healthz (the gateway's reachability is established at startup), remote
  agent validation degrades to local-only so `.agents/` definitions never
  leave the machine, and Composio tools refuse locally
  (`sdk/src/client.ts`, `sdk/src/validate-agents.ts`, `sdk/src/composio.ts`).
- **No telemetry leaves the machine.** PostHog analytics is fully disabled:
  the client is never created (even when a key is configured), so events like
  `app_launched` never fire and the container's placeholder key never reaches
  PostHog. The Axiom log mirror (`/api/logs` to the Codebuff backend) and the
  release wrapper's update-failure tracking are gated off too
  (`cli/src/utils/analytics.ts`, `cli/src/utils/log-shipper.ts`,
  `cli/release-core/launcher.js`).
- **No other codebuff.com traffic.** The usage/subscription banners, the
  sponsored-proposal poller, and the Freebuff streak query all gate off the
  free-tier/branding switches, so they never fire with the local token. The
  sponsored-proposal transport itself refuses every read and write in gateway
  mode (`cli/src/utils/sponsored-proposal-api.ts`), and the feedback form
  refuses to POST and explains why (`cli/src/components/feedback-container.tsx`).
- **No self-update.** The release wrapper skips its background update check,
  npm-registry version lookups, and any binary download from codebuff.com in
  gateway mode — a cached binary runs as-is and a missing one is a clear error
  (`cli/release-core/launcher.js`).

## Notes and limits

- The mode is **env-var-driven at startup** — set `OMNIROUTE_BASE_URL` before
  launching the CLI. There is no build flag, so one binary serves both modes.
- Bundled agents and your `.agents/` custom agents load normally. Agents
  fetched from the Codebuff agent store (`publisher/agent` ids) still resolve
  against the backend and will fail without a real account — the model *routing*
  is what moves to your gateway.
- Sponsored proposals, usage/subscription dashboards, and ad credits are
  Codebuff-backend features and stay off in gateway mode.
- The Freebuff branding is untouched; only the free-tier *gates* step aside.