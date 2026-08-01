import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MARKETPLACE_NAME = "memorax-code";
const PLUGIN_NAME = "memorax-code-codex-adapter";
const MEMORY_SKILL_NAME = "memorax-code";

export function isCompleteCodexPluginArtifact(pluginRoot) {
  return existsSync(join(pluginRoot, ".codex-plugin", "plugin.json"))
    && existsSync(join(pluginRoot, "skills", MEMORY_SKILL_NAME, "SKILL.md"));
}

export function activeCodexPluginRoot(codexHome) {
  const cacheRoot = join(codexHome, "plugins", "cache", MARKETPLACE_NAME, PLUGIN_NAME);
  for (const version of directoryNames(cacheRoot).sort((left, right) => (
    right.localeCompare(left, undefined, { numeric: true, sensitivity: "base" })
  ))) {
    const pluginRoot = join(cacheRoot, version);
    if (isCompleteCodexPluginArtifact(pluginRoot)) return pluginRoot;
  }
  return undefined;
}

export function activeCodexPluginSkillsRoot(codexHome) {
  const pluginRoot = activeCodexPluginRoot(codexHome);
  return pluginRoot ? join(pluginRoot, "skills") : undefined;
}

function directoryNames(rootPath) {
  try {
    return readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}
