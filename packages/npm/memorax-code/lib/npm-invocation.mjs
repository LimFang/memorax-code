import { existsSync } from "node:fs";
import path from "node:path";

export function resolveNpmInvocation(npmArgs, options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const nodePath = options.nodePath ?? process.execPath;
  const fileExists = options.existsSync ?? existsSync;
  if (platform !== "win32") return { command: "npm", args: npmArgs };
  const pathApi = path.win32;
  const candidates = [
    env.MEMORAX_CODE_NPM_EXEC_PATH,
    env.npm_execpath,
    env.NPM_CLI_JS,
    pathApi.join(pathApi.dirname(nodePath), "node_modules", "npm", "bin", "npm-cli.js"),
    pathApi.join(
      pathApi.dirname(pathApi.dirname(nodePath)),
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    ),
  ].filter((candidate) => typeof candidate === "string" && /\.(?:cjs|js|mjs)$/i.test(candidate));
  const npmCli = candidates.find((candidate) => fileExists(candidate));
  if (npmCli) return { command: nodePath, args: [npmCli, ...npmArgs] };
  throw new Error(
    "npm CLI JavaScript entrypoint was not found; set MEMORAX_CODE_NPM_EXEC_PATH, "
    + "npm_execpath, or NPM_CLI_JS before running memorax-code update",
  );
}
