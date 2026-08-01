import { existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import {
  adapterSessionRegistryPath,
  adapterWorkspaceStatePath,
  defaultCodexHome,
  defaultMemoraxCodeHome,
} from "./adapter-paths.mjs";
import {
  atomicWriteJson,
  readAdapterState,
  sha256,
  stringOption,
  withJsonFileLock,
} from "./config-utils.mjs";

export function readCodexWorkspaceStatus(options = {}) {
  const memoraxCodeHome = options.memoraxCodeHome ?? defaultMemoraxCodeHome();
  const path = adapterWorkspaceStatePath(memoraxCodeHome, "codex");
  const state = readAdapterState(path);
  const latest = state?.latest && typeof state.latest === "object" ? state.latest : undefined;
  return {
    ok: true,
    path,
    captured: Boolean(latest?.cwd),
    latest,
    sessionCount: state?.sessions && typeof state.sessions === "object" ? Object.keys(state.sessions).length : 0,
    state,
  };
}

export function inspectCodexHistory(options = {}) {
  const codexHome = options.codexHome ?? defaultCodexHome();
  const memoraxCodeHome = options.memoraxCodeHome ?? defaultMemoraxCodeHome();
  const sessionsRoot = join(codexHome, "sessions");
  const nativeSessions = collectSessionFiles(sessionsRoot, codexHome, options);
  const historyPath = join(codexHome, "history.jsonl");
  return {
    ok: true,
    action: "inspect-history",
    codexHome,
    memoraxCodeHome,
    readOnly: true,
    native: {
      sessionsRoot,
      sessionsRootExists: existsSync(sessionsRoot),
      historyPath,
      historyExists: existsSync(historyPath),
      sessionCount: nativeSessions.length,
      sessions: nativeSessions,
    },
    memoraxCode: {
      registryPath: adapterSessionRegistryPath(memoraxCodeHome, "codex"),
      workspaceStatePath: adapterWorkspaceStatePath(memoraxCodeHome, "codex"),
      registryExists: existsSync(adapterSessionRegistryPath(memoraxCodeHome, "codex")),
      workspaceStateExists: existsSync(adapterWorkspaceStatePath(memoraxCodeHome, "codex")),
    },
  };
}

export function readCodexSessionRegistry(options = {}) {
  const memoraxCodeHome = options.memoraxCodeHome ?? defaultMemoraxCodeHome();
  const path = options.registryPath ?? adapterSessionRegistryPath(memoraxCodeHome, "codex");
  const state = readAdapterState(path);
  const rawSessions = state?.sessions && typeof state.sessions === "object" && !Array.isArray(state.sessions)
    ? state.sessions
    : {};
  const sessions = {};
  for (const [key, value] of Object.entries(rawSessions)) {
    if (!value || typeof value !== "object") continue;
    const session = normalizeRegistrySession(key, value);
    if (session) sessions[key] = session;
  }
  return {
    ok: true,
    action: "session-registry",
    path,
    exists: existsSync(path),
    unreadable: Boolean(state?.unreadable),
    state: {
      version: 1,
      runtime: "codex",
      updatedAt: typeof state?.updatedAt === "string" ? state.updatedAt : undefined,
      sessions,
    },
  };
}

export function updateCodexSessionRegistry(options = {}) {
  const memoraxCodeHome = options.memoraxCodeHome ?? defaultMemoraxCodeHome();
  const path = options.registryPath ?? adapterSessionRegistryPath(memoraxCodeHome, "codex");
  const sessionId = stringOption(options.sessionId);
  if (!sessionId) return { ok: false, action: "mark-session", reason: "missing_session_id", message: "--session-id is required", path };
  return withJsonFileLock(path, () => {
    const registry = readCodexSessionRegistry({ ...options, memoraxCodeHome, registryPath: path });
    if (registry.unreadable) {
      return { ok: false, action: "mark-session", reason: "unreadable_registry", message: "session registry is unreadable; inspect it before overwriting", path };
    }
    const existing = registry.state.sessions[sessionId];
    const now = new Date().toISOString();
    const session = {
      ...(existing ?? {}),
      key: sessionId,
      title: stringOption(options.title) ?? existing?.title,
      codexSessionId: stringOption(options.codexSessionId) ?? existing?.codexSessionId ?? sessionId,
      transcriptPath: stringOption(options.transcriptPath) ?? existing?.transcriptPath,
      workspace: stringOption(options.workspace) ?? existing?.workspace,
    };
    const state = {
      version: 1,
      runtime: "codex",
      updatedAt: now,
      sessions: {
        ...registry.state.sessions,
        [sessionId]: session,
      },
    };
    atomicWriteJson(path, state);
    return { ok: true, action: "mark-session", path, session, changed: JSON.stringify(existing) !== JSON.stringify(session) };
  });
}

export function seedExistingCodexSessionsAsNative(options = {}) {
  const codexHome = options.codexHome ?? defaultCodexHome();
  const memoraxCodeHome = options.memoraxCodeHome ?? defaultMemoraxCodeHome();
  const path = options.registryPath ?? adapterSessionRegistryPath(memoraxCodeHome, "codex");
  const initialRegistry = readCodexSessionRegistry({ ...options, memoraxCodeHome, registryPath: path });
  if (initialRegistry.unreadable) return unreadableCodexRegistry(path);
  const history = inspectCodexHistory({ ...options, codexHome, memoraxCodeHome });
  if (options.dryRun) return seedCodexSessions(path, codexHome, initialRegistry, history, false);
  return withJsonFileLock(path, () => {
    const registry = readCodexSessionRegistry({ ...options, memoraxCodeHome, registryPath: path });
    if (registry.unreadable) return unreadableCodexRegistry(path);
    return seedCodexSessions(path, codexHome, registry, history, true);
  });
}

function seedCodexSessions(path, codexHome, registry, history, write) {
  const existingSessions = registry.state.sessions;
  const sessions = { ...existingSessions };
  const now = new Date().toISOString();
  let seeded = 0;
  for (const item of history.native.sessions) {
    if (findExistingRegistrySessionKey(sessions, item)) continue;
    const transcriptPath = join(codexHome, item.relativePath);
    sessions[item.id] = {
      key: item.id,
      codexSessionId: item.id,
      transcriptPath,
    };
    seeded += 1;
  }
  if (write && seeded > 0) {
    atomicWriteJson(path, {
      version: 1,
      runtime: "codex",
      updatedAt: now,
      sessions,
    });
  }
  return { ok: true, action: "seed-native-sessions", path, inspected: history.native.sessionCount, seeded };
}

function unreadableCodexRegistry(path) {
  return {
    ok: false,
    action: "seed-native-sessions",
    reason: "unreadable_registry",
    message: "session registry is unreadable; inspect it before seeding native Codex sessions",
    path,
  };
}

export function readMergedCodexSessions(options = {}) {
  const history = inspectCodexHistory(options);
  const registry = readCodexSessionRegistry(options);
  const workspaceStatus = readCodexWorkspaceStatus(options);
  if (registry.unreadable) {
    return {
      ok: false,
      action: "sessions",
      reason: "unreadable_registry",
      message: "session registry is unreadable; sessions are not merged to avoid hiding or rewriting adapter state",
      codexHome: history.codexHome,
      memoraxCodeHome: history.memoraxCodeHome,
      registryPath: registry.path,
      nativeSessionCount: history.native.sessionCount,
      sessionCount: 0,
      sessions: [],
    };
  }
  const workspaceByKey = workspaceRecordMap(workspaceStatus.state);
  const registeredByCodexId = new Map();
  for (const session of Object.values(registry.state.sessions)) {
    if (session.codexSessionId) registeredByCodexId.set(session.codexSessionId, session);
  }
  const native = history.native.sessions.map((item) => {
    const registered = registeredByCodexId.get(item.id);
    const workspace = findWorkspaceRecord(workspaceByKey, registered?.key, item.id, registered?.transcriptPath, item.relativePath);
    return {
      key: registered?.key ?? item.id,
      title: registered?.title,
      codexSessionId: item.id,
      relativePath: item.relativePath,
      pathHash: item.pathHash,
      sizeBytes: item.sizeBytes,
      modifiedAt: item.modifiedAt,
      workspace: registered?.workspace ?? workspace?.cwd,
      transcriptPath: registered?.transcriptPath ?? workspace?.transcriptPath,
      observedAt: workspace?.capturedAt,
    };
  });
  const sessions = native.sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")));
  return {
    ok: true,
    action: "sessions",
    codexHome: history.codexHome,
    memoraxCodeHome: history.memoraxCodeHome,
    registryPath: registry.path,
    sessionCount: sessions.length,
    sessions,
  };
}

function collectSessionFiles(root, codexHome, options = {}) {
  const requestedMaxFiles = Number(options.maxFiles);
  const requestedMaxDepth = Number(options.maxDepth);
  const maxFiles = Number.isFinite(requestedMaxFiles) ? Math.max(0, Math.floor(requestedMaxFiles)) : 500;
  const maxDepth = Number.isFinite(requestedMaxDepth) ? Math.max(0, Math.floor(requestedMaxDepth)) : 8;
  const files = [];
  walkSessionFiles(root, 0, maxDepth, files, maxFiles);
  return files.map((path) => sessionFileSummary(path, codexHome)).filter(Boolean);
}

function walkSessionFiles(path, depth, maxDepth, files, maxFiles) {
  if (files.length >= maxFiles || depth > maxDepth || !existsSync(path)) return;
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return;
  }
  if (stat.isSymbolicLink()) return;
  if (stat.isFile()) {
    if (/\.(jsonl|json)$/i.test(path)) files.push(path);
    return;
  }
  if (!stat.isDirectory()) return;
  let entries = [];
  try {
    entries = readdirSync(path, { withFileTypes: true });
  } catch {
    return;
  }
  entries
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((entry) => walkSessionFiles(join(path, entry.name), depth + 1, maxDepth, files, maxFiles));
}

