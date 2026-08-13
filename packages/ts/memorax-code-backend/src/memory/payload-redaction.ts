export type MemoryPayloadRedactionKind =
  | "PRIVATE_KEY"
  | "AUTH_TOKEN"
  | "COOKIE"
  | "API_KEY"
  | "CREDENTIAL"
  | "EMAIL"
  | "LONG_NUMBER"
  | "OPAQUE_ID";

export type MemoryPayloadRedactionResult = Readonly<{
  text: string;
  counts: Readonly<Partial<Record<MemoryPayloadRedactionKind, number>>>;
  redacted: boolean;
}>;

type RedactionSpan = {
  start: number;
  end: number;
  kind: MemoryPayloadRedactionKind;
  priority: number;
};

type RedactionRule = Readonly<{
  pattern: RegExp;
  kind: MemoryPayloadRedactionKind;
  priority: number;
  group?: number;
  accept?: (value: string) => boolean;
}>;

const MAX_REDACTION_INPUT_CHARS = 1_000_000;
const PLACEHOLDER_PATTERN = /\[REDACTED:[A-Z_]+\]/g;
const PLACEHOLDER_VALUE_PATTERN = /^\[REDACTED:[A-Z_]+\]$/;
const SENSITIVE_KEY_SOURCE = String.raw`(?:[A-Za-z_$][A-Za-z0-9_$-]*)?(?:password|passwd|pwd|client[-_$]?secret|consumer[-_$]?secret|api[-_$]?key|access[-_$]?token|refresh[-_$]?token|auth[-_$]?token|id[-_$]?token|private[-_$]?key|secret[-_$]?access[-_$]?key|secret[-_$]?key|credential|secret|token)`;
const CREDENTIAL_VALUE_SOURCE = String.raw`(?:\[REDACTED:[A-Z_]+\]|\$\{\{[^\r\n]*?\}\}|\{\{[^\r\n]*?\}\}|\$\{[^}\r\n]+\}|\$[A-Za-z_][A-Za-z0-9_]*|"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^,;#}\]\)\r\n]+)`;
const SAFE_CREDENTIAL_VALUE_PATTERN = /^(?:\[REDACTED:[A-Z_]+\]|\$\{\{[^\r\n]*\}\}|\{\{[^\r\n]*\}\}|\$\{[A-Z_][A-Z0-9_]*\}|\$[A-Z_][A-Z0-9_]*|(?:process\.)?env\.[A-Z_][A-Z0-9_]*|<[^>]+>|--\S+|x{2,}|\*{2,}|\.{3}|sk[_-]x+|example|sample|change-?me|(?:your|replace)[-_][a-z0-9_-]+|string|str|number|boolean|unknown|any|null|undefined|none)$/i;
const NON_CONTENT_LABEL_PATTERN = /\b(?:proxy-authorization|authorization|bearer|basic|cookie|set-cookie|password|passwd|pwd|client[_-]?secret|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|private[_-]?key|credential|secret|token|jwt|email|contact|card|key|export)\b/gi;

