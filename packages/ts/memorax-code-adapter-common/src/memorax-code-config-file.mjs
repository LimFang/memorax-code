import {
  accessSync,
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  fchmodSync,
  fchownSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

export const CONFIG_UPDATE_WARNING = "MemoraX Code config could not be safely updated or verified; existing config was preserved.";

const defaultOperations = {
  accessSync,
  chmodSync,
  closeSync,
  copyFileSync,
  fchmodSync,
  fchownSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
};

export function updateConfigFileAtomically({
  path,
  defaultText,
  transform,
  parseToml,
  warn = console.warn,
  operations = {},
  platform = process.platform,
}) {
  const fs = { ...defaultOperations, ...operations };
  let existingStat;
  try {
    existingStat = fs.lstatSync(path);
    if (!existingStat.isFile()) return failed(warn);
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") return failed(warn);
  }

  let existingText;
  if (existingStat) {
    try {
      existingText = fs.readFileSync(path, "utf8");
    } catch {
      return failed(warn);
    }
  }

  let candidate;
  let unchanged = false;
  try {
    if (existingText === undefined) {
      candidate = defaultText;
    } else {
      const parsed = parseToml(existingText);
      candidate = transform(existingText, parsed);
      unchanged = candidate === existingText;
    }
    if (!unchanged) parseToml(candidate);
  } catch {
    return failed(warn);
  }

  try {
    ensurePrivateConfigDirectoryWithOperations(fs, path, platform);
  } catch {
    return failed(warn);
  }
  if (unchanged) return "unchanged";
  if (existingText !== undefined) {
    try {
      fs.accessSync(path, constants.W_OK);
    } catch {
      return failed(warn);
    }
  }

  const uniqueSuffix = `${process.pid}.${randomUUID()}`;
  const tempPath = join(dirname(path), `.${basename(path)}.${uniqueSuffix}.tmp`);
  const backupPath = existingStat
    ? join(dirname(path), `.${basename(path)}.${uniqueSuffix}.bak`)
    : undefined;
  let fd;
  let backupCreated = false;
  let renamed = false;
  try {
    fd = fs.openSync(tempPath, "wx", 0o600);
    fs.writeFileSync(fd, candidate, "utf8");
    if (existingStat && platform !== "win32") {
      fs.fchownSync(fd, existingStat.uid, existingStat.gid);
      fs.fchmodSync(fd, existingStat.mode & 0o7777);
    } else if (!existingStat && platform !== "win32") {
      fs.fchmodSync(fd, 0o600);
    }
    fs.closeSync(fd);
    fd = undefined;
    if (backupPath) {
      if (platform === "win32") {
        fs.copyFileSync(path, backupPath, constants.COPYFILE_EXCL);
      } else {
        fs.linkSync(path, backupPath);
      }
      backupCreated = true;
    }
    fs.renameSync(tempPath, path);
    renamed = true;
  } catch {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // Best effort: unlinking an open temporary file is safe on supported Unix hosts.
      }
    }
    if (!renamed) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // The temporary file may not have been created or may already have been renamed.
      }
    }
    if (backupCreated && backupPath) {
      try {
        fs.unlinkSync(backupPath);
      } catch {
        // The original target is still authoritative when rename has not completed.
      }
    }
    return failed(warn);
  }

  try {
    const verifiedText = fs.readFileSync(path, "utf8");
    if (verifiedText !== candidate) throw new Error("config verification failed");
    parseToml(verifiedText);
    const verifiedStat = fs.lstatSync(path);
    if (!verifiedStat.isFile()) throw new Error("config type verification failed");
    if (platform !== "win32") {
      const expectedMode = existingStat ? existingStat.mode & 0o7777 : 0o600;
      if ((verifiedStat.mode & 0o7777) !== expectedMode) throw new Error("config mode verification failed");
      if (existingStat && (verifiedStat.uid !== existingStat.uid || verifiedStat.gid !== existingStat.gid)) {
        throw new Error("config owner verification failed");
      }
    }
    if (backupCreated && backupPath) {
      fs.unlinkSync(backupPath);
      backupCreated = false;
    }
  } catch {
    if (existingStat && backupCreated && backupPath) {
      if (platform === "win32") {
        const restorePath = join(dirname(path), `.${basename(path)}.${uniqueSuffix}.restore.tmp`);
        let restoreCopied = false;
        try {
          fs.copyFileSync(backupPath, restorePath, constants.COPYFILE_EXCL);
          restoreCopied = true;
          fs.renameSync(restorePath, path);
          restoreCopied = false;
          fs.unlinkSync(backupPath);
          backupCreated = false;
        } catch {
          if (restoreCopied) {
            try {
              fs.unlinkSync(restorePath);
            } catch {
              // Keep the original backup for operator recovery.
            }
          }
        }
      } else {
        try {
          fs.renameSync(backupPath, path);
          backupCreated = false;
        } catch {
          // Keep the hard-link backup for operator recovery if atomic restore itself fails.
        }
      }
    } else if (!existingStat) {
      try {
        fs.unlinkSync(path);
      } catch {
        // Best effort: the new target may already be absent.
      }
    }
    return failed(warn);
  }
  return existingText === undefined ? "created" : "updated";
}

