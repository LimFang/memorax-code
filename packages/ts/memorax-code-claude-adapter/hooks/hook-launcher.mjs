import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readClientHookShellVersion,
  runClientHookLauncher,
} from "../../memorax-code-adapter-common/src/hooks/client-hook-launcher.mjs";

const COMPONENTS = new Set([
  "capture-cwd",
  "ensure-backend",
  "memory-cli-session",
  "memory-skill-reminder",
  "memory-turn",
]);
const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export async function runClaudeHookComponent(component) {
  if (!COMPONENTS.has(component)) throw new Error(`unsupported Claude Hook component: ${component}`);
  await runClientHookLauncher({
    client: "claude-code",
    component,
    debugEnv: "MEMORAX_CODE_CLAUDE_HOOK_DEBUG",
    fallbackModuleUrl: new URL(`../runtime-hooks/${component}.mjs`, import.meta.url),
    pluginRoot,
    shellVersion: readClientHookShellVersion(pluginRoot),
  });
}
