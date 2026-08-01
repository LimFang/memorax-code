import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function resolveHookCodexCommand({ env = process.env, pluginRoot } = {}) {
  const explicit = stringValue(env.MEMORAX_CODE_CODEX_COMMAND);
  if (explicit) return explicit;

  const configured = stringValue(env.CODEX_CLI_PATH);
  if (configured) return configured;

  const metadataCommand = readMetadataCommand(stringValue(pluginRoot) ?? stringValue(env.PLUGIN_ROOT));
  if (metadataCommand && commandPathExists(metadataCommand)) return metadataCommand;

  return "codex";
}

function readMetadataCommand(pluginRoot) {
  if (!pluginRoot) return undefined;
  const path = join(pluginRoot, ".memorax-code-package.json");
  if (!existsSync(path)) return undefined;
  try {
    const metadata = JSON.parse(readFileSync(path, "utf8"));
    return stringValue(metadata.codexCommand);
  } catch {
    return undefined;
  }
}

function commandPathExists(command) {
  if (!command.includes("/") && !command.includes("\\")) return true;
  try {
    accessSync(command, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
