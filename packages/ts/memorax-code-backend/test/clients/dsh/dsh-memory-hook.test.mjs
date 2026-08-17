import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createBackendState } from "../../../dist/app/state.js";
import { createBackendServer } from "../../../dist/server.js";
import { listen } from "../../support/helpers.mjs";
import { createHttpBackendClient } from "../../../../memorax-code-dsh-adapter/src/http-client.mjs";
import {
  memoraxAddFetch,
  waitFor,
  withEnv,
} from "../codex/support/memory-hook-fixtures.mjs";
import { dshTurnInterval } from "./support/dsh-session-fixtures.mjs";

const TEST_WORKSPACE = fileURLToPath(new URL("../../..", import.meta.url));
const TEST_REPO_ROOT = resolve(TEST_WORKSPACE, "../../..");

test("Backend runs a DSH native Turn through retrieval and automatic writeback", async () => {
  const sessionHome = await mkdtemp(join(tmpdir(), "memorax-code-dsh-hook-"));
  const interval = dshTurnInterval({
    sessionId: "session-dsh-http",
    cwd: TEST_WORKSPACE,
    turn: 3,
    startSeq: 40,
  });
  const requests = [];
  const fetchImpl = async (url, init) => {
    const request = { url: String(url), body: JSON.parse(init.body) };
    requests.push(request);
    const searching = request.url.endsWith("/v1/memories/search");
    return new Response(JSON.stringify(searching ? {
      success: true,
      data: {
        task_id: "dsh-search",
        status: "completed",
        data: [{
          id: "memory-1",
          memory: "Use DSH's durable Session Event Log.",
          score: 0.95,
          metadata: { memory_type: "core" },
        }],
      },
    } : {
      success: true,
      data: { task_id: "dsh-add", status: "queued" },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const restoreEnv = withEnv({
    MEMORAX_CODE_HOME: sessionHome,
    MEMORAX_CODE_CODEX_TRACE_ENABLED: "false",
    MEMORAX_CODE_CLAUDE_TRACE_ENABLED: "false",
    MEMORAX_CODE_OPENCODE_TRACE_ENABLED: "false",
    MEMORAX_CODE_MEMORY_RETRIEVAL_ENABLED: "true",
    MEMORAX_CODE_MEMORY_WRITEBACK_ENABLED: "true",
    MEMORAX_CODE_MEMORY_WRITEBACK_BUFFER_ENABLED: "false",
    MEMORAX_CODE_MEMORAX_ENDPOINT: "http://memorax.test",
    MEMORAX_CODE_MEMORAX_API_KEY: "secret",
    MEMORAX_CODE_MEMORAX_USER_ID: "user-1",
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  const state = createBackendState("127.0.0.1", {
    sessionHome,
    authToken: "backend-token",
  });
  const server = createBackendServer(state);
  const url = await listen(server);
  const backendClient = createHttpBackendClient({
    env: {},
    fetchImpl: originalFetch,
    resolveConnection: () => ({ url, token: "backend-token" }),
  });
  const turnStart = {
    version: 1,
    client: "dsh",
    sessionId: interval.sessionId,
    turn: interval.turn,
    startSeq: interval.startSeq,
    cwd: interval.cwd,
    prompt: "Implement the DSH adapter.",
  };
  try {
    const startBody = await backendClient.recordTurnStart(turnStart);
    assert.equal(startBody.ok, true);
    assert.equal(startBody.repoMemoryWorktree, TEST_REPO_ROOT);
    assert.match(startBody.additionalContext, /durable Session Event Log/);

    const mismatched = structuredClone(interval);
    mismatched.sessionHeader.cwd = resolve(TEST_WORKSPACE, "other");
    const rejectedWriteback = await backendClient.writebackTurn({
      version: 1,
      client: "dsh",
      ...mismatched,
    });
    assert.deepEqual(rejectedWriteback, {
      ok: true,
      scheduled: false,
      reason: "workspace_identity_mismatch",
    });

    const shiftedInterval = dshTurnInterval({
      sessionId: interval.sessionId,
      cwd: interval.cwd,
      turn: interval.turn,
      startSeq: interval.startSeq + 1,
    });
    const mismatchedMetadata = await backendClient.writebackTurn({
      version: 1,
      client: "dsh",
      ...shiftedInterval,
    });
    assert.deepEqual(mismatchedMetadata, {
      ok: true,
      scheduled: false,
      reason: "turn_metadata_mismatch",
    });

    const writeback = await backendClient.writebackTurn({
      version: 1,
      client: "dsh",
      ...interval,
    });
    assert.deepEqual(writeback, { ok: true, scheduled: true });
    await waitFor(() => requests.length === 2, "DSH writeback did not call MemoraX Add");
    assert.deepEqual(requests.map((request) => new URL(request.url).pathname), [
      "/v1/memories/search",
      "/v1/memories/add",
    ]);
    assert.deepEqual(requests[1].body.messages.map(({ role, content }) => ({ role, content })), [
      { role: "user", content: "Implement the DSH adapter." },
      { role: "assistant", content: "I will inspect.\n\nThe adapter is ready." },
    ]);
    assert.equal(JSON.stringify(requests[1].body).includes("recalled memory"), false);
    assert.equal(JSON.stringify(requests[1].body).includes("private tool result"), false);
  } finally {
    await server.shutdown();
    globalThis.fetch = originalFetch;
    restoreEnv();
    await rm(sessionHome, { recursive: true, force: true });
  }
});

test("Backend recovers DSH writeback from the native log without cached turn metadata", async () => {
  const sessionHome = await mkdtemp(join(tmpdir(), "memorax-code-dsh-recovery-"));
  const interval = dshTurnInterval({
    sessionId: "session-dsh-recovered",
    cwd: TEST_WORKSPACE,
    turn: 2,
    startSeq: 20,
  });
  const { fetchImpl, requests } = memoraxAddFetch();
  const restoreEnv = withEnv({
    MEMORAX_CODE_HOME: sessionHome,
    MEMORAX_CODE_CODEX_TRACE_ENABLED: "false",
    MEMORAX_CODE_CLAUDE_TRACE_ENABLED: "false",
    MEMORAX_CODE_OPENCODE_TRACE_ENABLED: "false",
    MEMORAX_CODE_MEMORY_RETRIEVAL_ENABLED: "false",
    MEMORAX_CODE_MEMORY_WRITEBACK_ENABLED: "true",
    MEMORAX_CODE_MEMORY_WRITEBACK_BUFFER_ENABLED: "false",
    MEMORAX_CODE_MEMORAX_ENDPOINT: "http://memorax.test",
    MEMORAX_CODE_MEMORAX_API_KEY: "secret",
    MEMORAX_CODE_MEMORAX_USER_ID: "user-1",
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  const state = createBackendState("127.0.0.1", { sessionHome });
  const server = createBackendServer(state);
  const url = await listen(server);
  try {
    const writeback = await originalFetch(`${url}/memory/writeback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: 1, client: "dsh", ...interval }),
    });
    assert.equal(writeback.status, 200);
    assert.deepEqual(await writeback.json(), { ok: true, scheduled: true });
    await waitFor(() => requests.length === 1, "recovered DSH writeback did not call MemoraX Add");
  } finally {
    await server.shutdown();
    globalThis.fetch = originalFetch;
    restoreEnv();
    await rm(sessionHome, { recursive: true, force: true });
  }
});
