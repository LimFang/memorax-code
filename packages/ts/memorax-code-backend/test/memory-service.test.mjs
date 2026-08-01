import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createBackendState } from "../dist/backend-state.js";
import { createMemoryService } from "../dist/memory-service.js";

test("Backend state does not own the memory service", () => {
  const state = createBackendState("127.0.0.1");
  assert.equal("memoryRuntime" in state, false);
  assert.equal("memoryService" in state, false);
  assert.equal("memoryObservability" in state, false);
});

test("memory service exposes a sealed Hook facade and closes idempotently", async () => {
  const root = await mkdtemp(join(tmpdir(), "memorax-code-service-"));
  const memoraxCodeHome = join(root, "home");
  const firstWorkspace = join(root, "workspace-a");
  await Promise.all([
    mkdir(memoraxCodeHome, { recursive: true }),
    mkdir(firstWorkspace, { recursive: true }),
  ]);
  const diagnosticEvents = [];
  const service = createMemoryService({
    diagnosticLogger(message, fields) {
      diagnosticEvents.push({ message, fields });
    },
    env: {
      MEMORAX_CODE_CODEX_TRACE_ENABLED: "false",
      MEMORAX_CODE_MEMORAX_ENDPOINT: "http://memorax.test",
      MEMORAX_CODE_MEMORAX_API_KEY: "secret",
      MEMORAX_CODE_MEMORAX_USER_ID: "user-1",
    },
    memoraxCodeHome,
  });
  try {
    assert.equal("automaticWriteback" in service, false);
    assert.equal("codexHook" in service, false);
    assert.equal("repositoryMemorySession" in service, false);
    assert.equal("turnCoordinator" in service, false);
    assert.equal("enqueueAutomaticMemoryWriteback" in service, false);
    assert.equal("completeMaterializedTurn" in service, false);
    assert.equal("resolveRepositoryMemorySession" in service, false);
    assert.equal("memoryObservability" in service, false);
    assert.equal("recordCodexSkillReminder" in service, false);

    await service.recordTurnStart({
      version: 1,
      client: "codex",
      sessionId: "session-memory-service",
      turnId: "turn-memory-service",
      prompt: "Record this exact turn in the runtime.",
      cwd: firstWorkspace,
      transcriptPath: join(memoraxCodeHome, "missing-rollout.jsonl"),
    });
    assert.equal(diagnosticEvents.some((event) => event.message === "memory_hook.turn_start"), true);
    await service.recordTurnStart({
      version: 1,
      client: "claude-code",
      sessionId: "session-claude-memory-service",
      promptId: "prompt-claude-memory-service",
      cwd: firstWorkspace,
      transcriptPath: join(memoraxCodeHome, "missing-claude-transcript.jsonl"),
    });
    assert.equal(diagnosticEvents.some((event) => event.message === "claude_memory_hook.turn_start"), true);

    await assert.rejects(service.recordTurnStart({
      version: 1,
      client: "unknown-client",
      sessionId: "session-unknown-client",
      prompt: "Do not inherit Codex authority.",
      transcriptPath: join(memoraxCodeHome, "unknown-client.jsonl"),
    }), /unsupported memory Hook command/);

    await service.drain();
    await service.drain();
    service.close();
    service.close();
  } finally {
    service.close();
    await rm(root, { recursive: true, force: true });
  }
});
