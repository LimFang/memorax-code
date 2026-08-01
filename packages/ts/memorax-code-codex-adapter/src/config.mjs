import { existsSync } from "node:fs";
import { join } from "node:path";
import { activeCodexPluginSkillsRoot } from "../../memorax-code-adapter-common/src/clients/codex-plugin-artifact.mjs";
import {
  DEFAULT_BACKEND_URL,
  adapterStatePath,
  defaultCodexHome,
  defaultMemoraxCodeHome,
  normalizeBackendUrl,
} from "./adapter-paths.mjs";
export {
  DEFAULT_BACKEND_URL,
  DEFAULT_TOKEN_ENV,
  adapterSessionRegistryPath,
  adapterStatePath,
  adapterWorkspaceStatePath,
  defaultCodexHome,
  defaultMemoraxCodeHome,
  normalizeBackendUrl,
} from "./adapter-paths.mjs";
import { seedExistingCodexSessionsAsNative } from "./session-registry.mjs";
export {
  inspectCodexHistory,
  readCodexSessionRegistry,
  readCodexWorkspaceStatus,
  readMergedCodexSessions,
  updateCodexSessionRegistry,
} from "./session-registry.mjs";
import { atomicWriteJson, readAdapterState, stringOption } from "./config-utils.mjs";
export { readAdapterState } from "./config-utils.mjs";

const CODEX_ADAPTER_STATE_VERSION = 1;
const CODEX_INTEGRATION = "hooks";
const CODEX_MEMORY_SKILL = "memorax-code";

export function enableCodexAdapter(options = {}) {
  const codexHome = options.codexHome ?? defaultCodexHome();
  const memoraxCodeHome = options.memoraxCodeHome ?? defaultMemoraxCodeHome();
  const statePath = options.statePath ?? adapterStatePath(memoraxCodeHome, "codex");
  const previousState = readAdapterState(statePath);
  if (previousState?.unreadable) {
    return { ok: false, action: "enable", reason: "state_unreadable", statePath };
  }
  if (previousState && previousState.version !== CODEX_ADAPTER_STATE_VERSION) {
    return {
      ok: false,
      action: "enable",
      reason: "state_version_unsupported",
      statePath,
      expectedVersion: CODEX_ADAPTER_STATE_VERSION,
      actualVersion: previousState.version,
    };
  }

  const nativeBaseline = seedExistingCodexSessionsAsNative({ ...options, codexHome, memoraxCodeHome, dryRun: true });
  const codexPluginSkillsRoot = stringOption(options.codexPluginSkillsRoot);
  const codexSkills = codexPluginSkillsSummary(codexHome, codexPluginSkillsRoot);
  if (codexSkills.ok === false) {
    return { ok: false, action: "enable", reason: "skill_delivery_failed", statePath, codexSkills };
  }
  const state = {
    version: CODEX_ADAPTER_STATE_VERSION,
    runtime: "codex",
    integration: CODEX_INTEGRATION,
    enabled: true,
    enabledAt: previousState?.enabled === true && stringOption(previousState.enabledAt)
      ? previousState.enabledAt
      : new Date().toISOString(),
    codexHome,
    backendUrl: normalizeBackendUrl(
      options.backendUrl
        ?? previousState?.backendUrl
        ?? DEFAULT_BACKEND_URL,
    ),
    codexSkillDelivery: "plugin",
    ...(codexPluginSkillsRoot
      ? { codexPluginSkillsRoot }
      : {}),
  };
  atomicWriteJson(statePath, state);
  const seededNativeSessions = nativeBaseline.ok
    ? seedExistingCodexSessionsAsNative({ ...options, codexHome, memoraxCodeHome })
    : { ...nativeBaseline, skipped: true };
  return {
    ok: true,
    action: "enable",
    codexHome,
    memoraxCodeHome,
    statePath,
    state,
    installed: true,
    enabled: true,
    integration: CODEX_INTEGRATION,
    changed: previousState?.enabled !== true || previousState?.integration !== CODEX_INTEGRATION || codexSkills.counts?.changed > 0,
    seededNativeSessions,
    codexSkills,
  };
}

