import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readClientHookShellVersion,
  runClientHookLauncher,
} from "../../memorax-code-adapter-common/src/hooks/client-hook-launcher.mjs";

const COMPONENTS = new Set([
  "capture-cwd",
  "ensure-backend",
  "memory-skill-reminder",
  "memory-writeback",
]);
const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export async function runCodexHookComponent(component) {
  if (!COMPONENTS.has(component)) throw new Error(`unsupported Codex Hook component: ${component}`);
  await runClientHookLauncher({
    client: "codex",
    component,
    debugEnv: "MEMORAX_CODE_CODEX_HOOK_DEBUG",
    fallbackModuleUrl: new URL(`../runtime-hooks/${component}.mjs`, import.meta.url),
    pluginRoot,
    shellVersion: readClientHookShellVersion(pluginRoot),
  });
}
