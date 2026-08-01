import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import test from "node:test";
import { ensureCodexCommandEnv, resolveCodexCommand } from "../lib/resolve-codex-command.mjs";

async function executable(path) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, "#!/bin/sh\nexit 0\n");
  await chmod(path, 0o755);
  return path;
}

test("Codex command resolution preserves explicit overrides and PATH CLI precedence", async () => {
  const root = await mkdtemp(join(tmpdir(), "memorax-code-codex-command-path-"));
  try {
    const bin = join(root, "bin");
    await mkdir(bin, { recursive: true });
    await executable(join(bin, "codex"));
    const appCommand = await executable(join(root, "Applications", "ChatGPT.app", "Contents", "Resources", "codex"));

    assert.deepEqual(resolveCodexCommand({
      env: { PATH: bin, MEMORAX_CODE_CODEX_COMMAND: "/custom/npm-codex" },
      homeDir: root,
      platform: "darwin",
      applicationRoots: [join(root, "Applications")],
    }), { command: "/custom/npm-codex", source: "npm-override" });
    assert.deepEqual(resolveCodexCommand({
      env: { PATH: bin, CODEX_CLI_PATH: "/custom/codex" },
      homeDir: root,
      platform: "darwin",
      applicationRoots: [join(root, "Applications")],
    }), { command: "/custom/codex", source: "configured" });
    assert.deepEqual(resolveCodexCommand({
      env: { PATH: `${bin}${delimiter}/missing` },
      homeDir: root,
      platform: "darwin",
      applicationRoots: [join(root, "Applications")],
    }), { command: "codex", source: "path" });
    assert.ok(appCommand.endsWith("ChatGPT.app/Contents/Resources/codex"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex command resolution uses the desktop App bundled runtime without a PATH CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "memorax-code-codex-command-app-"));
  try {
    const appCommand = await executable(join(root, "Applications", "ChatGPT.app", "Contents", "Resources", "codex"));
    const extensions = join(root, ".vscode", "extensions");
    await vscodeExtension(extensions, "openai.chatgpt-9.9.9-darwin-arm64", {
      publisher: "openai",
      name: "chatgpt",
      version: "9.9.9",
      targetPlatform: "darwin-arm64",
    });
    const env = { PATH: join(root, "empty-bin") };
    const resolved = ensureCodexCommandEnv({
      env,
      homeDir: root,
      platform: "darwin",
      arch: "arm64",
      applicationRoots: [join(root, "Applications")],
      vscodeExtensionRoots: [extensions],
    });

    assert.deepEqual(resolved, { command: appCommand, source: "app-bundled" });
    assert.equal(env.CODEX_CLI_PATH, appCommand);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex command resolution uses the newest matching VS Code bundled runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "memorax-code-codex-command-vscode-"));
  try {
    const extensions = join(root, ".vscode", "extensions");
    await vscodeExtension(extensions, "openai.chatgpt-1.9.0-darwin-arm64", {
      publisher: "openai",
      name: "chatgpt",
      version: "1.9.0",
      targetPlatform: "darwin-arm64",
    });
    const expected = await vscodeExtension(extensions, "openai.chatgpt-1.10.0-darwin-arm64", {
      publisher: "openai",
      name: "chatgpt",
      version: "1.10.0",
      targetPlatform: "darwin-arm64",
    });
    await vscodeExtension(extensions, "openai.chatgpt-9.0.0-linux-x64", {
      publisher: "openai",
      name: "chatgpt",
      version: "9.0.0",
      targetPlatform: "linux-x64",
    });
    await vscodeExtension(extensions, "lookalike.chatgpt-99.0.0-darwin-arm64", {
      publisher: "lookalike",
      name: "chatgpt",
      version: "99.0.0",
      targetPlatform: "darwin-arm64",
    });

    const env = { PATH: join(root, "empty-bin") };
    const resolved = ensureCodexCommandEnv({
      env,
      homeDir: root,
      platform: "darwin",
      arch: "arm64",
      applicationRoots: [join(root, "Applications")],
      vscodeExtensionRoots: [extensions],
    });

    assert.deepEqual(resolved, { command: expected, source: "vscode-bundled" });
    assert.equal(env.CODEX_CLI_PATH, expected);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex command resolution reports unavailable when neither client runtime exists", () => {
  assert.deepEqual(resolveCodexCommand({
    env: { PATH: "/missing" },
    homeDir: "/missing-home",
    platform: "darwin",
    applicationRoots: ["/missing-applications"],
    vscodeExtensionRoots: ["/missing-extensions"],
  }), { command: "codex", source: "unavailable" });
});

async function vscodeExtension(extensionsRoot, directory, {
  publisher,
  name,
  version,
  targetPlatform,
}) {
  const extensionRoot = join(extensionsRoot, directory);
  await mkdir(extensionRoot, { recursive: true });
  await writeFile(join(extensionRoot, "package.json"), `${JSON.stringify({
    publisher,
    name,
    version,
    __metadata: { targetPlatform },
  })}\n`);
  return await executable(join(extensionRoot, "bin", "macos-aarch64", "codex"));
}
