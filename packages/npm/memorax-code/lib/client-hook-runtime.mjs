import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function stagePackagedClientHookRuntime(options) {
  const runtime = await loadRuntimeModule(options.packageRoot);
  return runtime.stageClientHookRuntimeGeneration(options);
}

export async function activatePackagedClientHookRuntime(options) {
  const runtime = await loadRuntimeModule(options.packageRoot);
  return runtime.activateClientHookRuntimeGeneration(options);
}

export async function preparePackagedClientHookRuntime(options) {
  const runtime = await loadRuntimeModule(options.packageRoot);
  return runtime.prepareClientHookRuntimeGeneration(options);
}

async function loadRuntimeModule(packageRoot) {
  const root = resolve(packageRoot);
  const path = join(
    root,
    "lib",
    "memorax-code-adapter-common",
    "src",
    "hooks",
    "hook-runtime-generation.mjs",
  );
  if (!existsSync(path)) throw new Error("packaged client Hook runtime installer is missing");
  return await import(pathToFileURL(path).href);
}
