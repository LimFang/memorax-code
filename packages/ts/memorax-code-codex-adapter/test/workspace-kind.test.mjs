import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";
import { test } from "node:test";
import {
  isCodexManagedTaskWorkspace,
  resolveCodexWorkspaceKind,
} from "../src/workspace-kind.mjs";

test("recognizes canonical Codex Desktop managed task workspaces", async () => {
  const root = await mkdtemp(join(tmpdir(), "memorax-code-codex-workspace-kind-"));
  const managedRoot = join(root, "Documents", "Codex");
  const workspace = join(managedRoot, "2026-07-29", "he-l");
  await mkdir(workspace, { recursive: true });
  try {
    assert.equal(
      isCodexManagedTaskWorkspace(workspace, { managedRoots: [managedRoot] }),
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recognizes the managed layout with POSIX and Windows path semantics", () => {
  assert.equal(
    isCodexManagedTaskWorkspace("/Users/alice/Documents/Codex/2026-07-29/he-l", {
      managedRoots: ["/Users/alice/Documents/Codex"],
      canonicalize: (value) => posix.normalize(value),
      path: posix,
    }),
    true,
  );
  assert.equal(
    isCodexManagedTaskWorkspace("c:/users/ALICE/Documents/Codex/2026-07-29/new-chat/", {
      managedRoots: ["C:\\Users\\Alice\\Documents\\Codex"],
      canonicalize: (value) => win32.normalize(value),
      path: win32,
    }),
    true,
  );
});

test("does not classify ordinary or malformed workspace paths as Codex managed tasks", () => {
  const managedRoot = "/Users/alice/Documents/Codex";
  const canonicalize = (value) => posix.normalize(value);
  for (const path of [
    "/Users/alice/Code/work/demo",
    "/Users/alice/Documents/Codex/demo",
    "/Users/alice/Documents/Codex/2026-02-30/demo",
    "/tmp/Documents/Codex/2026-07-29/demo",
    "/Users/alice/Documents/Codex/2026-07-29/demo/nested",
    "Documents/Codex/2026-07-29/demo",
  ]) {
    assert.equal(
      isCodexManagedTaskWorkspace(path, { managedRoots: [managedRoot], canonicalize }),
      false,
      path,
    );
  }
});

test("does not trust Windows drive or UNC paths outside the managed root", () => {
  const options = {
    managedRoots: ["C:\\Users\\Alice\\Documents\\Codex"],
    canonicalize: (value) => win32.normalize(value),
    path: win32,
  };
  for (const path of [
    "D:\\unrelated\\Documents\\Codex\\2026-07-29\\demo",
    "\\\\server\\share\\Documents\\Codex\\2026-07-29\\demo",
    "C:\\Users\\Alice\\Documents\\Codex\\2026-07-29\\demo\\nested",
  ]) {
    assert.equal(isCodexManagedTaskWorkspace(path, options), false, path);
  }
});

test("rejects a managed-layout symlink that escapes the trusted root", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "memorax-code-codex-workspace-link-"));
  const managedRoot = join(root, "Documents", "Codex");
  const dateRoot = join(managedRoot, "2026-07-29");
  const outside = join(root, "outside-repository");
  const link = join(dateRoot, "linked-task");
  await mkdir(dateRoot, { recursive: true });
  await mkdir(outside, { recursive: true });
  try {
    try {
      await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (error?.code === "EPERM" || error?.code === "EACCES") {
        t.skip(`directory links unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    assert.equal(
      isCodexManagedTaskWorkspace(link, { managedRoots: [managedRoot] }),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("derives projectless only when the Hook does not provide an explicit workspace kind", async () => {
  const root = await mkdtemp(join(tmpdir(), "memorax-code-codex-workspace-resolve-"));
  const managedRoot = join(root, "Documents", "Codex");
  const cwd = join(managedRoot, "2026-07-29", "new-chat");
  await mkdir(cwd, { recursive: true });
  const options = { managedRoots: [managedRoot] };
  try {
    assert.equal(resolveCodexWorkspaceKind({ cwd }, options), "projectless");
    assert.equal(resolveCodexWorkspaceKind({ cwd, workspace_kind: "project" }, options), "project");
    assert.equal(resolveCodexWorkspaceKind({ cwd: root }, options), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
