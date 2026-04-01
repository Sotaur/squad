import type { AgentHostType } from './types.js';

/**
 * User-facing LLM API providers that can back Squad with minimal interaction changes.
 */
export type LlmApiProvider =
  | 'copilot'
  | 'anthropic'
  | 'openai'
  | 'azure-openai'
  | 'google'
  | 'generic-openai-compatible'
  | 'generic-mcp';

export interface LlmApiSelection {
  provider: LlmApiProvider;
  /** Optional provider endpoint, mainly for enterprise or compatible gateways. */
  baseUrl?: string;
  /** Optional environment variable holding the API key/token for this provider. */
  apiKeyEnv?: string;
  /** Optional provider-native model override. */
  model?: string;
  /** Force a specific host adapter if auto mapping should be bypassed. */
  hostOverride?: AgentHostType;
}

/**
 * Resolve a host adapter from a high-level LLM API provider choice.
 */
export function resolveHostTypeForLlmApi(selection: LlmApiSelection): AgentHostType {
  if (selection.hostOverride) return selection.hostOverride;

  switch (selection.provider) {
    case 'copilot':
      return 'copilot';
    case 'anthropic':
      return 'claude';
    case 'openai':
    case 'azure-openai':
      return 'codex';
    case 'google':
    case 'generic-openai-compatible':
    case 'generic-mcp':
      return 'generic-mcp';
  }
}

/**
 * Minimal runtime hints used by adapter factories and diagnostics.
 */
export interface ResolvedLlmApiBinding {
  provider: LlmApiProvider;
  host: AgentHostType;
  model?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
}

export function resolveLlmApiBinding(selection: LlmApiSelection): ResolvedLlmApiBinding {
  return {
    provider: selection.provider,
    host: resolveHostTypeForLlmApi(selection),
    model: selection.model,
    baseUrl: selection.baseUrl,
    apiKeyEnv: selection.apiKeyEnv,
  };
}

export interface LlmApiProviderVerifier {
  isInstalled: (selection: LlmApiSelection) => Promise<boolean> | boolean;
  isCallable: (selection: LlmApiSelection) => Promise<boolean> | boolean;
}

export interface VerifyLlmApiProviderOptions {
  verifier: LlmApiProviderVerifier;
}

/**
 * Verifies that the selected provider is available in the runtime and can be called.
 * Throws actionable errors when verification fails.
 */
export async function verifyLlmApiProvider(
  selection: LlmApiSelection,
  options: VerifyLlmApiProviderOptions,
): Promise<void> {
  const { verifier } = options;
  const providerLabel = selection.provider;

  const installed = await verifier.isInstalled(selection);
  if (!installed) {
    throw new Error(
      `Selected LLM provider "${providerLabel}" is not installed or configured in this runtime.`,
    );
  }

  const callable = await verifier.isCallable(selection);
  if (!callable) {
    throw new Error(
      `Selected LLM provider "${providerLabel}" is installed but not callable. Check authentication, endpoint, and model settings.`,
    );
  }
}