export function ensurePrivateConfigDirectory(
  path,
  { operations = {}, platform = process.platform } = {},
) {
  const fs = { ...defaultOperations, ...operations };
  ensurePrivateConfigDirectoryWithOperations(fs, path, platform);
}

export function setTomlField(text, section, key, renderedValue) {
  const source = String(text ?? "");
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  const escapedSection = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const header = new RegExp(`^\\s*\\[(?:${escapedSection}|"${escapedSection}"|'${escapedSection}')\\]\\s*(?:#.*)?$`);
  const assignment = new RegExp(`^(\\s*(?:${escapedKey}|"${escapedKey}"|'${escapedKey}')\\s*=\\s*)`);
  const start = lines.findIndex((line) => header.test(line));
  if (start === -1) {
    if (renderedValue === undefined) return source;
    const separator = source.length === 0
      ? ""
      : source.endsWith(`${newline}${newline}`)
        ? ""
        : source.endsWith(newline)
          ? newline
          : `${newline}${newline}`;
    return `${source}${separator}[${section}]${newline}${key} = ${renderedValue}${newline}`;
  }
  const nextHeader = lines.findIndex((line, index) => index > start && /^\s*\[/.test(line));
  const end = nextHeader === -1 ? lines.length : nextHeader;
  const field = lines.findIndex((line, index) => index > start && index < end && assignment.test(line));
  if (field !== -1) {
    if (renderedValue === undefined) {
      lines.splice(field, 1);
    } else {
      const prefix = lines[field].match(assignment)?.[1] ?? `${key} = `;
      const comment = tomlInlineComment(lines[field].slice(prefix.length));
      lines[field] = `${prefix}${renderedValue}${comment}`;
    }
  } else if (renderedValue !== undefined) {
    lines.splice(start + 1, 0, `${key} = ${renderedValue}`);
  }
  return lines.join(newline);
}

function ensurePrivateConfigDirectoryWithOperations(fs, path, platform) {
  const directoryPath = dirname(path);
  fs.mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
  if (platform !== "win32") fs.chmodSync(directoryPath, 0o700);
}

function failed(warn) {
  warn(CONFIG_UPDATE_WARNING);
  return "failed";
}

function tomlInlineComment(value) {
  let quote;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote === '"' && escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "#") {
      let commentStart = index;
      while (commentStart > 0 && /[ \t]/.test(value[commentStart - 1])) commentStart -= 1;
      return value.slice(commentStart);
    }
  }
  return "";
}

function isNodeError(error) {
  return error instanceof Error;
}
