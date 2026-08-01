import { homedir } from "node:os";
import { join } from "node:path";
import {
  commandOnPath,
  defaultVsCodeExtensionRoots,
  findVsCodeExtensionCommand,
} from "./vscode-extension-command.mjs";

export function resolveClaudeCommand({
  env = process.env,
  homeDir = homedir(),
  platform = process.platform,
  arch = process.arch,
  vscodeExtensionRoots = defaultVsCodeExtensionRoots(homeDir),
} = {}) {
  const configured = nonEmpty(env.MEMORAX_CODE_CLAUDE_COMMAND);
  if (configured) return { command: configured, source: "configured" };

  if (commandOnPath("claude", env.PATH, platform, env.PATHEXT)) {
    return { command: "claude", source: "path" };
  }

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

function nonEmpty(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}
