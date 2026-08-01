#!/usr/bin/env node
import { runRepoMemoryUpdatePolicy } from "../../memorax-code-adapter-common/src/repo-memory/repo-memory-update-policy-evaluator.mjs";

try {
  const payload = runRepoMemoryUpdatePolicy(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(payload)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
