import { lstat, realpath } from "node:fs/promises";
import { posix, win32 } from "node:path";

/**
 * Resolve an npm staging directory and prove that it is a strict descendant
 * of the repository's dist directory before callers perform destructive I/O.
 */
export function resolveSafeNpmStagingOutDir({
  repoRoot,
  outDir = "dist/npm",
  platform = process.platform,
}) {
  const path = platform === "win32" ? win32 : posix;
  const resolvedRepoRoot = path.resolve(repoRoot);
  const distRoot = path.resolve(resolvedRepoRoot, "dist");
  const resolvedOutDir = path.resolve(resolvedRepoRoot, outDir);
  const childPath = path.relative(distRoot, resolvedOutDir);
  if (
    childPath === ""
    || childPath === ".."
    || childPath.startsWith(`..${path.sep}`)
    || path.isAbsolute(childPath)
  ) {
    throw new Error("--out-dir must resolve to a descendant of the repository dist directory");
  }
  return resolvedOutDir;
}

export async function assertSafeNpmStagingRemoval({
  repoRoot,
  outDir = "dist/npm",
  platform = process.platform,
  operations = {},
}) {
  const path = platform === "win32" ? win32 : posix;
  const resolvedRepoRoot = path.resolve(repoRoot);
  const distRoot = path.resolve(resolvedRepoRoot, "dist");
  const resolvedOutDir = resolveSafeNpmStagingOutDir({ repoRoot, outDir, platform });
  const fs = { lstat, realpath, ...operations };
  const relativeParts = path.relative(resolvedRepoRoot, resolvedOutDir).split(path.sep);
  const candidates = [resolvedRepoRoot];
  for (let index = 0; index < relativeParts.length; index += 1) {
    candidates.push(path.join(resolvedRepoRoot, ...relativeParts.slice(0, index + 1)));
  }

  let realRepoRoot;
  let realDistRoot;
  for (const candidate of candidates) {
    let metadata;
    try {
      metadata = await fs.lstat(candidate);
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
    if (metadata.isSymbolicLink()) {
      throw new Error(`refusing to remove npm staging path through a symlink or junction: ${candidate}`);
    }
    const canonical = path.resolve(await fs.realpath(candidate));
    if (candidate === resolvedRepoRoot) {
      realRepoRoot = canonical;
      if (canonical !== resolvedRepoRoot) {
        throw new Error("repository root resolves through a symlink or junction");
      }
    }
    if (!isWithin(path, realRepoRoot, canonical)) {
      throw new Error("npm staging ancestor resolves outside the repository");
    }
    if (candidate === distRoot) realDistRoot = canonical;
    if (realDistRoot && candidate !== resolvedRepoRoot && !isWithin(path, realDistRoot, canonical)) {
      throw new Error("npm staging ancestor resolves outside the repository dist directory");
    }
  }
  return resolvedOutDir;
}

function isWithin(path, root, candidate) {
  if (!root) return false;
  const relative = path.relative(root, candidate);
  return relative === ""
    || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
