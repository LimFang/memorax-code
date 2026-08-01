import {
  RuntimeRecordError,
  type RuntimeRecordWriteResult,
  type RuntimeRecordWriteRuntime,
} from "./runtime-record.mjs";

export type BackendConnectionAuthority = Readonly<{
  version: 1;
  url: string;
  tokenPath?: string;
}>;

export type BackendConnectionAuthorityInvalidReason =
  | "unreadable"
  | "malformed_json"
  | "invalid_record"
  | "invalid_version"
  | "unknown_fields"
  | "invalid_url"
  | "invalid_token_path";

export type BackendConnectionAuthorityState =
  | Readonly<{ status: "absent" }>
  | Readonly<{ status: "valid"; authority: BackendConnectionAuthority }>
  | Readonly<{ status: "invalid"; reason: BackendConnectionAuthorityInvalidReason }>
  | Readonly<{ status: "unsupported"; version: number }>;

export type BackendConnection = Readonly<{
  memoraxCodeHome: string;
  authorityPath: string;
  authority?: BackendConnectionAuthority;
  url: string;
  source: "option" | "environment" | "authority" | "default";
  host: string;
  port: number;
  token?: string;
  tokenSource: "environment" | "authority-file" | "none";
}>;

export type BackendTokenRecord = Readonly<{
  version: 1;
  token: string;
  createdAt: string;
  rotatedAt?: string;
}>;

export type BackendTokenRecordInvalidReason =
  | "unreadable"
  | "malformed_json"
  | "invalid_record"
  | "invalid_version"
  | "unknown_fields"
  | "invalid_token"
  | "invalid_created_at"
  | "invalid_rotated_at";

export type BackendTokenRecordState =
  | Readonly<{ status: "absent" }>
  | Readonly<{ status: "valid"; record: BackendTokenRecord }>
  | Readonly<{ status: "invalid"; reason: BackendTokenRecordInvalidReason }>
  | Readonly<{ status: "unsupported"; version: number }>;

export const BACKEND_CONNECTION_VERSION: 1;
export const BACKEND_TOKEN_VERSION: 1;
export const DEFAULT_BACKEND_URL: string;

export class BackendConnectionAuthorityError extends Error {
  constructor(
    state: Extract<BackendConnectionAuthorityState, { status: "invalid" | "unsupported" }>,
    path: string,
  );
  readonly code:
    | "BACKEND_CONNECTION_AUTHORITY_INVALID"
    | "BACKEND_CONNECTION_AUTHORITY_UNSUPPORTED";
  readonly authorityStatus: "invalid" | "unsupported";
  readonly authorityPath: string;
  readonly reason?: BackendConnectionAuthorityInvalidReason;
  readonly version?: number;
}

export class BackendTokenRecordError extends RuntimeRecordError {
  constructor(
    state: Exclude<BackendTokenRecordState, { status: "valid" }>,
    path: string,
  );
}

export function backendConnectionPath(memoraxCodeHome?: string): string;
export function backendTokenPath(memoraxCodeHome?: string): string;
export function readBackendConnectionAuthority(memoraxCodeHome?: string): BackendConnectionAuthorityState;
export function writeBackendConnectionAuthority(options: {
  memoraxCodeHome?: string;
  url: string;
  tokenPath?: string;
}, runtime?: RuntimeRecordWriteRuntime): RuntimeRecordWriteResult<BackendConnectionAuthority>;
export function readBackendTokenRecordState(memoraxCodeHome?: string): BackendTokenRecordState;
export function writeBackendTokenRecord(options: {
  memoraxCodeHome?: string;
  token: string;
  createdAt: string;
  rotatedAt?: string;
}, runtime?: RuntimeRecordWriteRuntime): RuntimeRecordWriteResult<BackendTokenRecord>;
export function resolveBackendConnection(options?: {
  env?: Record<string, string | undefined>;
  memoraxCodeHome?: string;
  backendUrl?: string;
  backendToken?: string;
}): BackendConnection;
export function localBackendRecoveryArguments(
  connection: Pick<BackendConnection, "url" | "source">,
): string[] | undefined;