const RULES: readonly RedactionRule[] = [
  {
    pattern: /-----BEGIN ((?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----[\s\S]*?(?:-----END \1-----|$)/gi,
    kind: "PRIVATE_KEY",
    priority: 100,
  },
  {
    pattern: /(?:^|[\r\n])[ \t]*(?:Proxy-)?Authorization[ \t]*:[ \t]*([^ \t\r\n][^\r\n]*)/gim,
    group: 1,
    kind: "AUTH_TOKEN",
    priority: 95,
  },
  {
    pattern: /(?:^|[^A-Za-z0-9_-])(?:Bearer|Basic)\s+["']?([A-Za-z0-9._~+/=-]{16,})(?![A-Za-z0-9._~+/=-])/gi,
    group: 1,
    kind: "AUTH_TOKEN",
    priority: 94,
  },
  {
    pattern: /\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{16,}\b/g,
    kind: "AUTH_TOKEN",
    priority: 94,
  },
  {
    pattern: /(?:^|[\r\n])[ \t]*(?:Set-Cookie|Cookie)\s*:\s*([^\r\n]+)/gim,
    group: 1,
    kind: "COOKIE",
    priority: 92,
  },
  {
    pattern: new RegExp(
      String.raw`(?:^|[\r\n;,{}])[ \t]*(?:-[ \t]+)?(?:(?:export|const|let|var)[ \t]+)*["']?${SENSITIVE_KEY_SOURCE}["']?[ \t]*[:=][ \t]*(${CREDENTIAL_VALUE_SOURCE})`,
      "gim",
    ),
    group: 1,
    kind: "CREDENTIAL",
    priority: 85,
    accept: (value) => !isSafeCredentialValue(value),
  },
  {
    pattern: new RegExp(
      String.raw`--${SENSITIVE_KEY_SOURCE}(?![A-Za-z0-9_$-])(?:[ \t]+|=[ \t]*)(${CREDENTIAL_VALUE_SOURCE})`,
      "gi",
    ),
    group: 1,
    kind: "CREDENTIAL",
    priority: 85,
    accept: (value) => !isSafeCredentialValue(value),
  },
  {
    pattern: /\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s/:@]*:([^\s/@]+)@/g,
    group: 1,
    kind: "CREDENTIAL",
    priority: 85,
    accept: (value) => !isSafeCredentialValue(value),
  },
  { pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}[A-Za-z0-9]\b/g, kind: "API_KEY", priority: 80 },
  { pattern: /\bsk_[A-Za-z0-9_-]{8,}\b/g, kind: "API_KEY", priority: 80 },
  { pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, kind: "API_KEY", priority: 80 },
  { pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, kind: "API_KEY", priority: 80 },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{16,}[A-Za-z0-9]\b/g, kind: "API_KEY", priority: 80 },
  { pattern: /\b(?:(?:sk|rk)_live_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,})\b/g, kind: "API_KEY", priority: 80 },
  { pattern: /\bglpat-[A-Za-z0-9_-]{16,}[A-Za-z0-9]\b/g, kind: "API_KEY", priority: 80 },
  { pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, kind: "API_KEY", priority: 80 },
  { pattern: /\bnpm_[A-Za-z0-9]{36}\b/g, kind: "API_KEY", priority: 80 },
  {
    pattern: /(?<![A-Z0-9._%+-])[A-Z0-9._%+-]{1,64}@[A-Z0-9](?:[A-Z0-9.-]{0,251}[A-Z0-9])?\.[A-Z]{2,63}(?![A-Z0-9-]|\.[A-Z0-9])/gi,
    kind: "EMAIL",
    priority: 70,
  },
  {
    pattern: /(?<![A-Za-z0-9])[0-9A-Fa-f]{8}-(?:[0-9A-Fa-f]{4}-){3}[0-9A-Fa-f]{12}(?![A-Za-z0-9])/g,
    kind: "OPAQUE_ID",
    priority: 60,
  },
  {
    pattern: /(?<![A-Za-z0-9])(?:[0-9A-Fa-f]{64}|[0-9A-Fa-f]{40}|[0-9A-Fa-f]{32})(?![A-Za-z0-9])/g,
    kind: "OPAQUE_ID",
    priority: 60,
    accept: (value) => /[A-Fa-f]/.test(value),
  },
  {
    pattern: /(?<![A-Za-z0-9])[A-Za-z0-9]{24,}(?![A-Za-z0-9])/g,
    kind: "OPAQUE_ID",
    priority: 60,
    accept: looksLikeHighEntropyOpaqueId,
  },
  {
    pattern: /(?<![A-Za-z0-9.])\+?(?:\d|\(\d)[\d ()-]*\d[Xx]?\)?(?![A-Za-z0-9]|\.\d)/g,
    kind: "LONG_NUMBER",
    priority: 50,
    accept: (value) => {
      if (value.replace(/\D/g, "").length < 9) return false;
      const normalized = value.trim().replace(/[()]/g, "");
      return !/^(?:19|20)\d{2}-\d{1,2}-\d{1,2}(?:[ T-]\d{1,2})?$/.test(normalized)
        && !/^(?:19|20)\d{2}\s+\d{1,2}\s+\d{1,2}(?:\s+\d{1,2})?$/.test(normalized);
    },
  },
];

