const INTERNAL_JOB_KIND = "repo-memory";
const JOB_ID_PATTERN = /^\d{17}-(?:build|update)-[a-zA-Z0-9_.-]+-[0-9a-f]{8}$/;
const RUN_ID_PATTERN = /^[0-9a-f]{32}$/;

export function readRepoMemoryJobWorkerContext(env = process.env) {
  if (env.MEMORAX_CODE_REPO_MEMORY_JOB_KIND !== INTERNAL_JOB_KIND) return undefined;
  const jobId = stringValue(env.MEMORAX_CODE_REPO_MEMORY_JOB_ID);
  const runId = stringValue(env.MEMORAX_CODE_REPO_MEMORY_JOB_RUN_ID);
  if (!jobId || !JOB_ID_PATTERN.test(jobId) || !runId || !RUN_ID_PATTERN.test(runId)) return undefined;
  return { kind: INTERNAL_JOB_KIND, jobId, runId };
}

export function isRepoMemoryJobWorker(env = process.env) {
  return readRepoMemoryJobWorkerContext(env) !== undefined;
}

export function repoMemoryJobWorkerEnv(input, env = process.env) {
  return {
    ...env,
    MEMORAX_CODE_REPO_MEMORY_JOB_KIND: INTERNAL_JOB_KIND,
    MEMORAX_CODE_REPO_MEMORY_JOB_ID: input.jobId,
    MEMORAX_CODE_REPO_MEMORY_JOB_RUN_ID: input.runId,
  };
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
