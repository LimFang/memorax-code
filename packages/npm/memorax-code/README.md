# @memorax/memorax-code

MemoraX Code adds persistent coding memory to Codex, Claude Code, DeepSeek
Harness, and OpenCode.

## Requirements

- Node.js 20 or newer (Node.js 24 LTS recommended) and npm.
- At least one of Codex, Claude Code, DeepSeek Harness, OpenCode Desktop, or
  the OpenCode CLI.
- Python 3 only for Repo Memory operations.

## Install

```bash
npm install -g @memorax/memorax-code
memorax-code setup
```

Setup automatically detects supported coding agents and completes an
account-free connection. If you already have a MemoraX account, run
`memorax-code setup --existing-account` instead. Later setup runs reuse a
complete saved configuration; use `memorax-code setup --reconfigure` to
replace it.

After the first installation, restart or refresh the detected coding agents
before opening a new session. In Codex, enable **MemoraX Code Codex Adapter**
from Plugins or `/plugins` if it is not already enabled.

## Verify

```bash
memorax-code --version
memorax-code status
memorax-cli status
```

For configuration or troubleshooting, see the documentation shipped with the
package:

- `docs/configuration.md`
- `docs/troubleshooting.md`

## License

MIT
