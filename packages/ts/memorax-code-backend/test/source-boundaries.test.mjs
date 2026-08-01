import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));

const rules = [
  {
    name: "provider kernel stays independent from server and adapter lifecycle",
    importers: ["memorax-adapter.ts", "memorax-http.ts"],
    forbidden: ["server-", "codex-plugin-install"],
  },
  {
    name: "memorax config stays independent from server routing",
    importers: ["memorax-config.ts"],
    forbidden: ["server-"],
  },
  {
    name: "repository memory identity stays independent from child processes and synchronous filesystem I/O",
    importers: ["repository-memory-scope.ts"],
    forbidden: ["node:child_process", "node:fs"],
  },
  {
    name: "request-time memory production does not depend on adapter lifecycle",
    importers: [
      "automatic-memory-retrieval.ts",
      "automatic-memory-writeback.ts",
      "claude-memory-hook-runtime.ts",
      "claude-transcript-turn.ts",
      "codex-memory-hook-runtime.ts",
      "memory-turn-coordinator.ts",
      "memory-service.ts",
      "memory-writeback-buffer.ts",
      "memory-writeback-chunk.ts",
    ],
    forbidden: [
      "codex-plugin-install",
    ],
  },
  {
    name: "memory service stays independent from HTTP and Backend composition",
    importers: ["memory-service.ts"],
    forbidden: ["node:http", "server-", "backend-state"],
  },
  {
    name: "memory service kernel receives Backend diagnostics through a port",
    importers: [
      "automatic-memory-retrieval.ts",
      "automatic-memory-writeback.ts",
      "claude-memory-hook-runtime.ts",
      "codex-memory-hook-runtime.ts",
      "memorax-adapter.ts",
      "memory-turn-coordinator.ts",
      "memory-service.ts",
    ],
    forbidden: ["debug-log"],
  },
  {
    name: "Backend state does not own the memory service",
    importers: ["backend-state.ts"],
    forbidden: ["memory-service"],
  },
  {
    name: "automatic writeback stays independent from Codex prompt parsing and Backend routing",
    importers: ["automatic-memory-writeback.ts"],
    forbidden: ["codex-effective-prompt", "server-"],
  },
  {
    name: "Hook memory runtimes use normalized automatic writeback",
    importers: ["claude-memory-hook-runtime.ts", "codex-memory-hook-runtime.ts", "memory-turn-coordinator.ts"],
    forbidden: ["memory-writeback"],
  },
  {
    name: "Codex memory hook runtime stays independent from HTTP and Backend composition",
    importers: ["codex-memory-hook-runtime.ts"],
    forbidden: ["node:http", "server-", "backend-state"],
  },
  {
    name: "Claude memory hook runtime stays independent from HTTP and Backend composition",
    importers: ["claude-memory-hook-runtime.ts", "claude-transcript-turn.ts"],
    forbidden: ["node:http", "server-", "backend-state"],
  },
  {
    name: "memory turn coordinator stays independent from HTTP, Backend composition, and client transcripts",
    importers: ["memory-turn-coordinator.ts"],
    forbidden: ["node:http", "server-", "backend-state", "codex-rollout", "claude-"],
  },
  {
    name: "writeback reconciliation stays independent from HTTP, Backend composition, and Viewer models",
    importers: ["memory-writeback-reconciler.ts"],
    forbidden: ["node:http", "server-", "backend-state", "memory-viewer"],
  },
  {
    name: "writeback task projection stays independent from Viewer and provider polling",
    importers: ["memory-writeback-task-projection.ts"],
    forbidden: ["memory-viewer", "memorax-adapter", "server-"],
  },
  {
    name: "memory viewer user routes read local projections without provider polling",
    importers: ["server-memory-viewer.ts"],
    forbidden: ["memorax-adapter", "memorax-config", "memory-writeback-reconciler"],
  },
  {
    name: "HTTP server stays independent from install watchdog and client plugin lifecycle",
    importers: ["server.ts"],
    forbidden: ["install-watchdog", "codex-plugin-install", "client-plugin-removal"],
  },
  {
    name: "Codex trace store stays independent from memory and server paths",
    importers: ["trace-store.ts"],
    forbidden: ["memory-", "server-"],
  },
];

test("backend source boundaries keep production, observability, and lifecycle imports separated", async () => {
  const violations = [];
  for (const rule of rules) {
    for (const importer of rule.importers) {
      const imports = await directRelativeImports(importer);
      for (const target of imports) {
        if (rule.forbidden.some((forbidden) => matchesForbiddenTarget(target, forbidden))) {
          violations.push(`${importer} imports ${target} (${rule.name})`);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("memorax-code lifecycle delegates client implementation details to adapter participants", async () => {
  const source = await readFile(join(backendRoot, "src", "memorax-code-lifecycle.ts"), "utf8");

  assert.doesNotMatch(source, /codex-plugin-install/);
  assert.doesNotMatch(source, /memorax-code-(?:codex|claude)-adapter\/src/);
});

async function directRelativeImports(importer) {
  const text = await readFile(join(backendRoot, "src", importer), "utf8");
  const specs = new Set();
  for (const pattern of importPatterns) {
    for (const match of text.matchAll(pattern)) {
      const spec = match[1];
      specs.add(spec.startsWith("./") ? spec.slice(2).replace(/\.js$/, "") : spec);
    }
  }
  return [...specs].sort();
}

const importPatterns = [
  /\bimport\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/g,
  /\bimport\s+["']([^"']+)["']/g,
  /\bexport\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

function matchesForbiddenTarget(target, forbidden) {
  if (forbidden.endsWith("-")) return target.startsWith(forbidden);
  return target === forbidden || target.startsWith(`${forbidden}-`);
}
