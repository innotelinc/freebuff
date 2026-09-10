# Onyx + OmniRoute in Docker

Run Onyx entirely on your own hardware: OmniRoute (the gateway) and Onyx (the
CLI) as two containers wired together with an auto-generated API key. No hosted
account, no ads, no free-tier gates — and the gateway routes across OmniRoute's
pool of **free coding models** by default.

The stack lives in the repo root:

- `docker-compose.yml` — `redis` + `omniroute` (the gateway) + `onyx` (the TUI)
- `Dockerfile` — the Onyx CLI image
- `docker/entrypoint.ts` — waits for the gateway, auto-generates an API key on
  first run, and forces the free coding model pool
- `omniroute/` — the OmniRoute source, pinned as a git submodule at `v3.8.50`
  (used to track/reproduce the gateway version; the compose file pulls the
  published `diegosouzapw/omniroute:latest` image)

## Quickstart

```bash
# from the directory you want Onyx to work in — the CLI edits these files
docker compose -f /path/to/this/repo/docker-compose.yml up -d --build omniroute
docker compose -f /path/to/this/repo/docker-compose.yml run --rm onyx
```

Prefer to skip the client build? Pull the published image instead — replace the
`onyx` service's `build:` with `image: ghcr.io/innotelinc/onyx:latest`. CI
publishes it on every change to `main` (`.github/workflows/publish-image.yml`),
but only after the image passes a live smoke test: a real gateway stack is
started and one headless chat-completion round-trip must succeed before the
push to GHCR happens.

### Headless smoke test

The entrypoint doubles as a headless CI gate — no TTY needed. It waits for the
gateway, reuses/mints the API key exactly like the TUI path, and runs one real
chat-completion round-trip through the gateway (reasoning models that spend
their tokens on `reasoning_content` count as a pass):

```bash
docker compose run --rm -T -e ONYX_SMOKE=1 onyx
# onyx smoke: POST http://omniroute:20128/v1/chat/completions (auto/coding:free) …
# onyx smoke ok: model replied (content): ONYX-SMOKE-OK
```

The first run builds the Onyx image and pulls the gateway, then:

1. **waits** for the gateway to become healthy,
2. **auto-generates an API key** (`POST /api/keys` — open on a fresh install)
   and stores it in the `onyx-state` volume so later runs reuse it,
3. **selects the free coding models**: every request uses `auto/coding:free`,
   OmniRoute's auto-routing across connected free-tier coding models
   (keyless providers like OpenCode Free / Felo are pre-wired; add more
   providers in the dashboard at http://localhost:20128),
4. **execs the Onyx TUI** with your project mounted at `/workspace`.

Inside Onyx, `/omniroute-status` shows the wiring.

## What you get

- **Any agent, any model** — the mode picker (DEFAULT / LITE / MAX / PLAN) is
  unlocked and every bundled agent routes through your gateway.
- **No login, no session admission, no ads** — no hosted backend is ever
  called for runs; run bookkeeping stays local.
- **No telemetry leaves the machine** — analytics are disabled (the
  container's placeholder key never fires), and the log mirror is off, so
  nothing reaches any third-party collector.
- **Tools route through the gateway too** — web search, URL reads, and the
  docs/gravity index resolve via `{gateway}/tools/*`.

## Configuration

Everything is optional; the defaults are the point.

| Variable | Default | Meaning |
| --- | --- | --- |
| `OMNIROUTE_MODEL` | `auto/coding:free` | Model id or combo sent on every request. Set to e.g. `auto/coding` (quality-first, free+paid) or a specific provider model |
| `OMNIROUTE_API_KEY` | *(auto-generated)* | Pre-provisioned key; set it to skip generation |
| `OMNIROUTE_INITIAL_PASSWORD` | `CHANGEME` | Gateway dashboard password — **change it** before exposing the gateway beyond localhost |
| `JWT_SECRET` | *(dev placeholder)* | Signs the dashboard session cookie. Set a strong one: `JWT_SECRET=$(openssl rand -hex 32)` in `.env` |
| `OMNIROUTE_PORT` | `20128` | Host port for the gateway dashboard/API (bound to `127.0.0.1` by default) |
| `PROJECT_DIR` | `.` | Host directory mounted into the CLI as `/workspace` |
| `WORKDIR` | `/workspace` | Where the CLI starts inside the container |
| `OMNIROUTE_BASE_PATH` | *(empty)* | Passed through to the gateway |

Set them in a `.env` next to the compose file or inline:

```bash
OMNIROUTE_MODEL=auto/coding docker compose -f … run --rm onyx
```

> **Why `auto/coding:free`?** OmniRoute's `auto/<category>:<tier>` combos
> auto-route requests: `coding` picks the coding model pool and `:free`
> filters to free-tier models (fail-open if none are connected). Leave the
> model alone and Onyx "just works" against every free coding model the
> gateway can reach.

## How the API key is generated

OmniRoute enables management auth on fresh installs (dashboard password
`INITIAL_PASSWORD`, default `CHANGEME`), so the entrypoint can't just POST
`/api/keys` anonymously. It therefore:

1. **logs into the dashboard** — `POST /api/auth/login` with the initial
   password and captures the session cookie (`auth_token`, signed with
   `JWT_SECRET`),
2. **mints the key** — `POST /api/keys` with that session cookie,
3. **stores the key** in the `onyx-state` volume so later runs reuse it
   instead of generating another.

If you pre-set `OMNIROUTE_API_KEY`, generation is skipped entirely.

## Building the gateway from the vendored source

The compose file pulls the published image. To build from the pinned submodule
instead (fully offline/reproducible), edit `docker-compose.yml`:

```yaml
  omniroute:
    build:
      context: ./omniroute
      target: runner-base
    image: omniroute:local
```

(`runner-base` ships without browsers; use `runner-web` if you want
web-cookie providers like Gemini Web.)

## Troubleshooting

- **`docker compose run onyx` opens, but model calls fail with 401/403** —
  key generation failed (wrong `OMNIROUTE_INITIAL_PASSWORD`, or the gateway's
  `JWT_SECRET` changed, invalidating the login). Set
  `OMNIROUTE_API_KEY=sk-…` or fix the password/secret and reset:
  `docker compose down -v && docker compose up -d omniroute`.
- **First run complains the dashboard login failed** — make sure
  `OMNIROUTE_INITIAL_PASSWORD` (compose default `CHANGEME`) matches the
  gateway's actual `INITIAL_PASSWORD`, and that `JWT_SECRET` is set.
- **No free models answer** — the sandbox/gateway needs outbound internet to
  reach the free providers. Add a provider with credentials in the dashboard
  (http://localhost:20128) and it joins the pool automatically.
- **The TUI is garbled or won't start under `docker compose up`** — the TUI
  needs an interactive TTY; use `docker compose run --rm onyx` (never
  `up -d onyx`).
- **Reset everything** — `docker compose down -v` wipes the gateway data and
  the generated key (a fresh key is generated next run).
- **The `.dockerignore` keeps `omniroute/` out of the Onyx image** — that
  submodule exists only to pin/reproduce the gateway version.
