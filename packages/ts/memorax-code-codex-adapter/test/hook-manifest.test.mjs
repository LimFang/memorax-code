import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("every plugin hook provides a shell-independent Windows command", async () => {
  const manifest = JSON.parse(await readFile(join(packageRoot, "hooks", "hooks.json"), "utf8"));
  const handlers = Object.entries(manifest.hooks).flatMap(([event, groups]) => (
    groups.flatMap((group, groupIndex) => group.hooks.map((hook, hookIndex) => ({
      event,
      groupIndex,
      hookIndex,
      hook,
    })))
  ));

  assert.equal(handlers.length, 6);
  for (const { event, groupIndex, hookIndex, hook } of handlers) {
    const label = `${event}[${groupIndex}].hooks[${hookIndex}]`;
    const match = /^node "\$PLUGIN_ROOT\/hooks\/(runtime-hook\.mjs)" ([a-z][a-z0-9-]*)$/.exec(hook.command);
    assert.ok(match, `${label} must keep the POSIX plugin command`);
    assert.equal(
      hook.commandWindows,
      `node "\${PLUGIN_ROOT}/hooks/${match[1]}" ${match[2]}`,
      `${label} must let Codex resolve PLUGIN_ROOT before invoking the Windows shell`,
    );
  }
});
