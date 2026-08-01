import { readFileSync } from "node:fs";

const manifestUrl = new URL("../packages/npm/memorax-code/shipped-docs.json", import.meta.url);
const parsed = JSON.parse(readFileSync(manifestUrl, "utf8"));

if (!Array.isArray(parsed)
  || parsed.some((path) => typeof path !== "string"
    || !/^(?:[a-z0-9][a-z0-9.-]*\/)*[a-z0-9][a-z0-9.-]*\.md$/i.test(path)
    || path.split("/").some((part) => part === "." || part === ".."))
  || new Set(parsed).size !== parsed.length) {
  throw new Error("invalid npm shipped-docs manifest");
}

export const npmShippedDocs = Object.freeze([...parsed]);
