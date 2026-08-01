#!/usr/bin/env node
import { runBackendEntrypoint } from "../lib/run-entrypoint.mjs";

await runBackendEntrypoint("server.js");
