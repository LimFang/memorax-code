#!/usr/bin/env node
import { runCaptureCwdHook } from "../../memorax-code-adapter-common/src/hooks/capture-cwd-hook.mjs";
import { markSupplementalReminderAfterCompact } from "../../memorax-code-adapter-common/src/hooks/memory-skill-reminder-hook.mjs";
import { isRepoMemoryJobWorker } from "../../memorax-code-adapter-common/src/repo-memory/repo-memory-job-context.mjs";

if (isRepoMemoryJobWorker()) process.exit(0);

const options = {
  adapterDir: "codex",
  debugEnv: "MEMORAX_CODE_CODEX_HOOK_DEBUG",
  requireTranscriptPathForTurnEvents: true,
  runtime: "codex",
  sessionIdField: "codexSessionId",
  sessionKeyPrefix: "codex",
};

const input = await runCaptureCwdHook(options);
markSupplementalReminderAfterCompact(options, input);
