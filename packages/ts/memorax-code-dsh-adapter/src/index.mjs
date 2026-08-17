import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import backendClient from "./backend-client.mjs";
import { createDshUserMessage } from "./dsh-message.mjs";
import { PLUGIN_NAME, registerMemoraxCodePlugin } from "./plugin.mjs";
import { requireEnabledDshRuntime } from "./runtime-state.mjs";

export const name = PLUGIN_NAME;
export const inject = ["agents", "sessions", "sessionPersistence"];

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export function apply(ctx) {
  try {
    requireEnabledDshRuntime(pluginRoot);
  } catch (error) {
    if (error?.code === "MEMORAX_CODE_DSH_DISABLED") return;
    throw error;
  }
  registerMemoraxCodePlugin(ctx, {
    backendClient,
    createUserMessage: createDshUserMessage,
  });
  void backendClient.ensureReady().catch((error) => {
    if (process.env.MEMORAX_CODE_DSH_DEBUG !== "1") return;
    const detail = error instanceof Error ? error.message : String(error);
    ctx.logger?.warn?.(`memorax-code Backend recovery failed: ${detail}`);
  });
}
