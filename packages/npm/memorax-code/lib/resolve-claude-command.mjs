import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  commandOnPath,
  defaultVsCodeExtensionRoots,
  findVsCodeExtensionCommand,
  isExecutableCommand,
} from "./vscode-extension-command.mjs";

const CLAUDE_DESKTOP_CODE_RUNTIME_SEGMENTS = ["claude.app", "Contents", "MacOS", "claude"];

export function resolveClaudeCommand({
  env = process.env,
  homeDir = homedir(),
  platform = process.platform,
  arch = process.arch,
  desktopCodeRoots = [join(homeDir, "Library", "Application Support", "Claude", "claude-code")],
  vscodeExtensionRoots = defaultVsCodeExtensionRoots(homeDir),
} = {}) {
  const configured = nonEmpty(env.MEMORAX_CODE_CLAUDE_COMMAND);
  if (configured) return { command: configured, source: "configured" };

  if (commandOnPath("claude", env.PATH, platform, env.PATHEXT)) {
    return { command: "claude", source: "path" };
  }

  const desktopCommand = findClaudeDesktopCodeCommand(desktopCodeRoots, platform);
  if (desktopCommand) return { command: desktopCommand, source: "app-bundled" };

  const vscodeCommand = findVsCodeExtensionCommand({
    extensionId: "anthropic.claude-code",
    extensionRoots: vscodeExtensionRoots,
    platform,
    arch,
    commandCandidates: (extensionRoot) => [
      join(extensionRoot, "resources", "native-binary", platform === "win32" ? "claude.exe" : "claude"),
    ],
  });
  if (vscodeCommand) return { command: vscodeCommand, source: "vscode-bundled" };

  return { command: "claude", source: "unavailable" };
}

export function ensureClaudeCommandEnv(options = {}) {
  const env = options.env ?? process.env;
  const resolved = resolveClaudeCommand({ ...options, env });
  if (resolved.source !== "unavailable") env.MEMORAX_CODE_CLAUDE_COMMAND = resolved.command;
  return resolved;
}

function findClaudeDesktopCodeCommand(roots, platform) {
  if (platform !== "darwin") return undefined;
  for (const root of new Set(roots)) {
    let versions;
    try {
      versions = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry) => entry.name)
        .sort((left, right) => right.localeCompare(left, "en", { numeric: true, sensitivity: "base" }));
    } catch {
      continue;
    }
    for (const version of versions) {
      const command = join(root, version, ...CLAUDE_DESKTOP_CODE_RUNTIME_SEGMENTS);
      if (isExecutableCommand(command, platform)) return command;
    }
  }
  return undefined;
}

function nonEmpty(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}