export function redactMemoryPayloadText(text: string): MemoryPayloadRedactionResult {
  if (text.length > MAX_REDACTION_INPUT_CHARS) {
    throw new Error(`memory payload text exceeds the ${MAX_REDACTION_INPUT_CHARS} character redaction limit`);
  }
  if (!text) return { text, counts: {}, redacted: false };

  const spans: RedactionSpan[] = [];
  for (const rule of RULES) collectRuleSpans(text, rule, spans);
  const selected = mergeOverlappingSpans(spans);
  if (selected.length === 0) return { text, counts: {}, redacted: false };

  const counts: Partial<Record<MemoryPayloadRedactionKind, number>> = {};
  const output: string[] = [];
  let offset = 0;
  for (const span of selected) {
    output.push(text.slice(offset, span.start), `[REDACTED:${span.kind}]`);
    counts[span.kind] = (counts[span.kind] ?? 0) + 1;
    offset = span.end;
  }
  output.push(text.slice(offset));
  return { text: output.join(""), counts, redacted: true };
}

export function hasMeaningfulMemoryPayloadText(text: string): boolean {
  if (!text.trim()) return false;
  const remainder = text
    .replace(PLACEHOLDER_PATTERN, " ")
    .replace(NON_CONTENT_LABEL_PATTERN, " ")
    .replace(/[\s.,;:!?"'`(){}\[\]<>/\\|=_-]+/g, "");
  return /[\p{L}\p{N}]/u.test(remainder);
}

function collectRuleSpans(text: string, rule: RedactionRule, spans: RedactionSpan[]): void {
  rule.pattern.lastIndex = 0;
  for (const match of text.matchAll(rule.pattern)) {
    const value = match[rule.group ?? 0];
    if (match.index === undefined || !value || PLACEHOLDER_VALUE_PATTERN.test(value.trim())) continue;
    if (rule.accept && !rule.accept(value)) continue;
    const relativeStart = match[0].lastIndexOf(value);
    if (relativeStart < 0) continue;
    spans.push({
      start: match.index + relativeStart,
      end: match.index + relativeStart + value.length,
      kind: rule.kind,
      priority: rule.priority,
    });
  }
}

function isSafeCredentialValue(rawValue: string): boolean {
  let value = rawValue.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  return !value || SAFE_CREDENTIAL_VALUE_PATTERN.test(value);
}

function looksLikeHighEntropyOpaqueId(value: string): boolean {
  let lowercase = 0;
  let uppercase = 0;
  let digits = 0;
  let transitions = 0;
  let letterRun = 0;
  let longestLetterRun = 0;
  let previousWasDigit: boolean | undefined;
  const unique = new Set<string>();

  for (const character of value) {
    const isDigit = character >= "0" && character <= "9";
    if (isDigit) {
      digits += 1;
      letterRun = 0;
    } else {
      if (character >= "a" && character <= "z") lowercase += 1;
      else uppercase += 1;
      letterRun += 1;
      longestLetterRun = Math.max(longestLetterRun, letterRun);
    }
    if (previousWasDigit !== undefined && previousWasDigit !== isDigit) transitions += 1;
    previousWasDigit = isDigit;
    unique.add(character);
  }

  return lowercase >= 2
    && uppercase >= 2
    && digits >= 2
    && transitions >= 4
    && longestLetterRun <= 5
    && unique.size >= 12;
}

function mergeOverlappingSpans(spans: RedactionSpan[]): RedactionSpan[] {
  const sorted = [...spans].sort((left, right) => (
    left.start - right.start
    || right.end - left.end
    || right.priority - left.priority
  ));
  const merged: RedactionSpan[] = [];
  for (const span of sorted) {
    const previous = merged.at(-1);
    if (!previous || span.start >= previous.end) {
      merged.push({ ...span });
      continue;
    }
    previous.end = Math.max(previous.end, span.end);
  }
  return merged;
}
