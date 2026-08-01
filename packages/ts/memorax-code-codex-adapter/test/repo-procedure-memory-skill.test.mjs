import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillRoot = join(packageRoot, "skills", "memorax-code");

function readSkill(path) {
  return readFileSync(join(skillRoot, path), "utf8");
}

test("memorax-code routes personal procedure reads and writes", () => {
  const router = readSkill("SKILL.md");
  const readReference = readSkill("references/personal-read.md");
  const writeReference = readSkill("references/personal-write.md");

  assert.match(router, /ordered actions, checklists, prerequisites, gates, exceptions, and validation rules/);
  assert.match(router, /personal procedure write/);
  assert.match(readReference, /\.repo_memory\/procedure-memory\//);
  assert.match(readReference, /do not create it during a read/);
  assert.match(readReference, /Do not write, normalize, migrate, repair, or delete memory/);

  assert.match(writeReference, /Require the user to explicitly ask/);
  assert.match(writeReference, /each procedure topic in its own concise kebab-case file/);
  assert.match(writeReference, /Do not create a global procedures file/);
  assert.match(writeReference, /Do not persist current-task instructions or temporary plans/);
  assert.match(writeReference, /Write human-readable memory content in the user's current interaction language/);
  assert.match(writeReference, /procedure titles and steps and user-profile descriptions, applicability, and exceptions/);
  assert.match(writeReference, /Preserve exact code identifiers, commands, paths, API names, and quoted literals without translation/);
  assert.match(writeReference, /Do not retain deleted text in tombstones/);

  assert.equal(existsSync(join(skillRoot, "scripts", "user_profile_memory.py")), true);
});
