import {
  getOmnirouteConfig,
  OMNIROUTE_API_KEY_ENV_VAR,
} from '@codebuff/common/constants/omniroute'

import { useChatStore } from '../state/chat-store'
import { AGENT_MODE_TO_COST_MODE } from '../utils/constants'

/**
 * `/omniroute-status` — show how the self-hosted OmniRoute gateway mode is
 * wired: where requests go, whether a model is forced, and that the free-tier
 * gates are off. Only reachable while `OMNIROUTE_BASE_URL` is set (the
 * registry hides it otherwise), but a graceful off-mode message costs nothing.
 *
 * Returns the message to post; the caller owns chat state.
 */
export function handleOmnirouteStatusCommand(): { message: string } {
  const config = getOmnirouteConfig()
  if (!config) {
    return {
      message:
        'OmniRoute gateway mode is off. Set OMNIROUTE_BASE_URL and relaunch to route models and tools through your own gateway.',
    }
  }

  const mode = useChatStore.getState().agentMode
  const costMode = AGENT_MODE_TO_COST_MODE[mode]
  const modelLine = config.model
    ? `model:       ${config.model} (forced on every request)`
    : 'model:       pass-through (each agent declares its own; the gateway routes)'
  const authLine = config.apiKey
    ? `auth:        configured (${OMNIROUTE_API_KEY_ENV_VAR})`
    : 'auth:        local placeholder — gateways that check auth must set OMNIROUTE_API_KEY'

  return {
    message: [
      'OmniRoute gateway mode is ON',
      `base URL:    ${config.baseUrl}`,
      modelLine,
      authLine,
      `agent mode:  ${mode} (cost mode: ${costMode})`,
      'free gates:  off — any agent, any model; no login or session admission',
      'ads:         off',
      'tools:       routed to the gateway at /tools/<name>',
    ].join('\n'),
  }
}