import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const hookPath = fileURLToPath(new URL("../runtime-hooks/memory-cli-session.mjs", import.meta.url));

test("Claude SessionStart binds later memory CLI commands to the current trace session", async () => {
  const root = await mkdtemp(join(tmpdir(), "memorax-code-claude-memory-cli-session-"));
  const envFile = join(root, "session-env.sh");
  try {
    await writeFile(envFile, "export EXISTING_SESSION_VALUE='preserved'\n", "utf8");
    const result = await runHook({
      CLAUDE_ENV_FILE: envFile,
    }, {
      hook_event_name: "SessionStart",
      session_id: "claude-session-'quoted",
    });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
    assert.equal(await readFile(envFile, "utf8"), [
      "export EXISTING_SESSION_VALUE='preserved'",
      "export MEMORAX_CODE_MEMORY_CLI_TRACE_CLIENT='claude'",
      "export MEMORAX_CODE_MEMORY_CLI_TRACE_SESSION_ID='claude-session-'\"'\"'quoted'",
      "",
    ].join("\n"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Claude memory CLI session Hook fails open without a session or environment file", async () => {
  for (const [env, input] of [
    [{}, { hook_event_name: "SessionStart", session_id: "claude-session" }],
    [{ CLAUDE_ENV_FILE: "/missing/session-env.sh" }, { hook_event_name: "SessionStart" }],
  ]) {
    const result = await runHook(env, input);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  }
});

function runHook(env, input) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [hookPath], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(input));
  });
}
