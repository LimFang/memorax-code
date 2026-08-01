import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_BACKEND_URL } from "../../memorax-code-adapter-common/src/backend-connection.mjs";

export const RUNTIME = "claude-code";
export { DEFAULT_BACKEND_URL };
export const DEFAULT_TOKEN_ENV = "MEMORAX_CODE_BACKEND_TOKEN";

export function defaultClaudeHome(env = process.env) {
  return env.CLAUDE_CONFIG_DIR || env.CLAUDE_HOME || join(homedir(), ".claude");
}

export function defaultMemoraxCodeHome(env = process.env) {
  return env.MEMORAX_CODE_HOME || join(homedir(), ".memorax-code");
}

export function adapterStatePath(memoraxCodeHome, runtime = RUNTIME) {
  return join(memoraxCodeHome, "adapters", runtime, "state.json");
}

export function adapterWorkspaceStatePath(memoraxCodeHome, runtime = RUNTIME) {
  return join(memoraxCodeHome, "adapters", runtime, "workspaces.json");
}

export function adapterSessionRegistryPath(memoraxCodeHome, runtime = RUNTIME) {
  return join(memoraxCodeHome, "adapters", runtime, "session-registry.json");
}

export function installedMarketplacePath(memoraxCodeHome = defaultMemoraxCodeHome()) {
  if (process.env.MEMORAX_CODE_CLAUDE_MARKETPLACE_ROOT?.trim()) {
    return process.env.MEMORAX_CODE_CLAUDE_MARKETPLACE_ROOT;
  }
  return join(memoraxCodeHome, "lib", "memorax-code-claude-marketplace");
}

export function claudeSettingsPath(claudeHome) {
  return join(claudeHome, "settings.json");
}

export function normalizeBackendUrl(value = DEFAULT_BACKEND_URL) {
  return value.replace(/\/+$/, "");
}

export function tempClaudeHome() {
  return join(tmpdir(), `memorax-code-claude-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}
