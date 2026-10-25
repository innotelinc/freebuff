# ONYX in the Innotel Platform Stack

**Role: CodeOps** — The terminal coding agent that runs on your own gateway.

Part of the [Innotel Platform Stack](https://github.com/innotelinc/innotel-platform-stack).
The canonical definition of the stack, its shared layers and their owners lives
there; this file records only what ONYX does inside it.

## Boundaries

### Owns

- the CLI and agent loop
- the local Docker stack
- the gateway-facing client

### Consumes

- OmniRoute or another OpenAI-compatible gateway
- Docker and Bun for the local stack
- Cerulean Vault (deployment secrets, if hosted)

### Does not own

- the model providers
- the gateway (OmniRoute)
- identity (Cerulean)

## Service map

| Component | Technology | Job |
| --- | --- | --- |
| ONYX | Node.js / TypeScript | The terminal coding agent that runs on your own gateway. |
| Identity | Cerulean Authentik | Sign-in and role claims, where the repo has a UI |
| Secrets | Cerulean Vault (KV v2) | Production credentials, referenced as `vault://` |
| Trust | Cerulean | DNS, TLS and the public hostname |
| Edge | NPM Edge | The public route in front of the service |

## In the ecosystem

- **Identity** comes from Cerulean Authentik; this repo holds no second account
  table and no password of its own.
- **Secrets** come from Cerulean Vault. `.env` is local only and is never
  committed; a `vault://` reference is resolved by the deployment.
- **Trust and edge** are Cerulean's and NPM Edge's. This repo does not write DNS
  records or call the NPM API directly.
- **Storage, billing and telephony** belong to ONYX, Magnate and Zeus
  respectively; ONYX consumes them only where the boundaries above say
  so.

## See also

- [README](../README.md)
- [Innotel Platform Stack](https://github.com/innotelinc/innotel-platform-stack)
