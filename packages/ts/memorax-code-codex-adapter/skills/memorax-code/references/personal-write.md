# Personal Memory Write

Use these instructions only to save, update, forget, or delete repository-scoped personal memory. Classify by what the content prescribes, not wording such as "I prefer", "I like", "我的习惯", or "我喜欢".

## Route The Write

- **Procedure memory:** actions, ordering, checklists, prerequisites, gates, validation, exceptions, or repeatable repository work rules. Require the user to explicitly ask to remember, save, record, update, forget, or delete them.
- **User-profile memory:** preferred name, language, tone, verbosity, explanation style, result presentation, or another safe personal profile fact. A durable repository-scoped profile preference may be saved implicitly.

Store each part under its own authority when a request genuinely contains both. Do not persist current-task instructions or temporary plans.

Keep file names, schema and script field names, type values, command options, and fixed Markdown headings in English. Write human-readable memory content in the user's current interaction language unless the user explicitly requests another storage language. This includes procedure titles and steps and user-profile descriptions, applicability, and exceptions. Preserve exact code identifiers, commands, paths, API names, and quoted literals without translation.

## Procedure Memory

Before writing, ensure the repository root `.gitignore` contains `.repo_memory/`. Store each procedure topic in its own concise kebab-case file directly under:

```text
<repo>/.repo_memory/procedure-memory/
```

Do not create a global procedures file, index, event log, generated metadata, or version history. Do not edit `.repo_memory/PROFILE.md`, `.repo_memory/resources/`, `.repo_memory/raw/`, or `.repo_memory/user-profile/`.

Choose the closest existing topic file. Update it when the user refines the same procedure; create a new file only for a distinct topic. Remove superseded wording rather than preserving old versions.

Use this shape when useful:

```markdown
# 代码审查

Use when: 审查当前仓库中的代码变更时。

## Procedure

1. 创建 PR 前先审查变更。
2. 解决阻塞性问题。
3. 审查完成后再创建 PR。

## Exceptions

- 优先遵循用户当前提出的更具体指令。
```

Delete only the topic file or section the user explicitly identifies. Do not retain deleted text in tombstones, backups, inactive entries, or history files.

## User-Profile Memory

Use only:

```text
<repo>/.repo_memory/user-profile/preferences.md
```

Resolve `<skill-dir>` as the parent directory of the `references/` directory containing this file. The script owns directory creation, `.gitignore` updates, parsing, normalization, locking, duplicate detection, counts, and deterministic rewriting. Do not hand-edit `preferences.md` except when diagnosing a script failure.

List existing preferences before adding and perform semantic matching:

```bash
python3 <skill-dir>/scripts/user_profile_memory.py list --repo <repo>
```

If equivalent content exists, do not add it again. Update the matching id when an existing entry expresses the same preference differently. Add only a genuinely new preference:

```bash
python3 <skill-dir>/scripts/user_profile_memory.py add \
  --repo <repo> \
  --type communication \
  --description "用户希望在当前仓库中使用简洁的中文回答。" \
  --applies-when "回答当前仓库相关问题时。" \
  --do-not-apply-when "用户明确要求使用其他语言或格式。"
```

Allowed script types are `communication`, `workflow`, `environment`, and `profile`. These type names do not expand this authority: never use `workflow` or `environment` to store an executable repository procedure.

Update a clearly identified preference in place:

```bash
python3 <skill-dir>/scripts/user_profile_memory.py update \
  --repo <repo> \
  --id <preference-id> \
  --description <current-description> \
  --applies-when <current-scope> \
  --do-not-apply-when <exception>
```

If multiple preferences may match, ask the user to choose before updating. Delete only an explicitly identified preference:

```bash
python3 <skill-dir>/scripts/user_profile_memory.py delete \
  --repo <repo> \
  --id <preference-id>
```

For delete-all requests, list active preferences and delete each id. Do not preserve deleted text elsewhere.

## Safety And Output

Do not store secrets, tokens, credentials, `.env` content, sensitive personal data, repository facts, code history, design rationale, one-off task details, raw transcripts, hidden tests, exact patches, raw diffs, target commits, or unsafe destructive commands.

After a successful write, update, or deletion, identify the affected topic or preference briefly and confirm that it is local to the current repository.
