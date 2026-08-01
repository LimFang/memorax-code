export type JsonRuntimeRecordInvalidReason =
  | "unreadable"
  | "malformed_json"
  | "invalid_record";

export type JsonRuntimeRecordState =
  | Readonly<{ status: "absent" }>
  | Readonly<{ status: "present"; value: Record<string, unknown> }>
  | Readonly<{ status: "invalid"; reason: JsonRuntimeRecordInvalidReason }>;

export type RuntimeRecordFailureState =
  | Readonly<{ status: "absent" }>
  | Readonly<{ status: "invalid"; reason: string }>
  | Readonly<{ status: "unsupported"; version: number }>;

export type RuntimeRecordWriteResult<T> = Readonly<{
  path: string;
  record: T;
  durability: "confirmed" | "uncertain";
  durabilityErrorCode?: string;
}>;

export type RuntimeRecordWriteRuntime = Readonly<{
  syncDirectory?: (path: string) => void;
}>;

export type PrivateDirectoryOptions = RuntimeRecordWriteRuntime & Readonly<{
  durableBoundary: string;
}>;

export class RuntimeRecordError extends Error {
  constructor(options: {
    name: string;
    path: string;
    state: RuntimeRecordFailureState;
    codePrefix: string;
    recovery?: string;
  });
  readonly code: string;
  readonly recordStatus: RuntimeRecordFailureState["status"];
  readonly recordPath: string;
  readonly reason?: string;
  readonly version?: number;
}

export function readJsonRuntimeRecord(path: string): JsonRuntimeRecordState;
export function ensurePrivateDirectory(
  path: string,
  options: PrivateDirectoryOptions,
): void;
export function writePrivateJsonRecord<T>(
  path: string,
  value: T,
  options: PrivateDirectoryOptions,
): RuntimeRecordWriteResult<T>;
