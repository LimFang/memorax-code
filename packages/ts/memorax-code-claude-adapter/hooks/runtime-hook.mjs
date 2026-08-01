#!/usr/bin/env node
import { runClaudeHookComponent } from "./hook-launcher.mjs";

await runClaudeHookComponent(process.argv[2]);
