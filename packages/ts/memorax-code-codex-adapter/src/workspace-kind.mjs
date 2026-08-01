import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const nativePath = process.platform === "win32" ? win32 : posix;

export function resolveCodexWorkspaceKind(input, options = {}) {
  const explicitKind = stringValue(input?.workspace_kind) ?? stringValue(input?.workspaceKind);
  if (explicitKind) return explicitKind;
  return isCodexManagedTaskWorkspace(stringValue(input?.cwd), options) ? "projectless" : undefined;
}

export function isCodexManagedTaskWorkspace(value, options = {}) {
  const path = options.path ?? nativePath;
  if (!value || !path.isAbsolute(value)) return false;
  const canonicalize = options.canonicalize ?? canonicalPath;
  const workspace = canonicalize(value);
  if (!workspace) return false;
  const roots = options.managedRoots ?? defaultManagedRoots(options.env);
  return roots.some((root) => managedRelativePath(canonicalize(root), workspace, path));
}

function managedRelativePath(root, workspace, pathApi) {
  if (!root || !workspace) return false;
  const path = pathApi.relative(root, workspace);
  if (!path || path.startsWith(`..${pathApi.sep}`) || path === ".." || pathApi.isAbsolute(path)) return false;
  const parts = path.split(pathApi.sep);
  return parts.length === 2 && validIsoDate(parts[0]) && Boolean(parts[1]);
}

function defaultManagedRoots(env = process.env) {
  const home = stringValue(process.platform === "win32" ? env.USERPROFILE : env.HOME)
    ?? stringValue(env.HOME)
    ?? homedir();
  const roots = [nativePath.join(home, "Documents", "Codex")];
  if (process.platform === "win32") {
    for (const key of ["OneDrive", "OneDriveCommercial", "OneDriveConsumer"]) {
      const oneDrive = stringValue(env[key]);
      if (oneDrive) roots.push(nativePath.join(oneDrive, "Documents", "Codex"));
    }
  }
  return [...new Set(roots)];
}

function canonicalPath(value) {
  try {
    return realpathSync(value);
  } catch {
    return undefined;
  }
}

function validIsoDate(value) {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
