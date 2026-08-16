import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { createMemoraxOpenCodePlugin } from "../src/plugin.mjs";

test("chat.message retrieves memory and injects it into the system prompt", async () => {
  const requests = [];
  const plugin = createPluginWithoutReminders({
    backendConnection: { url: "http://127.0.0.1:8787", token: "test-token" },
    fetchImpl: responseSequence(requests, [{ ok: true, additionalContext: "Remember the repository boundary." }]),
  });
  const hooks = await plugin(pluginInput());
  const output = {
    message: { id: "user-1", system: "Existing system context" },
    parts: [
      { type: "text", text: "First prompt line" },
      { type: "text", text: "ignored", synthetic: true },
      { type: "text", text: "Second prompt line" },
    ],
  };

  await hooks["chat.message"]({ sessionID: "session-1" }, output);

  assert.equal(output.message.system, "Existing system context\n\nRemember the repository boundary.");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://127.0.0.1:8787/memory/turn-start");
  assert.equal(requests[0].options.headers["x-memorax-code-backend-token"], "test-token");
  assert.deepEqual(requests[0].body, {
    version: 1,
    client: "opencode",
    sessionId: "session-1",
    userMessageId: "user-1",
    prompt: "First prompt line\n\nSecond prompt line",
    cwd: "/repo/worktree",
    workspaceKind: "project",
  });
});

