import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const writer = fileURLToPath(
  new URL("../../../../scripts/write-windows-failure-diagnostics.mjs", import.meta.url),
);
const validator = fileURLToPath(
  new URL("../../../../scripts/validate-windows-e2e-report.mjs", import.meta.url),
);

test("Windows failure diagnostics redact credentials and private paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "memorax-code-failure-diagnostics-"));
  const memoraxCodeHome = join(root, "memorax-code-home");
  const runtime = join(memoraxCodeHome, "runtime", "backend");
  const logPath = join(runtime, "backend.log");
  const untrustedLogPath = join(root, "untrusted.log");
  const output = join(root, "failure.json");
  const secret = "diagnostic-secret-sentinel-9381";
  const untrustedMarker = "untrusted-log-marker-8431";
  try {
    await mkdir(runtime, { recursive: true });
    await writeFile(untrustedLogPath, `${untrustedMarker}\n`);
    await writeFile(logPath, [
      "safe diagnostic line",
      `Authorization: Bearer ${secret}`,
      `GET https://example.test/memory?token=${secret}&mode=debug`,
      `api_key = ${secret}`,
      `config={\"password\":\"${secret}\"}`,
      "open C:\\Users\\alice\\Secret Folder\\key.txt trailing",
      "open /Users/alice/Secret Folder/key.txt trailing",
      "public https://example.test/health?mode=full",
      "",
    ].join("\n"));
    await writeFile(join(runtime, "backend.pid.json"), `${JSON.stringify({
      pid: 99999999,
      instanceId: "diagnostic-instance",
      url: "http://127.0.0.1:1",
      logPath: untrustedLogPath,
    })}\n`);
    const env = {
      ...process.env,
      MEMORAX_CODE_HOME: memoraxCodeHome,
    };
    const written = spawnSync(
      process.execPath,
      [
        writer,
        "--job",
        "package",
        "--prefix",
        join(root, "prefix"),
        "--output",
        output,
      ],
      { env, encoding: "utf8" },
    );
    assert.equal(written.status, 0, written.stderr);

    const raw = await readFile(output, "utf8");
    assert.doesNotMatch(raw, new RegExp(secret));
    assert.doesNotMatch(raw, new RegExp(untrustedMarker));
    assert.doesNotMatch(raw, /Users[\\/]alice|Secret Folder|key\.txt/);
    const report = JSON.parse(raw);
    assert.equal(report.backend.statePresent, true);
    assert.equal(report.backend.health, "unreachable");
    assert.ok(report.backendLogTail.includes("safe diagnostic line"));
    assert.ok(report.backendLogTail.includes("<redacted>"));
    assert.ok(report.backendLogTail.includes("<path>"));
    assert.ok(
      report.backendLogTail.includes(
        "public https://example.test/health?<redacted>",
      ),
    );

    const validated = spawnSync(
      process.execPath,
      [validator, "failure", output],
      { env, encoding: "utf8" },
    );
    assert.equal(validated.status, 0, validated.stderr);

    for (const job of ["codex", "claude"]) {
      const clientOutput = join(root, `${job}-failure.json`);
      const clientWritten = spawnSync(
        process.execPath,
        [
          writer,
          "--job",
          job,
          "--prefix",
          join(root, "prefix"),
          "--output",
          clientOutput,
        ],
        { env, encoding: "utf8" },
      );
      assert.equal(clientWritten.status, 0, clientWritten.stderr);
      assert.equal(JSON.parse(await readFile(clientOutput, "utf8")).job, job);
      const clientValidated = spawnSync(
        process.execPath,
        [validator, "failure", clientOutput],
        { env, encoding: "utf8" },
      );
      assert.equal(clientValidated.status, 0, clientValidated.stderr);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
