import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_BACKEND_URL } from "../../memorax-code-adapter-common/src/backend-connection.mjs";

export { DEFAULT_BACKEND_URL };
export const DEFAULT_TOKEN_ENV = "MEMORAX_CODE_BACKEND_TOKEN";
export function defaultCodexHome(env = process.env) {
  return env.CODEX_HOME || join(homedir(), ".codex");
}

export function defaultMemoraxCodeHome(env = process.env) {
  return env.MEMORAX_CODE_HOME || join(homedir(), ".memorax-code");
}

export function adapterStatePath(memoraxCodeHome, runtime = "codex") {
  return join(memoraxCodeHome, "adapters", runtime, "state.json");
}

export function adapterWorkspaceStatePath(memoraxCodeHome, runtime = "codex") {
  return join(memoraxCodeHome, "adapters", runtime, "workspaces.json");
}

export function adapterSessionRegistryPath(memoraxCodeHome, runtime = "codex") {
  return join(memoraxCodeHome, "adapters", runtime, "session-registry.json");
}

export function normalizeBackendUrl(value = DEFAULT_BACKEND_URL) {
  return value.replace(/\/+$/, "");
}
