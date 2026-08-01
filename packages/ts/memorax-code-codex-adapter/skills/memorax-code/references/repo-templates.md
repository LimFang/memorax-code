# Repo Memory Authoring Templates

Use these templates as fill-in scaffolds. Replace all bracketed placeholders with conclusions from local code inspection and raw facets. Remove sections that are genuinely unavailable; do not leave placeholders in final files.

### `.repo_memory/PROFILE.md`

```markdown
---
schema: "repo_memory_profile.v0.1"
layout: "profile_with_progressive_resources.v0.1"
disclosure_model: "progressive"
repo_name: "[repo name]"
repo_owner: "[owner or empty]"
repo_full_name: "[owner/name or empty]"
repo_url: "[remote URL or empty]"
code_host_provider: "github|gitlab|none"
source_repo_path: "[absolute repo path]"
generated_at: "[ISO timestamp]"
build_mode: "lightweight|deep"
local_head: "[git HEAD]"
local_branch: "[branch or detached HEAD]"
working_tree_state: "clean|dirty|unknown"
trust_state: "draft"
code_host_resource_state: "available|unavailable|partial"
resources:
  commits: "resources/commits.md"
  prs: "resources/prs.md"
  issues: "resources/issues.md"
raw:
  prepare_report: "raw/prepare-report.json"
  commit_facets: "raw/git-commits.json"
  provider_facets: "raw/github-facets.json|raw/gitlab-facets.json|"
---

# [Repo Name] Repo Memory Profile

## Identity And Checkout

- Repository: `[owner/name]` at `[absolute path]`.
- Local HEAD when prepared: `[sha]` on `[branch]`.
- Prepared at: `[timestamp]`; working tree was `[clean/dirty + explanation]`.
- License: `[license if known]`.
- Primary purpose: [1-3 sentences explaining what this project does, based on docs and code].

## Evidence Inspected

- Build mode: `[lightweight|deep]`.
- Root docs and agent instructions: `[README/docs/AGENTS.md/CLAUDE.md or similar files inspected]`.
- Module docs: `[module README/docs inspected]`.
- Representative source: `[important source/entrypoint files inspected, or 'not inspected in lightweight mode']`.
- Manifests/scripts/CI: `[manifests, scripts, workflows inspected, or 'not inspected in lightweight mode']`.
- Local commit snapshot: `[raw/git-commits.json status and count]`.
- Historical code-host snapshot: `[raw/github-facets.json or raw/gitlab-facets.json status and counts]`.

## Agent Consumption Rules

1. Read this file first, then inspect the live code path you plan to edit. Memory is an index, not proof.
2. [Repo-specific safety or ownership rule].
3. [Repo-specific preferred extension pattern].
4. Treat PR/issue resources as historical/contextual; verify current behavior in code and tests.

## Coding Memory Boundary

This repo memory is a cold-start repository map. Use it for module routing,
historical PR/issue context, architecture boundaries, verification gates, and
repository-specific conventions.

Runtime coding memory is narrower and should take precedence when it matches
the current repo, module, API, behavior, lifecycle surface, ownership boundary,
or failure mode. Use runtime coding memory for verified repair invariants,
failed-attempt evidence, mutable-state ownership, callback/hook boundaries,
adapter behavior, validation contracts, and other task-learned engineering
lessons.

Do not treat repo memory, commits, PRs, or issues as implementation recipes.
They are routing evidence and historical context. Always verify current
behavior against live source and focused checks before editing.

## Architecture Map

- `[module/path]`: [What it does, important entrypoints, how it relates to other modules].
- `[module/path]`: [What it does, important entrypoints, how it relates to other modules].

## Runtime Flow

- [Main runtime/request/training/build flow].
- [How modules communicate or hand off data].
- [Where state, artifacts, configs, or generated outputs live].

## Verification Gates

- [Documentation-only verification].
- [Syntax/static checks].
- [Unit/smoke/integration checks].
- [Expensive or environment-dependent checks and required services].

## Resource Pointers

- Commit resource: `.repo_memory/resources/commits.md`.
- PR resource: `.repo_memory/resources/prs.md`.
- Issue resource: `.repo_memory/resources/issues.md`.
- Raw local commit facets: `.repo_memory/raw/git-commits.json`.
- Raw code-host facets: `.repo_memory/raw/github-facets.json` or `.repo_memory/raw/gitlab-facets.json`.
- Mechanical preparation facts: `.repo_memory/raw/prepare-report.json`.

## Code Host Snapshot Notes

- [Major merged PR themes].
- [Recent local commit themes].
- [Open PR themes and warning that they are not landed behavior].
- [Issue clusters / user pain points].

## Retrieval Flow

1. Start here for module ownership, boundaries, and verification gates.
2. Open the relevant module docs/source entrypoints for the target path.
3. Search `resources/*.md` by module, file, symbol, branch, SHA, PR/MR number, or issue number when historical context matters.
4. Open matched `resources/*.md` sections for compact human-readable commit/PR/issue routing.
5. Use `raw/git-commits.json`, `raw/github-facets.json`, or `raw/gitlab-facets.json` only when compact resources are insufficient or a matched section points to a raw facet.
```

### `.repo_memory/resources/commits.md`

Use fixed-field sections, not Markdown tables. Every commit needs a search-grade `Description` following the standard in `SKILL.md`. Do not paste the full raw summary; full raw summaries stay in `../raw/git-commits.json`.

```markdown
---
schema: "repo_memory_commit_resource.v0.1"
repo_full_name: "[owner/name or local repo name]"
generated_at: "[ISO timestamp]"
source: "git_commit_facets"
resource_count: [count]
trust_state: "draft_resource"
raw_source: "../raw/git-commits.json"
---

# Commit Resource Snapshot

Source: `.repo_memory/raw/git-commits.json`. Treat commits as local checkout history only: they are useful routing evidence, but current-code verification is still required.

## Commit [short_sha]: [title]

- SHA: `[full sha]`
- Author: `[author name]`
- Authored: `[ISO timestamp]`
- Modules: `[semantic modules for human routing]`
- Path modules: `[path prefixes from raw facets or current inspection]`
- Description: [2-4 search-grade sentences: what this commit changes, when future agents should open it, affected modules/files/runtime behavior, search cues, and evidence strength]
- Key files: `[path/a.py]`, `[path/b.md]`
- Diff: `[changed_files] files, +[additions]/-[deletions]`
- Parent count: `[count]`
- Agent note: [how future agents should treat this commit]
- Raw lookup: `facetId=commit.abc1234`

---

## Commit [short_sha]: [title]

- SHA: `...`
- Author: `...`
- Authored: `...`
- Modules: `...`
- Path modules: `...`
- Description: ...
- Key files: ...
- Diff: ...
- Parent count: ...
- Agent note: ...
- Raw lookup: `facetId=commit.abc1234`
```

### `.repo_memory/resources/prs.md`

Use fixed-field sections, not Markdown tables. Every GitHub PR or GitLab MR needs a search-grade `Description` following the standard in `SKILL.md`. Do not paste the full raw summary; full raw summaries stay in `../raw/github-facets.json` or `../raw/gitlab-facets.json`.

```markdown
---
schema: "repo_memory_pr_resource.v0.1"
repo_full_name: "[owner/name]"
generated_at: "[ISO timestamp]"
source: "github_resource_facets|gitlab_resource_facets"
resource_count: [count]
trust_state: "draft_resource"
raw_source: "../raw/github-facets.json|../raw/gitlab-facets.json"
---

# Pull Request Resource Snapshot

Source: `.repo_memory/raw/github-facets.json` or `.repo_memory/raw/gitlab-facets.json`. Treat PRs/MRs as historical context only: merged PRs/MRs still require current-code verification, open PRs/MRs are branch intent, and closed-unmerged PRs/MRs are weak evidence.

## PR/MR #[number]: [title]

- State: `MERGED|OPEN|CLOSED` [include draft if applicable]
- Branch: `base <- head`
- Modules: `[semantic modules for human routing]`
- Path modules: `[path prefixes from raw facets or current inspection]`
- Description: [2-4 search-grade sentences: what this PR explains, when future agents should open it, affected modules/files/runtime behavior, search cues, and evidence strength]
- Key files: `[path/a.py]`, `[path/b.md]`
- Diff: `[changed_files] files, +[additions]/-[deletions]`
- Linked issues: `#[issue]` or `-`
- Commit signal: [1-3 commit headlines or `-`]
- Agent note: [how future agents should treat this PR]
- URL: [PR URL]
- Raw lookup: use `facetId=pr.123` for GitHub PRs or `facetId=mr.123` for GitLab MRs.

---

## PR/MR #[number]: [title]

- State: `...`
- Branch: `...`
- Modules: `...`
- Path modules: `...`
- Description: ...
- Key files: ...
- Diff: ...
- Linked issues: ...
- Commit signal: ...
- Agent note: ...
- URL: ...
- Raw lookup: use `facetId=pr.123` for GitHub PRs or `facetId=mr.123` for GitLab MRs.
```

### `.repo_memory/resources/issues.md`

Use fixed-field sections, not Markdown tables. Every issue needs a search-grade `Description` following the standard in `SKILL.md`. Keep evidence compact; full raw summaries stay in `../raw/github-facets.json` or `../raw/gitlab-facets.json`.

```markdown
---
schema: "repo_memory_issue_resource.v0.1"
repo_full_name: "[owner/name]"
generated_at: "[ISO timestamp]"
source: "github_resource_facets|gitlab_resource_facets"
resource_count: [count]
trust_state: "draft_resource"
raw_source: "../raw/github-facets.json|../raw/gitlab-facets.json"
---

# Issue Resource Snapshot

Source: `.repo_memory/raw/github-facets.json` or `.repo_memory/raw/gitlab-facets.json`. Treat issues as requirement, bug, support, or planning context; verify against current code before acting.

## Issue #[number]: [title]

- State: `OPEN|CLOSED`
- Modules: `[semantic modules for human routing]`
- Path modules: `[path prefixes from linked PR facets or current inspection, or -]`
- Description: [2-4 search-grade sentences: what user problem/request this issue explains, when future agents should open it, affected behavior/modules, symptoms/errors, search cues, and evidence strength]
- Evidence: [short evidence: label, error, user pain point, requirement, or theme]
- Linked PRs: `#[pr]` or `-`
- Linked branches: `base <- head` or `-`
- Agent note: [how future agents should use this issue]
- URL: [Issue URL]
- Raw lookup: `facetId=issue.123`

---

## Issue #[number]: [title]

- State: `...`
- Modules: `...`
- Path modules: `...`
- Description: ...
- Evidence: ...
- Linked PRs: ...
- Linked branches: ...
- Agent note: ...
- URL: ...
- Raw lookup: `facetId=issue.123`
```
