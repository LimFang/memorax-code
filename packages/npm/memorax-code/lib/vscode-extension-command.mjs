import { accessSync, constants, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export function defaultVsCodeExtensionRoots(homeDir = homedir()) {
  return [
    join(homeDir, ".vscode", "extensions"),
    join(homeDir, ".vscode-insiders", "extensions"),
    join(homeDir, ".vscode-server", "extensions"),
    join(homeDir, ".vscode-server-insiders", "extensions"),
  ];
}

export function findVsCodeExtensionCommand({
  extensionId,
  extensionRoots,
  commandCandidates,
  platform = process.platform,
  arch = process.arch,
} = {}) {
  if (typeof extensionId !== "string" || !extensionId.trim()) return undefined;
  if (!Array.isArray(extensionRoots) || typeof commandCandidates !== "function") return undefined;

  for (const root of new Set(extensionRoots)) {
    for (const extensionRoot of matchingExtensionRoots(root, extensionId, platform, arch)) {
      for (const command of commandCandidates(extensionRoot)) {
        if (isExecutableCommand(command, platform)) return command;
      }
    }
  }
  return undefined;
}

export function commandOnPath(command, pathValue, platform = process.platform, pathExtValue) {
  const extensions = platform === "win32"
    ? String(pathExtValue ?? ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  for (const root of String(pathValue ?? "").split(delimiter)) {
    if (!root) continue;
    for (const extension of extensions) {
      if (isExecutableCommand(join(root, `${command}${extension}`), platform)) return true;
    }
  }
  return false;
}

export function isExecutableCommand(path, platform = process.platform) {
  try {
    accessSync(path, platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function matchingExtensionRoots(root, extensionId, platform, arch) {
  const [expectedPublisher, expectedName] = extensionId.toLowerCase().split(".", 2);
  if (!expectedPublisher || !expectedName) return [];
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => {
      const extensionRoot = join(root, entry.name);
      const manifest = readExtensionManifest(extensionRoot);
      return {
        extensionRoot,
        publisher: String(manifest?.publisher ?? "").toLowerCase(),
        name: String(manifest?.name ?? "").toLowerCase(),
        version: String(manifest?.version ?? ""),
        targetPlatform: manifest?.__metadata?.targetPlatform,
      };
    })
    .filter((entry) => (
      entry.publisher === expectedPublisher
      && entry.name === expectedName
      && targetPlatformMatches(entry.targetPlatform, platform, arch)
    ))
    .sort((left, right) => (
      right.version.localeCompare(left.version, "en", { numeric: true, sensitivity: "base" })
      || right.extensionRoot.localeCompare(left.extensionRoot, "en", { numeric: true, sensitivity: "base" })
    ))
    .map((entry) => entry.extensionRoot);
}

function readExtensionManifest(extensionRoot) {
  try {
    return JSON.parse(readFileSync(join(extensionRoot, "package.json"), "utf8"));
  } catch {
    return undefined;
  }
}

function targetPlatformMatches(value, platform, arch) {
  const target = String(value ?? "").trim().toLowerCase();
  if (!target || target === "undefined" || target === "universal") return true;
  return vscodeTargetPlatformAliases(platform, arch).includes(target);
}

function vscodeTargetPlatformAliases(platform, arch) {
  if (platform === "darwin") {
    if (arch === "arm64") return ["darwin-arm64"];
    if (arch === "x64") return ["darwin-x64"];
  }
  if (platform === "linux") {
    if (arch === "arm64") return ["linux-arm64", "alpine-arm64"];
    if (arch === "x64") return ["linux-x64", "alpine-x64"];
  }
  if (platform === "win32") {
    if (arch === "arm64") return ["win32-arm64"];
    if (arch === "x64") return ["win32-x64"];
  }
  return [`${platform}-${arch}`];
}