test("managed plugin starts the Backend once and bounds prompt waiting", async () => {
  const root = await mkdtemp(join(tmpdir(), "memorax-code-opencode-backend-start-"));
  const nodePath = process.execPath;
  const memoraxCodeHome = join(root, "memorax-code-home");
  const openCodeConfigDir = join(root, "opencode-config");
  const statePath = join(root, "state.json");
  const callsPath = join(root, "lifecycle-calls.jsonl");
  const releasePath = join(root, "lifecycle-release");
  const memoraxCodeCommand = join(root, "memorax-code.mjs");
  const requests = [];
  let hooks;
  try {
    await writeFile(statePath, JSON.stringify({
      version: 1,
      runtime: "opencode",
      integration: "plugin",
      enabled: true,
    }));
    await writeFile(memoraxCodeCommand, [
      'import { appendFileSync, existsSync } from "node:fs";',
      `appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify(process.argv.slice(2)) + "\\n");`,
      `while (!existsSync(${JSON.stringify(releasePath)})) await new Promise((resolve) => setTimeout(resolve, 5));`,
    ].join("\n"));
    const plugin = createMemoraxOpenCodePlugin({
      statePath,
      memoraxCodeHome,
      openCodeConfigDir,
      memoraxCodeCommand,
      nodePath,
      backendConnection: { url: "http://127.0.0.1:9", source: "option" },
      healthTimeoutValue: "50",
      startTimeoutValue: "1000",
      backendPromptWaitTimeoutValue: "100",
      fetchImpl: responseSequence(requests, [{ ok: true }]),
      memorySkillReminderEvaluator: async () => ({ additionalContext: "Local reminder context." }),
    });
    process.execPath = join(root, "opencode");
    hooks = await plugin(pluginInput());
    await waitForFile(callsPath);
    const calls = (await readFile(callsPath, "utf8")).trim().split("\n").map(JSON.parse);
    assert.deepEqual(calls, [[
      "start",
      "--home", memoraxCodeHome,
      "--opencode-config-dir", openCodeConfigDir,
      "--host", "127.0.0.1",
      "--port", "9",
    ]]);
    const prompt = async (id) => {
      const output = promptOutput(id, id);
      await hooks["chat.message"]({ sessionID: `session-${id}` }, output);
      return output;
    };
    const [first, second] = await Promise.race([
      Promise.all([prompt("user-start-1"), prompt("user-start-2")]),
      delay(400).then(() => { throw new Error("Backend prompt wait was not bounded"); }),
    ]);
    assert.equal(requests.length, 0);
    assert.equal(first.message.system, "Local reminder context.");
    assert.equal(second.message.system, "Local reminder context.");

    await writeFile(releasePath, "release\n");
    await hooks.dispose();
    await prompt("user-start-3");
    assert.equal(requests.length, 1);
  } finally {
    process.execPath = nodePath;
    await writeFile(releasePath, "release\n").catch(() => undefined);
    await hooks?.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("chat.message does not mistake a user diff summary for compaction", async () => {
  const requests = [];
  const plugin = createPluginWithoutReminders({
    backendConnection: { url: "http://127.0.0.1:8787" },
    fetchImpl: responseSequence(requests, [{ ok: true }]),
  });
  const hooks = await plugin(pluginInput());
  const output = {
    message: {
      id: "user-with-summary",
      summary: { title: "Edited files", body: "One change", diffs: [] },
    },
    parts: [{ type: "text", text: "Keep recalling memory." }],
  };

  await hooks["chat.message"]({ sessionID: "session-with-summary" }, output);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.prompt, "Keep recalling memory.");
});

test("chat.message ignores compaction and synthetic-only messages", async () => {
  const requests = [];
  const plugin = createPluginWithoutReminders({
    backendConnection: { url: "http://127.0.0.1:8787" },
    fetchImpl: responseSequence(requests, []),
  });
  const hooks = await plugin(pluginInput());

  await hooks["chat.message"](
    { sessionID: "session-compaction" },
    { message: { id: "user-compaction" }, parts: [{ type: "compaction", auto: true }] },
  );
  await hooks["chat.message"](
    { sessionID: "session-synthetic" },
    { message: { id: "user-synthetic" }, parts: [{ type: "text", text: "generated", synthetic: true }] },
  );

  assert.equal(requests.length, 0);
});

test("OpenCode forwards first-prompt and post-compaction reminders once", async () => {
  const memoraxCodeHome = await mkdtemp(join(tmpdir(), "memorax-code-opencode-reminder-"));
  const requests = [];
  let hooks;
  try {
    const plugin = createMemoraxOpenCodePlugin({
      memoraxCodeHome,
      backendConnection: { url: "http://127.0.0.1:8787" },
      fetchImpl: memoryResponse(requests),
    });
    hooks = await plugin(pluginInput());

    const first = promptOutput("user-reminder-1", "First prompt");
    await hooks["chat.message"]({ sessionID: "session-reminder" }, first);
    hooks.event({
      event: {
        type: "session.compacted",
        properties: { sessionID: "session-reminder" },
      },
    });
    const second = promptOutput("user-reminder-2", "After compaction");
    await hooks["chat.message"]({ sessionID: "session-reminder" }, second);
    const third = promptOutput("user-reminder-3", "Later prompt");
    await hooks["chat.message"]({ sessionID: "session-reminder" }, third);

    await hooks.dispose();
    assert.match(first.message.system, /MemoraX Code reminder: proactively invoke/);
    assert.match(second.message.system, /MemoraX Code personal-memory reminder/);
    assert.equal(third.message.system, "Retrieved user-reminder-3.");
    const reminderRequests = requests.filter((request) => request.path === "/memory/skill-reminder");
    assert.deepEqual(reminderRequests.map((request) => request.body.triggers), [
      ["cadence"],
      ["post_compaction"],
    ]);
    assert.equal(Object.hasOwn(reminderRequests[0].body, "transcriptPath"), false);
  } finally {
    await hooks?.dispose();
    await rm(memoraxCodeHome, { recursive: true, force: true });
  }
});

test("shell.env overwrites the OpenCode session identity and prepends the managed CLI path", async () => {
  const cliBinDir = "/memorax/bin";
  const plugin = createPluginWithoutReminders({ cliBinDir });
  const hooks = await plugin(pluginInput());
  const output = {
    env: {
      MEMORAX_CODE_MEMORY_CLI_TRACE_CLIENT: "codex",
      MEMORAX_CODE_MEMORY_CLI_TRACE_SESSION_ID: "old-session",
      MEMORAX_CODE_MEMORY_CLI_SESSION_ID: "old-session",
      PATH: ["/usr/bin", "/bin"].join(delimiter),
    },
  };

  await hooks["shell.env"]({ sessionID: "session-2" }, output);

  assert.equal(output.env.MEMORAX_CODE_MEMORY_CLI_TRACE_CLIENT, "opencode");
  assert.equal(output.env.MEMORAX_CODE_MEMORY_CLI_TRACE_SESSION_ID, "session-2");
  assert.equal(output.env.MEMORAX_CODE_MEMORY_CLI_SESSION_ID, "session-2");
  assert.equal(output.env.PATH, [cliBinDir, "/usr/bin", "/bin"].join(delimiter));
});

test("shell.env clears inherited session identity without an OpenCode session", async () => {
  const plugin = createMemoraxOpenCodePlugin();
  const hooks = await plugin({});
  const output = {
    env: {
      MEMORAX_CODE_MEMORY_CLI_TRACE_CLIENT: "codex",
      MEMORAX_CODE_MEMORY_CLI_TRACE_SESSION_ID: "old-session",
      MEMORAX_CODE_MEMORY_CLI_SESSION_ID: "old-session",
    },
  };

  await hooks["shell.env"]({}, output);

  assert.equal(output.env.MEMORAX_CODE_MEMORY_CLI_TRACE_CLIENT, "opencode");
  assert.equal(Object.hasOwn(output.env, "MEMORAX_CODE_MEMORY_CLI_TRACE_SESSION_ID"), false);
  assert.equal(Object.hasOwn(output.env, "MEMORAX_CODE_MEMORY_CLI_SESSION_ID"), false);
});

test("a loaded plugin follows the managed enabled state without an OpenCode restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "memorax-code-opencode-plugin-state-"));
  const statePath = join(root, "state.json");
  const requests = [];
  try {
    await writeState(false);
    const plugin = createPluginWithoutReminders({
      statePath,
      backendConnection: { url: "http://127.0.0.1:8787" },
      fetchImpl: responseSequence(requests, [{ ok: true }]),
    });
    const hooks = await plugin(pluginInput());
    const disabledOutput = { message: { id: "user-disabled" }, parts: [{ type: "text", text: "ignored" }] };
    await hooks["chat.message"]({ sessionID: "session-disabled" }, disabledOutput);
    assert.equal(requests.length, 0);

    await writeState(true);
    const enabledOutput = { message: { id: "user-enabled" }, parts: [{ type: "text", text: "remember" }] };
    await hooks["chat.message"]({ sessionID: "session-enabled" }, enabledOutput);
    assert.equal(requests.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  async function writeState(enabled) {
    await mkdir(root, { recursive: true });
    await writeFile(statePath, JSON.stringify({
      version: 1,
      runtime: "opencode",
      integration: "plugin",
      enabled,
    }));
  }
});

test("idle reads authoritative SDK messages and dispose drains the pending writeback", async () => {
  const requests = [];
  let releaseMessages;
  const messagesReady = new Promise((resolve) => {
    releaseMessages = resolve;
  });
  const clientCalls = [];
  const input = pluginInput({
    client: {
      session: {
        async messages(options) {
          clientCalls.push(options);
          await messagesReady;
          return {
            data: [
              {
                info: { id: "user-3", role: "user", sessionID: "session-3" },
                parts: [{ type: "text", text: "Implement the adapter." }],
              },
              {
                info: {
                  id: "assistant-3",
                  role: "assistant",
                  sessionID: "session-3",
                  parentID: "user-3",
                  time: { completed: 123 },
                },
                parts: [{ type: "text", text: "Implemented." }],
              },
            ],
          };
        },
      },
    },
  });
  const plugin = createPluginWithoutReminders({
    backendConnection: { url: "http://127.0.0.1:8787" },
    fetchImpl: responseSequence(requests, [{ ok: true }, { ok: true }]),
  });
  const hooks = await plugin(input);
  await hooks["chat.message"](
    { sessionID: "session-3" },
    { message: { id: "user-3" }, parts: [{ type: "text", text: "Implement the adapter." }] },
  );

  hooks.event({
    event: {
      type: "session.status",
      properties: { sessionID: "session-3", status: { type: "idle" } },
    },
  });
  let disposed = false;
  const disposing = hooks.dispose().then(() => {
    disposed = true;
  });
  await delay(10);
  assert.equal(disposed, false);

  releaseMessages();
  await disposing;

  assert.deepEqual(clientCalls, [{
    path: { id: "session-3" },
    query: { directory: "/repo/directory" },
    throwOnError: true,
  }]);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, "http://127.0.0.1:8787/memory/writeback");
  assert.deepEqual(requests[1].body, {
    version: 1,
    client: "opencode",
    sessionId: "session-3",
    userMessageId: "user-3",
    assistantMessageId: "assistant-3",
    messages: [
      {
        info: { id: "user-3", role: "user", sessionID: "session-3" },
        parts: [{ type: "text", text: "Implement the adapter." }],
      },
      {
        info: {
          id: "assistant-3",
          role: "assistant",
          sessionID: "session-3",
          parentID: "user-3",
          time: { completed: 123 },
        },
        parts: [{ type: "text", text: "Implemented." }],
      },
    ],
    cwd: "/repo/worktree",
    workspaceKind: "project",
  });
});

test("idle discards HTTP 413 without starving a runtime-closed retry", async () => {
  const requests = [];
  const names = ["oversized", "retry"];
  const messages = names.flatMap((name, index) => {
    const userId = `user-${name}`;
    return [
      {
        info: { id: userId, role: "user", sessionID: "session-retry" },
        parts: [{ type: "text", text: `Prompt ${name}.` }],
      },
      {
        info: {
          id: `assistant-${name}`,
          role: "assistant",
          sessionID: "session-retry",
          parentID: userId,
          time: { completed: index + 1 },
        },
        parts: [{ type: "text", text: `Reply ${name}.` }],
      },
    ];
  });
  const plugin = createPluginWithoutReminders({
    backendConnection: { url: "http://127.0.0.1:8787" },
    fetchImpl: responseSequence(requests, [
      { ok: true },
      { ok: true },
      new Response(null, { status: 413 }),
      { ok: true, scheduled: false, reason: "runtime_closed" },
      { ok: true, scheduled: true },
    ]),
  });
  const hooks = await plugin(pluginInput({
    client: { session: { async messages() { return { data: messages }; } } },
  }));
  for (const name of names) {
    await hooks["chat.message"](
      { sessionID: "session-retry" },
      { message: { id: `user-${name}` }, parts: [{ type: "text", text: `Prompt ${name}.` }] },
    );
  }
  const idle = () => hooks.event({
    event: {
      type: "session.status",
      properties: { sessionID: "session-retry", status: { type: "idle" } },
    },
  });

  idle();
  await hooks.dispose();
  idle();
  await hooks.dispose();

  assert.deepEqual(
    requests.filter((request) => request.url.endsWith("/memory/writeback"))
      .map((request) => request.body.userMessageId),
    ["user-oversized", "user-retry", "user-retry"],
  );
});

function pluginInput(overrides = {}) {
  return {
    client: { session: { async messages() { return { data: [] }; } } },
    project: { vcs: "git" },
    directory: "/repo/directory",
    worktree: "/repo/worktree",
    ...overrides,
  };
}

function createPluginWithoutReminders(options) {
  return createMemoraxOpenCodePlugin({
    memorySkillReminderEvaluator: async () => undefined,
    ...options,
  });
}

function promptOutput(id, text, system) {
  return {
    message: { id, ...(system ? { system } : {}) },
    parts: [{ type: "text", text }],
  };
}

function memoryResponse(requests) {
  return async (url, options) => {
    const parsedUrl = new URL(url);
    const body = JSON.parse(options.body);
    requests.push({ url: String(url), path: parsedUrl.pathname, options, body });
    const responseBody = parsedUrl.pathname === "/memory/turn-start"
      ? { ok: true, additionalContext: `Retrieved ${body.userMessageId}.` }
      : { ok: true };
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

function responseSequence(requests, responses) {
  return async (url, options) => {
    requests.push({ url: String(url), options, body: JSON.parse(options.body) });
    const body = responses.shift() ?? { ok: true };
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

async function waitForFile(path) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await readFile(path);
      return;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await delay(5);
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
}
