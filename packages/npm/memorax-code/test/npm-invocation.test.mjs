import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { resolveNpmInvocation } from "../lib/npm-invocation.mjs";

test("Windows npm invocation runs npm CLI through the current Node executable", () => {
  const npmCli = "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js";
  assert.deepEqual(resolveNpmInvocation(["install", "-g", "pkg"], {
    env: { npm_execpath: npmCli },
    platform: "win32",
    nodePath: "C:\\Program Files\\nodejs\\node.exe",
    existsSync: (candidate) => candidate === npmCli,
  }), {
    command: "C:\\Program Files\\nodejs\\node.exe",
    args: [npmCli, "install", "-g", "pkg"],
  });
});

test("Windows npm invocation honors the explicit MemoraX Code npm entrypoint", () => {
  const npmCli = "D:\\Managed npm\\npm-cli.mjs";
  assert.deepEqual(resolveNpmInvocation(["--version"], {
    env: { MEMORAX_CODE_NPM_EXEC_PATH: npmCli },
    platform: "win32",
    nodePath: "C:\\node.exe",
    existsSync: (candidate) => candidate === npmCli,
  }), {
    command: "C:\\node.exe",
    args: [npmCli, "--version"],
  });
});

test("Windows npm invocation discovers the standard npm CLI beside Node", () => {
  const nodePath = "C:\\nodejs\\node.exe";
  const expected = path.win32.join(
    "C:\\nodejs",
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  assert.deepEqual(resolveNpmInvocation(["--version"], {
    env: {},
    platform: "win32",
    nodePath,
    existsSync: (candidate) => candidate === expected,
  }), { command: nodePath, args: [expected, "--version"] });
});

test("Windows npm invocation fails closed instead of spawning npm.cmd", () => {
  assert.throws(() => resolveNpmInvocation([], {
    env: { npm_execpath: "C:\\isolated\\npm.cmd" },
    platform: "win32",
    nodePath: "C:\\isolated\\node.exe",
    existsSync: (candidate) => candidate.endsWith("npm.cmd"),
  }), /npm CLI JavaScript entrypoint.*MEMORAX_CODE_NPM_EXEC_PATH.*npm_execpath.*NPM_CLI_JS/);
});

test("Unix npm invocation retains the direct command", () => {
  assert.deepEqual(resolveNpmInvocation(["--version"], {
    env: {},
    platform: "darwin",
    nodePath: "/opt/node/bin/node",
    existsSync: () => false,
  }), { command: "npm", args: ["--version"] });
});
