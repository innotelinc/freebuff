# ─────────────────────────────────────────────────────────────────────────────
# Onyx CLI image — the Onyx TUI wired to your OmniRoute gateway.
#
# The entrypoint (docker/entrypoint.ts) waits for the gateway, auto-generates
# an API key on first run, and forces the free-coding model pool
# (`auto/coding:free`). The gateway itself is a separate service in
# docker-compose.yml.
# ─────────────────────────────────────────────────────────────────────────────
FROM oven/bun:1.3.11-slim

WORKDIR /app

# git: the agent's git tools operate on the mounted project; ca-certificates
# for TLS. Everything else the CLI needs is JS/WASM, so no build toolchain.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# 1) Install the workspace lockfile first, for layer caching. bunfig.toml
#    must be present too — it pins `linker = "hoisted"` (bun's default would
#    nest deps per workspace and break flat resolution at runtime).
COPY package.json bun.lock bunfig.toml ./
COPY agents/package.json ./agents/package.json
COPY cli/package.json ./cli/package.json
COPY common/package.json ./common/package.json
COPY evals/package.json ./evals/package.json
COPY freebuff/package.json ./freebuff/package.json
COPY packages/agent-runtime/package.json ./packages/agent-runtime/package.json
COPY packages/code-map/package.json ./packages/code-map/package.json
COPY packages/llm-providers/package.json ./packages/llm-providers/package.json
COPY scripts/tmux/package.json ./scripts/tmux/package.json
COPY sdk/package.json ./sdk/package.json
RUN bun install --no-progress

# 2) The source (see .dockerignore — the omniroute submodule stays out of this
#    image; it is only a pin for the gateway's published image).
COPY agents ./agents
COPY cli ./cli
COPY common ./common
COPY freebuff ./freebuff
COPY packages ./packages
COPY sdk ./sdk
COPY docker ./docker
RUN chmod +x /app/docker/entrypoint.ts

# Generate the bundled-agents module: a gitignored build artifact that
# local-agent-registry imports at CLI boot (cli/src/agents/
# bundled-agents.generated.ts). Without this the TUI dies with
# "Cannot find module '../agents/bundled-agents.generated'".
RUN cd /app/cli && bun run prebuild:agents

# Onyx branding + gateway defaults. OMNIROUTE_BASE_URL is set by compose
# (the gateway service); the model defaults to OmniRoute's free coding pool.
ENV FREEBUFF_MODE=true \
    OMNIROUTE_MODEL=auto/coding:free \
    WORKDIR=/workspace

ENTRYPOINT ["/app/docker/entrypoint.ts"]
