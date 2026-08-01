export type ClientHookRuntimeGeneration = Readonly<{
  version: number;
  runtimeAbi: number;
  generationId: string;
  packageVersion: string;
  contentDigest: string;
  createdAt: string;
  generationPath?: string;
  reused?: boolean;
}>;

export type ActivatedClientHookRuntimeGeneration = Readonly<{
  version: number;
  runtimeAbi: number;
  generationId: string;
  packageVersion: string;
  contentDigest: string;
  activatedAt: string;
  generationPath: string;
  durability: "confirmed" | "uncertain";
  durabilityErrorCode?: string;
}>;

export const CLIENT_HOOK_RUNTIME_ABI: number;

export function stageClientHookRuntimeGeneration(options: {
  packageRoot: string;
  memoraxCodeHome: string;
  now?: () => Date;
  syncFile?: (path: string) => void;
  syncDirectory?: (path: string) => void;
}): ClientHookRuntimeGeneration;

export function activateClientHookRuntimeGeneration(options: {
  memoraxCodeHome: string;
  generation: ClientHookRuntimeGeneration;
  now?: () => Date;
}): ActivatedClientHookRuntimeGeneration;
