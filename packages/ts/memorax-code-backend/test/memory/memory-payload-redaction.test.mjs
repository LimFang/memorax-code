import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasMeaningfulMemoryPayloadText,
  redactMemoryPayloadText,
} from "../../dist/memory/payload-redaction.js";

const fake = {
  opaque: "a".repeat(32),
  openai: ["sk", "proj", "A".repeat(32)].join("-"),
  github: ["ghp", "B".repeat(36)].join("_"),
  password: "correct-horse-battery-staple",
  email: ["private.user", "example.invalid"].join("@"),
};

test("memory payload redaction replaces each supported detector category", () => {
  const privateKey = [
    "-----BEGIN PRIVATE KEY-----",
    "cHJpdmF0ZS1rZXktbWF0ZXJpYWw=",
    "-----END PRIVATE KEY-----",
  ].join("\n");
  const jwt = [
    Buffer.from('{"alg":"HS256"}').toString("base64url"),
    Buffer.from('{"sub":"private-user"}').toString("base64url"),
    "G".repeat(32),
  ].join(".");
  const cases = [
    ["private key", `key:\n${privateKey}\nend`, "key:\n[REDACTED:PRIVATE_KEY]\nend", "PRIVATE_KEY"],
    ["authorization", `Authorization: Bearer ${fake.opaque}`, "Authorization: Bearer [REDACTED:AUTH_TOKEN]", "AUTH_TOKEN"],
    ["JWT", `jwt=${jwt}`, "jwt=[REDACTED:AUTH_TOKEN]", "AUTH_TOKEN"],
    ["cookie", `Cookie: session=${fake.opaque}`, "Cookie: [REDACTED:COOKIE]", "COOKIE"],
    ["vendor API key", `token ${fake.github}`, "token [REDACTED:API_KEY]", "API_KEY"],
    ["relay API key", `token sk_${"C".repeat(16)}_${"D".repeat(8)}`, "token [REDACTED:API_KEY]", "API_KEY"],
    ["assignment", `password=${fake.password}`, "password=[REDACTED:CREDENTIAL]", "CREDENTIAL"],
    ["CLI option", `tool --api-key ${fake.opaque}`, "tool --api-key [REDACTED:CREDENTIAL]", "CREDENTIAL"],
    ["credential URL", `postgres://user:${fake.password}@host/db`, "postgres://user:[REDACTED:CREDENTIAL]@host/db", "CREDENTIAL"],
    ["email", `contact ${fake.email}`, "contact [REDACTED:EMAIL]", "EMAIL"],
    ["long number", `identity ${"1".repeat(32)}`, "identity [REDACTED:LONG_NUMBER]", "LONG_NUMBER"],
    ["formatted long number", "phone +1 (415) 555-2671", "phone [REDACTED:LONG_NUMBER]", "LONG_NUMBER"],
    ["UUID", "task 00000000-0000-4000-8000-000000000001", "task [REDACTED:OPAQUE_ID]", "OPAQUE_ID"],
    ["fixed-length hexadecimal ID", `sha256=${"a".repeat(64)}`, "sha256=[REDACTED:OPAQUE_ID]", "OPAQUE_ID"],
    ["high-entropy opaque ID", "id=aB3dE5fG7hJ9kL2mN4pQ6rS8", "id=[REDACTED:OPAQUE_ID]", "OPAQUE_ID"],
  ];

  for (const [name, input, expected, kind] of cases) {
    assert.deepEqual(redactMemoryPayloadText(input), {
      text: expected,
      counts: { [kind]: 1 },
      redacted: true,
    }, name);
  }
});

test("memory payload redaction preserves representative non-sensitive coding text", () => {
  const values = [
    "ip=127.0.0.1",
    "path=packages/ts/src/index.ts",
    "url=https://example.invalid/path",
    "class=MemoryPayloadRedactionResult2026",
    "model=Model3DRenderer2Version4",
    "project=memorax-code-backend-v2",
    "timestamp=2026-08-13 17",
    "token=${API_KEY}",
    "token=sk_xxx",
    "public key: -----BEGIN PUBLIC KEY-----",
    "function connect(password: string, token: string) {}",
    "password=${{ secrets.DB_PASSWORD }}",
    "tool --password --verbose",
    "connect(password=swordfish)",
  ];

  for (const value of values) {
    assert.deepEqual(redactMemoryPayloadText(value), {
      text: value,
      counts: {},
      redacted: false,
    }, value);
  }
});

test("memory payload redaction resolves overlaps and remains idempotent", () => {
  const privateKey = [
    "-----BEGIN PRIVATE KEY-----",
    "cHJpdmF0ZS1rZXktbWF0ZXJpYWw=",
    "-----END PRIVATE KEY-----",
  ].join("\n");
  const first = redactMemoryPayloadText([
    `Authorization: Bearer ${fake.openai}`,
    `Cookie: auth=Bearer ${fake.opaque}; session=private-session`,
    `password: prefix ${privateKey}`,
  ].join("\n"));

  assert.equal(first.text, [
    "Authorization: Bearer [REDACTED:AUTH_TOKEN]",
    "Cookie: [REDACTED:COOKIE]",
    "password: [REDACTED:CREDENTIAL]",
  ].join("\n"));
  assert.deepEqual(first.counts, {
    AUTH_TOKEN: 1,
    COOKIE: 1,
    CREDENTIAL: 1,
  });
  assert.deepEqual(redactMemoryPayloadText(first.text), {
    text: first.text,
    counts: {},
    redacted: false,
  });
});

test("memory payload redaction fails closed when input exceeds its bound", () => {
  assert.throws(
    () => redactMemoryPayloadText("x".repeat(1_000_001)),
    /memory payload text exceeds the 1000000 character redaction limit/,
  );
});

test("meaningful memory payload text keeps useful context after redaction", () => {
  assert.equal(hasMeaningfulMemoryPayloadText("  \n\t"), false);
  assert.equal(hasMeaningfulMemoryPayloadText("[REDACTED:EMAIL], [REDACTED:API_KEY]"), false);
  assert.equal(hasMeaningfulMemoryPayloadText("Use [REDACTED:API_KEY] through the credential store."), true);
});
