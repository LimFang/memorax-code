#!/usr/bin/env node
import { runCodexHookComponent } from "./hook-launcher.mjs";

await runCodexHookComponent(process.argv[2]);
