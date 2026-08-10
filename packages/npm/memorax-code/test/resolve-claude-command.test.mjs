import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { ensureClaudeCommandEnv, resolveClaudeCommand } from "../lib/resolve-claude-command.mjs";

async function executable(path) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, "#!/bin/sh\nexit 0\n");
  await chmod(path, 0o755);
  return path;
}

test("Claude command resolution preserves an explicit command and PATH CLI precedence", async () => {
  const root = await mkdtemp(join(tmpdir(), "memorax-code-claude-command-path-"));
  try {
    const bin = join(root, "bin");
    await executable(join(bin, "claude"));

    assert.deepEqual(resolveClaudeCommand({
      env: { PATH: bin, MEMORAX_CODE_CLAUDE_COMMAND: "/custom/claude" },
      homeDir: root,
      platform: "darwin",
    }), { command: "/custom/claude", source: "configured" });
    assert.deepEqual(resolveClaudeCommand({
      env: { PATH: bin },
      homeDir: root,
      platform: "darwin",
    }), { command: "claude", source: "path" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Claude command resolution uses the newest Claude Desktop Code runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "memorax-code-claude-command-desktop-"));
  try {
    const desktopRoot = join(root, "Library", "Application Support", "Claude", "claude-code");
    await executable(join(desktopRoot, "2.9.0", "claude.app", "Contents", "MacOS", "claude"));
    const expected = await executable(join(
      desktopRoot,
      "2.10.0",
      "claude.app",
      "Contents",
      "MacOS",
      "claude",
    ));
    await mkdir(join(desktopRoot, "99.0.0"), { recursive: true });

    const env = { PATH: join(root, "empty-bin") };
    const resolved = ensureClaudeCommandEnv({
      env,
      homeDir: root,
      platform: "darwin",
      arch: "arm64",
      desktopCodeRoots: [desktopRoot],
      vscodeExtensionRoots: [],
    });

    assert.deepEqual(resolved, { command: expected, source: "app-bundled" });
    assert.equal(env.MEMORAX_CODE_CLAUDE_COMMAND, expected);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Claude command resolution uses the newest matching VS Code bundled runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "memorax-code-claude-command-vscode-"));
  try {
    const extensions = join(root, ".vscode", "extensions");
    await vscodeExtension(extensions, "anthropic.claude-code-2.9.0-darwin-arm64", {
      publisher: "Anthropic",
      name: "claude-code",
      version: "2.9.0",
      targetPlatform: "darwin-arm64",
    });
    const expected = await vscodeExtension(extensions, "anthropic.claude-code-2.10.0-darwin-arm64", {
      publisher: "Anthropic",
      name: "claude-code",
      version: "2.10.0",
      targetPlatform: "darwin-arm64",
    });
    await vscodeExtension(extensions, "anthropic.claude-code-99.0.0-linux-x64", {
      publisher: "Anthropic",
      name: "claude-code",
      version: "99.0.0",
      targetPlatform: "linux-x64",
    });

    const env = { PATH: join(root, "empty-bin") };
    const resolved = ensureClaudeCommandEnv({
      env,
      homeDir: root,
      platform: "darwin",
      arch: "arm64",
      vscodeExtensionRoots: [extensions],
    });

    assert.deepEqual(resolved, { command: expected, source: "vscode-bundled" });
    assert.equal(env.MEMORAX_CODE_CLAUDE_COMMAND, expected);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Claude command resolution reports unavailable when neither runtime exists", () => {
  assert.deepEqual(resolveClaudeCommand({
    env: { PATH: "/missing" },
    homeDir: "/missing-home",
    platform: "darwin",
    vscodeExtensionRoots: ["/missing-extensions"],
  }), { command: "claude", source: "unavailable" });
});

async function vscodeExtension(extensionsRoot, directory, {
  publisher,
  name,
  version,
  targetPlatform,
}) {
  const extensionRoot = join(extensionsRoot, directory);
  await mkdir(join(extensionRoot, "resources", "native-binary"), { recursive: true });
  await writeFile(join(extensionRoot, "package.json"), `${JSON.stringify({
    publisher,
    name,
    version,
    __metadata: { targetPlatform },
  })}\n`);
  return await executable(join(extensionRoot, "resources", "native-binary", "claude"));
}