export function disableCodexAdapter(options = {}) {
  const codexHome = options.codexHome ?? defaultCodexHome();
  const memoraxCodeHome = options.memoraxCodeHome ?? defaultMemoraxCodeHome();
  const statePath = options.statePath ?? adapterStatePath(memoraxCodeHome, "codex");
  const previousState = readAdapterState(statePath);
  if (previousState?.unreadable) {
    return { ok: false, action: "disable", reason: "state_unreadable", statePath };
  }
  if (previousState && previousState.version !== CODEX_ADAPTER_STATE_VERSION) {
    return {
      ok: false,
      action: "disable",
      reason: "state_version_unsupported",
      statePath,
      expectedVersion: CODEX_ADAPTER_STATE_VERSION,
      actualVersion: previousState.version,
    };
  }
  const codexSkills = codexPluginSkillsSummary(
    codexHome,
    stringOption(options.codexPluginSkillsRoot) ?? stringOption(previousState?.codexPluginSkillsRoot),
  );
  const state = {
    version: CODEX_ADAPTER_STATE_VERSION,
    runtime: "codex",
    integration: CODEX_INTEGRATION,
    enabled: false,
    disabledAt: new Date().toISOString(),
    codexHome,
    backendUrl: normalizeBackendUrl(
      options.backendUrl
        ?? previousState?.backendUrl
        ?? DEFAULT_BACKEND_URL,
    ),
  };
  atomicWriteJson(statePath, state);
  return {
    ok: true,
    action: "disable",
    codexHome,
    memoraxCodeHome,
    statePath,
    state,
    installed: false,
    enabled: false,
    integration: CODEX_INTEGRATION,
    changed: previousState?.enabled === true,
    codexSkills,
  };
}

export function readCodexAdapterStatus(options = {}) {
  const codexHome = options.codexHome ?? defaultCodexHome();
  const memoraxCodeHome = options.memoraxCodeHome ?? defaultMemoraxCodeHome();
  const statePath = options.statePath ?? adapterStatePath(memoraxCodeHome, "codex");
  const state = readAdapterState(statePath);
  const enabled = state?.unreadable !== true
    && state?.version === CODEX_ADAPTER_STATE_VERSION
    && state?.enabled === true
    && state?.integration === CODEX_INTEGRATION;
  const configuredBackendUrl = stringOption(state?.backendUrl)
    ? normalizeBackendUrl(state.backendUrl)
    : undefined;
  const expectedBackendUrl = stringOption(options.backendUrl)
    ? normalizeBackendUrl(options.backendUrl)
    : undefined;
  return {
    ok: true,
    action: "status",
    codexHome,
    memoraxCodeHome,
    statePath,
    state,
    installed: enabled,
    enabled,
    integration: CODEX_INTEGRATION,
    memoryIntegration: CODEX_INTEGRATION,
    configuredBackendUrl,
    expectedBackendUrl,
    backendUrlMatches: !expectedBackendUrl
      || configuredBackendUrl === expectedBackendUrl
      || (!configuredBackendUrl && !enabled),
    codexSkills: codexPluginSkillsSummary(
      codexHome,
      stringOption(options.codexPluginSkillsRoot) ?? stringOption(state?.codexPluginSkillsRoot),
    ),
  };
}

function codexPluginSkillsSummary(codexHome, explicitRootPath) {
  const cacheRoot = codexPluginCacheRoot(codexHome);
  const rootPath = explicitRootPath ?? activeCodexPluginSkillsRoot(codexHome) ?? cacheRoot;
  const sourcePath = join(rootPath, CODEX_MEMORY_SKILL);
  const ready = existsSync(join(sourcePath, "SKILL.md"));
  const skills = [{
    name: CODEX_MEMORY_SKILL,
    sourcePath,
    targetPath: "",
    sourceKind: "plugin",
    sourceExists: ready,
    targetExists: false,
    targetIsSymlink: false,
    ok: ready,
    status: ready ? "plugin-managed" : "missing",
  }];
  return {
    ok: ready,
    status: ready ? "plugin-managed" : "missing",
    delivery: "plugin",
    rootPath,
    skills,
    counts: {
      total: 1,
      linked: 0,
      missing: ready ? 0 : 1,
      conflict: 0,
      sourceMissing: ready ? 0 : 1,
      failed: 0,
      changed: 0,
      removed: 0,
    },
  };
}

function codexPluginCacheRoot(codexHome) {
  return join(codexHome, "plugins", "cache", "memorax-code", "memorax-code-codex-adapter");
}
