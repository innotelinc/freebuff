/**
 * Self-hosted gateway mode ("OmniRoute mode").
 *
 * Setting `OMNIROUTE_BASE_URL` switches the client from the Codebuff backend
 * to the user's own OpenAI-compatible gateway: model requests go to
 * `{base}/chat/completions`, inline ads are disabled, and the free-session
 * admission gate (login wall, model picker landing, polling) steps aside so
 * any agent runs on any model the gateway serves.
 *
 * The base URL must INCLUDE the version path (e.g. `http://host:20128/v1`);
 * the caller appends the endpoint (`/chat/completions`) to it, the same way
 * the Codebuff path composes `${websiteUrl}/api/v1` with `/chat/completions`.
 *
 * - `OMNIROUTE_API_KEY` — bearer token for the gateway. Gateways that don't
 *   check auth still get a non-empty placeholder (`local`), which they ignore.
 * - `OMNIROUTE_MODEL` — force every request onto this model id, overriding
 *   whatever model each agent declares. When unset, agent model ids pass
 *   through verbatim, so the gateway's routing decides.
 *
 * Deliberately env-var-driven (like `CODEBUFF_BYOK_OPENROUTER`): no build
 * flag, so a single binary can run against either backend, and tests can
 * stub `process.env` without rebuilding.
 */

export const OMNIROUTE_BASE_URL_ENV_VAR = 'OMNIROUTE_BASE_URL'
export const OMNIROUTE_API_KEY_ENV_VAR = 'OMNIROUTE_API_KEY'
export const OMNIROUTE_MODEL_ENV_VAR = 'OMNIROUTE_MODEL'

/** Placeholder account/token where the flow still requires a non-empty string. */
export const OMNIROUTE_LOCAL_USER_ID = 'omniroute-local'
export const OMNIROUTE_LOCAL_TOKEN = 'omniroute-local'
export const OMNIROUTE_RUN_ID_PREFIX = 'omniroute-'

export interface OmnirouteConfig {
  /** Gateway base URL including the version path, no trailing slash. */
  baseUrl: string
  /** Bearer token; undefined means "send the `local` placeholder". */
  apiKey?: string
  /** Force every request onto this model id. */
  model?: string
}

/** The resolved gateway config, or null when the mode is off. */
export function getOmnirouteConfig(): OmnirouteConfig | null {
  const baseUrl = process.env[OMNIROUTE_BASE_URL_ENV_VAR]?.trim()
  if (!baseUrl) return null
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey: process.env[OMNIROUTE_API_KEY_ENV_VAR]?.trim() || undefined,
    model: process.env[OMNIROUTE_MODEL_ENV_VAR]?.trim() || undefined,
  }
}

export function isOmnirouteMode(): boolean {
  return getOmnirouteConfig() !== null
}