function sessionFileSummary(path, codexHome) {
  try {
    const stat = statSync(path);
    const relativePath = relative(codexHome, path);
    const id = basename(path).replace(/\.(jsonl|json)$/i, "");
    return {
      id,
      kind: "codex-session-file",
      relativePath,
      pathHash: sha256(relativePath).slice(0, 16),
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };
  } catch {
    return undefined;
  }
}

function normalizeRegistrySession(key, value) {
  return {
    key,
    title: stringOption(value.title),
    codexSessionId: stringOption(value.codexSessionId),
    transcriptPath: stringOption(value.transcriptPath),
    workspace: stringOption(value.workspace),
  };
}

function workspaceRecordMap(state) {
  const raw = state?.sessions && typeof state.sessions === "object" && !Array.isArray(state.sessions)
    ? state.sessions
    : {};
  const records = new Map();
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    records.set(key, value);
  }
  return records;
}

function findWorkspaceRecord(records, ...keys) {
  for (const key of workspaceLookupKeys(keys)) {
    const record = records.get(key);
    if (record) return record;
  }
  return undefined;
}

function workspaceLookupKeys(keys) {
  const result = new Set();
  for (const key of keys) {
    const value = stringOption(key);
    if (!value) continue;
    result.add(value);
    const base = basename(value).replace(/\.[^.]+$/, "");
    result.add(base);
    if (value.startsWith("codex_")) result.add(value.slice("codex_".length));
    else result.add(`codex_${value}`);
    if (base.startsWith("codex_")) result.add(base.slice("codex_".length));
    else result.add(`codex_${base}`);
  }
  return result;
}

function findExistingRegistrySessionKey(sessions, item) {
  for (const [key, session] of Object.entries(sessions ?? {})) {
    if (key === item.id) return key;
    if (session?.codexSessionId === item.id) return key;
    if (session?.transcriptPath && item.relativePath && String(session.transcriptPath).endsWith(item.relativePath)) return key;
  }
  return undefined;
}
