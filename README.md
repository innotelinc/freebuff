<div align="center">

# ⬢ ONYX

**The terminal coding agent that runs on *your* gateway.**

Any model. Any provider. No account. No telemetry. No ads.

[Landing Page](https://github.com/innotelinc/freebuff) · [Docs](docs/omniroute.md) · [Docker Quickstart](docs/omniroute-docker.md) · [Report an Issue](https://github.com/innotelinc/freebuff/issues)

</div>

<div align="center">

![License](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)
![Language](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white&style=flat-square)
![Runtime](https://img.shields.io/badge/runtime-Bun-f472b6?logo=bun&logoColor=white&style=flat-square)
![Docker](https://img.shields.io/badge/docker-compose%20ready-2496ED?logo=docker&logoColor=white&style=flat-square)
![Gateway](https://img.shields.io/badge/gateway-OpenAI--compatible-8A2BE2?style=flat-square)
![Telemetry](https://img.shields.io/badge/telemetry-none-00C853?style=flat-square)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-ff69b4?style=flat-square)
[![CI](https://github.com/innotelinc/freebuff/actions/workflows/ci.yml/badge.svg)](https://github.com/innotelinc/freebuff/actions/workflows/ci.yml)
[![Publish Onyx image](https://github.com/innotelinc/freebuff/actions/workflows/publish-image.yml/badge.svg)](https://github.com/innotelinc/freebuff/actions/workflows/publish-image.yml)
[![Release](https://github.com/innotelinc/freebuff/actions/workflows/release.yml/badge.svg)](https://github.com/innotelinc/freebuff/actions/workflows/release.yml)
[![Docker image](https://img.shields.io/badge/ghcr.io-innotelinc%2Fonyx-published-2496ED?logo=docker&logoColor=white&style=flat-square)](https://github.com/innotelinc/freebuff/pkgs/container/onyx)

</div>

---

## What is Onyx?

Onyx is a multi-agent coding agent for your terminal that ditches the hosted
backend entirely. Point it at any **OpenAI-compatible gateway** — OmniRoute,
LiteLLM, OpenRouter, Ollama, vLLM, your own router — and every request goes to
*your* infrastructure:

```
┌──────────────┐        ┌─────────────────────┐        ┌──────────────────┐
│   Onyx TUI   │──────▶│  Your gateway        │──────▶│  Any provider     │
│  (this repo) │ ◀────── │  :20128/v1           │ ◀────── │  free & paid      │
└──────────────┘        └─────────────────────┘        └──────────────────┘
        ▲                          ▲
        └── zero hosted-backend    └── one API key, one endpoint,
            traffic — ever             350+ providers behind it
```

- 🧠 **Specialized agents** — context gathering, planning, editing, review, and
  research agents divide the work instead of one monolithic prompt
- 🔀 **Any model, any agent** — every mode (DEFAULT / LITE / MAX / PLAN) is
  unlocked; route them all through one model or let the gateway decide
- 🐳 **One-command stack** — `docker compose up` brings the gateway, a key
  generator, and Onyx up together
- 🔒 **Nothing leaves the machine** — no analytics, no health pings, no ad
  auctions, no update checks; verified by tests
- ⚡ **Fast & local-first** — built on Bun, tools run in-process, token
  counting is local

## Quick start

### Docker (the whole stack)

```bash
git clone https://github.com/innotelinc/freebuff.git
cd freebuff
docker compose up -d --build omniroute   # start the gateway
docker compose run --rm onyx             # open the Onyx TUI
```

The entrypoint waits for the gateway, **auto-generates an API key**, selects
the free coding model pool (`auto/coding:free`), and drops you into the TUI
with your project mounted at `/workspace`.

Or pull the prebuilt client image instead of building (pinned to the latest
verified release):
`ghcr.io/innotelinc/onyx:v0.1.0` — see
[docs/omniroute-docker.md](docs/omniroute-docker.md). `latest` tracks `main`;
every release gets its own `v*` tag, and CI only publishes after a live
smoke test passes.

### From source (point at any gateway)

```bash
bun install

export OMNIROUTE_BASE_URL='http://localhost:20128/v1'   # your gateway, /v1 included
export OMNIROUTE_API_KEY='...'                          # optional
export OMNIROUTE_MODEL='anthropic/claude-sonnet-4'      # optional: pin one model

bun start-cli
```

That's it — no login, no session admission, no credits. The CLI boots
straight into chat and talks only to your gateway.

## Configuration

| Variable             | Required | What it does                                                        |
| -------------------- | -------- | ------------------------------------------------------------------- |
| `OMNIROUTE_BASE_URL` | yes      | Gateway base URL **including** the version path (`…/v1`)            |
| `OMNIROUTE_API_KEY`  | no       | Bearer token for the gateway (defaults to a local placeholder)      |
| `OMNIROUTE_MODEL`    | no       | Force every agent onto one model id; unset = gateway decides        |

## What gets disabled in gateway mode

Because there is no hosted backend, everything that would have talked to one
is refused locally (and pinned by tests):

| Surface                                  | Behavior in gateway mode        |
| ---------------------------------------- | ------------------------------- |
| PostHog analytics + log mirror           | never created / never ships     |
| Free-session admission, login wall, ads  | switched off                    |
| Usage/subscription/streak queries        | never fire                      |
| Feedback, sponsored proposals            | refuse locally with a message   |
| Health pings, remote agent validation    | local answers only              |
| Self-update + binary downloads           | disabled                        |

Full details in [docs/omniroute.md](docs/omniroute.md).

## Running a gateway

Don't have one? The bundled [OmniRoute](https://github.com/diegosouzapw/OmniRoute)
submodule is pinned and containerized — see
[docs/omniroute-docker.md](docs/omniroute-docker.md) for the two-minute setup,
or bring your own OpenAI-compatible endpoint.

## Project layout

| Path                    | What lives there                          |
| ----------------------- | ----------------------------------------- |
| `cli/`                  | the terminal UI (OpenTUI + React)         |
| `sdk/`                  | the agent SDK — model & backend routing   |
| `common/`               | shared types, tools, schemas, gateway cfg |
| `packages/agent-runtime`| agent loop, tool handlers, web APIs       |
| `agents/`               | bundled agent definitions                 |
| `docker/`               | container entrypoint (key generation)     |
| `docs/`                 | gateway mode + docker guides              |

## Images

The client image is published to GHCR by CI — smoke-tested against a live
gateway, then pushed. Pin to a release tag:

```bash
docker pull ghcr.io/innotelinc/onyx:v0.1.0
```

Releases are cut with **Actions → Release** (enter a version like `0.1.1`);
it tags the repo, opens the GitHub release with generated notes, and the
publish workflow pushes the matching `ghcr.io/innotelinc/onyx:v…` image.
> The GHCR package is currently private — make it public once via
> *your repo → Packages → onyx → Package settings → Danger Zone →*
> *Change visibility* to pull without `docker login`.

## Contributing

This is a TypeScript monorepo built with Bun:

```bash
git clone https://github.com/innotelinc/freebuff.git
cd freebuff
bun install
bun start-cli
```

Run the checks before opening a PR:

```bash
cd cli && bun run typecheck && bun test
```

## License

[Apache-2.0](./LICENSE)
