import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, win32 } from "node:path";
import test from "node:test";
import {
  ensureCodexCommandEnv,
  resolveCodexCommand,
  resolveWindowsCodexAppCommand,
} from "../lib/resolve-codex-command.mjs";

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

test("Codex command resolution uses the registered Windows App bundled runtime", () => {
  const installLocation = "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.727.6591.0_x64__test";
  const appCommand = win32.join(installLocation, "app", "resources", "codex.exe");
  const calls = [];
  const env = {
    PATH: "C:\\missing-bin",
    PATHEXT: ".EXE;.CMD;.BAT;.COM",
    SystemRoot: "C:\\Windows",
  };
  const resolved = ensureCodexCommandEnv({
    env,
    homeDir: "C:\\Users\\tester",
    platform: "win32",
    arch: "x64",
    vscodeExtensionRoots: [],
    windowsAppQuery(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0, stdout: `\uFEFF${installLocation}\r\n`, stderr: "" };
    },
    windowsPathExists: (candidate, platform) => candidate === appCommand && platform === "win32",
  });

  assert.deepEqual(resolved, { command: appCommand, source: "app-bundled" });
  assert.equal(env.CODEX_CLI_PATH, appCommand);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  assert.deepEqual(calls[0].args.slice(0, 4), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"]);
  assert.match(calls[0].args[4], /Get-AppxPackage -Name 'OpenAI\.Codex'/);
  assert.equal(calls[0].options.timeout, 10_000);
});

test("Windows Codex App resolution ignores failed and malformed package queries", () => {
  const common = {
    env: { SystemRoot: "C:\\Windows" },
    platform: "win32",
    pathExists: () => true,
  };
  assert.equal(resolveWindowsCodexAppCommand({
    ...common,
    spawnSyncImpl: () => ({ status: 1, stdout: "", stderr: "failed" }),
  }), undefined);
  assert.equal(resolveWindowsCodexAppCommand({
    ...common,
    spawnSyncImpl: () => ({ status: 0, stdout: "relative\\OpenAI.Codex\r\n", stderr: "" }),
  }), undefined);
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
