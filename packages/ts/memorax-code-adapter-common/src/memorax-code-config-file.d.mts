export const CONFIG_UPDATE_WARNING: string;

export type ConfigFileUpdateResult = "created" | "updated" | "unchanged" | "failed";

export function updateConfigFileAtomically(options: {
  path: string;
  defaultText: string;
  transform: (text: string, parsed: unknown) => string;
  parseToml: (text: string) => unknown;
  warn?: (message: string) => void;
  operations?: Record<string, (...args: any[]) => any>;
  platform?: NodeJS.Platform;
}): ConfigFileUpdateResult;

export function ensurePrivateConfigDirectory(
  path: string,
  options?: {
    operations?: Record<string, (...args: any[]) => any>;
    platform?: NodeJS.Platform;
  },
): void;

export function setTomlField(
  text: string,
  section: string,
  key: string,
  renderedValue: string | undefined,
): string;
