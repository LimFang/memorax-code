#!/usr/bin/env python3
"""Manage repo-scoped user profile preferences under .repo_memory/user-profile."""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

ALLOWED_TYPES = {"communication", "workflow", "environment", "profile"}
ALLOWED_STATUSES = {"active", "superseded", "deleted"}
GITIGNORE_RULE = ".repo_memory/"
MAX_PREFERENCES_BYTES = 64 * 1024
PREFERENCES_SCHEMA = "repo_user_profile_memory.v0.1"
OWNER = "repo-user-profile-memory"


@dataclass(frozen=True)
class Preference:
    id: str
    type: str
    description: str
    applies_when: str
    do_not_apply_when: str
    created: str
    updated: str
    confidence: str = "user_stated"
    status: str = "active"


class StorageError(RuntimeError):
    """Preference storage is malformed or unsafe to mutate."""


def run(cmd: list[str], cwd: Path) -> tuple[int, str, str]:
    proc = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    return proc.returncode, proc.stdout.strip(), proc.stderr.strip()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def resolve_repo(path: str) -> Path:
    start = Path(path).resolve()
    if not start.exists():
        raise SystemExit(f"Repository path does not exist: {start}")
    code, out, err = run(["git", "rev-parse", "--show-toplevel"], start)
    if code == 0 and out:
        return Path(out).resolve()
    if start.is_file():
        return start.parent
    return start


def gitignore_has_repo_memory_rule(text: str) -> bool:
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("!"):
            continue
        rule = stripped.split("#", 1)[0].strip().lstrip("/")
        if rule in {".repo_memory", ".repo_memory/"}:
            return True
    return False


def ensure_repo_memory_gitignore(repo: Path) -> bool:
    gitignore = repo / ".gitignore"
    existing = gitignore.read_text(encoding="utf-8") if gitignore.exists() else ""
    if gitignore_has_repo_memory_rule(existing):
        return False
    separator = "" if not existing or existing.endswith("\n") else "\n"
    gitignore.write_text(f"{existing}{separator}{GITIGNORE_RULE}\n", encoding="utf-8")
    return True


def normalize_field(value: str) -> str:
    # Keep field values one-line so user text cannot create headings/frontmatter.
    return re.sub(r"\s+", " ", value.replace("\r", " ").replace("\n", " ")).strip()


def normalize_key(value: str) -> str:
    return normalize_field(value).casefold()


def slugify(value: str, fallback: str) -> str:
    ascii_value = value.encode("ascii", "ignore").decode("ascii")
    words = re.findall(r"[a-zA-Z0-9]+", ascii_value.lower())
    slug = "-".join(words[:5]).strip("-")
    return slug or fallback


def preferences_path(repo: Path) -> Path:
    return repo / ".repo_memory" / "user-profile" / "preferences.md"


def lock_path(repo: Path) -> Path:
    return repo / ".repo_memory" / "user-profile" / ".preferences.lock"


@contextmanager
def preference_lock(repo: Path) -> Iterator[None]:
    path = lock_path(repo)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as lock_file:
        if os.name == "nt":
            import msvcrt

            lock_file.seek(0, os.SEEK_END)
            if lock_file.tell() == 0:
                lock_file.write(b"\0")
                lock_file.flush()
            lock_file.seek(0)
            msvcrt.locking(lock_file.fileno(), msvcrt.LK_LOCK, 1)
            try:
                yield
            finally:
                lock_file.seek(0)
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def ensure_storage(repo: Path) -> tuple[Path, bool]:
    gitignore_updated = ensure_repo_memory_gitignore(repo)
    path = preferences_path(repo)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink():
        raise StorageError("Invalid repo user profile preferences: preferences.md must not be a symlink")
    if not path.exists():
        write_preferences(path, [], now_iso())
    return path, gitignore_updated


def strip_ticks(value: str) -> str:
    value = value.strip()
    if value.startswith("`") and value.endswith("`") and len(value) >= 2:
        return value[1:-1]
    return value


def field(block: str, name: str) -> str:
    match = re.search(rf"^- {re.escape(name)}: (.*)$", block, flags=re.MULTILINE)
    return match.group(1).strip() if match else ""


def strip_yaml_scalar(value: str) -> str:
    trimmed = value.strip()
    if len(trimmed) >= 2 and trimmed[0] == trimmed[-1] and trimmed[0] in {'"', "'"}:
        return trimmed[1:-1]
    return trimmed


def parse_frontmatter(text: str) -> dict[str, str]:
    match = re.match(r"^---\r?\n(?P<body>.*?)\r?\n---(?:\r?\n|$)", text, flags=re.DOTALL)
    if not match:
        raise StorageError("Invalid repo user profile preferences: missing frontmatter")
    metadata: dict[str, str] = {}
    for raw_line in match.group("body").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        field_match = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if not field_match:
            raise StorageError("Invalid repo user profile preferences: malformed frontmatter")
        metadata[field_match.group(1)] = strip_yaml_scalar(field_match.group(2))
    return metadata


def parse_non_negative_int(value: str, name: str) -> int:
    normalized = value.strip().replace("_", "")
    if not re.match(r"^\d+$", normalized):
        raise StorageError(f"Invalid repo user profile preferences: {name} must be a non-negative integer")
    return int(normalized)


def validate_frontmatter(text: str) -> tuple[int, int]:
    metadata = parse_frontmatter(text)
    expected = {
        "schema": PREFERENCES_SCHEMA,
        "scope": "repo",
        "owner": OWNER,
        "trust_state": "user_stated",
    }
    for key, value in expected.items():
        if metadata.get(key) != value:
            raise StorageError(f"Invalid repo user profile preferences: {key} mismatch")
    if "active_count" not in metadata or "total_count" not in metadata:
        raise StorageError("Invalid repo user profile preferences: missing counts")
    return (
        parse_non_negative_int(metadata["active_count"], "active_count"),
        parse_non_negative_int(metadata["total_count"], "total_count"),
    )


def read_preferences(path: Path) -> list[Preference]:
    if path.is_symlink():
        raise StorageError("Invalid repo user profile preferences: preferences.md must not be a symlink")
    if not path.exists():
        return []
    if path.stat().st_size > MAX_PREFERENCES_BYTES:
        raise StorageError("Invalid repo user profile preferences: preferences.md is too large")
    text = path.read_text(encoding="utf-8")
    declared_active, declared_total = validate_frontmatter(text)
    entries: list[Preference] = []
    matches = list(re.finditer(r"^## Preference (?P<id>pref_[^\s]+)\s*$", text, flags=re.MULTILINE))
    if len(matches) != declared_total:
        raise StorageError("Invalid repo user profile preferences: total_count mismatch")
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        block = text[start:end]
        status = strip_ticks(field(block, "Status"))
        if status not in ALLOWED_STATUSES:
            raise StorageError("Invalid repo user profile preferences: unknown status")
        pref_type = strip_ticks(field(block, "Type"))
        if pref_type not in ALLOWED_TYPES:
            raise StorageError("Invalid repo user profile preferences: unknown type")
        confidence = strip_ticks(field(block, "Confidence"))
        created = strip_ticks(field(block, "Created"))
        updated = strip_ticks(field(block, "Updated"))
        if not confidence or not created or not updated:
            raise StorageError("Invalid repo user profile preferences: missing required metadata")
        description = normalize_field(field(block, "Description"))
        if status != "active":
            continue
        if not description:
            raise StorageError("Invalid repo user profile preferences: active preference missing description")
        if pref_type not in ALLOWED_TYPES:
            continue
        entries.append(
            Preference(
                id=match.group("id"),
                type=pref_type,
                status=status,
                confidence=confidence,
                created=created,
                updated=updated,
                description=description,
                applies_when=normalize_field(field(block, "Applies when")),
                do_not_apply_when=normalize_field(field(block, "Do not apply when")),
            )
        )
    if len(entries) != declared_active:
        raise StorageError("Invalid repo user profile preferences: active_count mismatch")
    return entries


def entry_markdown(pref: Preference) -> str:
    return "\n".join(
        [
            f"## Preference {pref.id}",
            "",
            f"- Type: `{pref.type}`",
            "- Status: `active`",
            f"- Confidence: `{pref.confidence}`",
            f"- Created: `{pref.created}`",
            f"- Updated: `{pref.updated}`",
            f"- Description: {pref.description}",
            f"- Applies when: {pref.applies_when or '-'}",
            f"- Do not apply when: {pref.do_not_apply_when or '-'}",
            f"- Raw lookup: `preferenceId={pref.id}`",
        ]
    )


def render_preferences(entries: list[Preference], updated_at: str) -> str:
    sorted_entries = sorted(entries, key=lambda pref: pref.updated, reverse=True)
    parts = [
        "---",
        f'schema: "{PREFERENCES_SCHEMA}"',
        'scope: "repo"',
        f'owner: "{OWNER}"',
        'trust_state: "user_stated"',
        f'updated_at: "{updated_at}"',
        f"active_count: {len(sorted_entries)}",
        f"total_count: {len(sorted_entries)}",
        "---",
        "",
        "# Repo-Scoped User Profile And Preferences",
        "",
        "These memories are local to this repository. System, developer, and AGENTS.md instructions override current user instructions, and current user instructions override stored preferences. Do not treat these preferences as evidence about current code behavior.",
        "",
        "## Active Preferences",
        "",
    ]
    if sorted_entries:
        parts.append("\n\n---\n\n".join(entry_markdown(pref) for pref in sorted_entries))
        parts.append("")
    return "\n".join(parts).rstrip() + "\n"


def fsync_directory(path: Path) -> None:
    if os.name == "nt":
        return
    try:
        fd = os.open(path, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_preferences(path: Path, entries: list[Preference], updated_at: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = render_preferences(entries, updated_at)
    if len(text.encode("utf-8")) > MAX_PREFERENCES_BYTES:
        raise StorageError(
            f"Invalid repo user profile preferences: rendered preferences.md exceeds {MAX_PREFERENCES_BYTES} bytes"
        )
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as tmp_file:
            tmp_file.write(text)
            tmp_file.flush()
            os.fsync(tmp_file.fileno())
        os.replace(tmp_path, path)
        fsync_directory(path.parent)
    except Exception:
        try:
            tmp_path.unlink()
        except FileNotFoundError:
            pass
        raise


def make_id(entries: list[Preference], pref_type: str, description: str, timestamp: str) -> str:
    day = timestamp[:10].replace("-", "")
    base = f"pref_{day}_{slugify(description, pref_type + '-preference')}"
    existing = {pref.id for pref in entries}
    if base not in existing:
        return base
    counter = 2
    while f"{base}-{counter}" in existing:
        counter += 1
    return f"{base}-{counter}"


def preference_contains_add_content(pref: Preference, description: str) -> bool:
    requested = normalize_key(description)
    existing_text = normalize_key(" ".join([pref.description, pref.applies_when, pref.do_not_apply_when]))
    return bool(requested) and requested in existing_text


def add_preference(args: argparse.Namespace) -> dict[str, Any]:
    repo = resolve_repo(args.repo)
    with preference_lock(repo):
        path, gitignore_updated = ensure_storage(repo)
        entries = read_preferences(path)
        pref_type = args.type
        description = normalize_field(args.description)
        applies_when = normalize_field(args.applies_when)
        do_not_apply_when = normalize_field(args.do_not_apply_when or "")
        for pref in entries:
            if preference_contains_add_content(pref, description):
                return {
                    "ok": True,
                    "op": "add",
                    "status": "duplicate",
                    "id": pref.id,
                    "active_count": len(entries),
                    "total_count": len(entries),
                    "preferences_path": str(path),
                    "gitignore_updated": gitignore_updated,
                }
        timestamp = now_iso()
        pref = Preference(
            id=make_id(entries, pref_type, description, timestamp),
            type=pref_type,
            description=description,
            applies_when=applies_when,
            do_not_apply_when=do_not_apply_when,
            created=timestamp,
            updated=timestamp,
        )
        entries.append(pref)
        write_preferences(path, entries, timestamp)
        return {
            "ok": True,
            "op": "add",
            "status": "added",
            "id": pref.id,
            "active_count": len(entries),
            "total_count": len(entries),
            "preferences_path": str(path),
            "gitignore_updated": gitignore_updated,
        }


def update_preference(args: argparse.Namespace) -> dict[str, Any]:
    repo = resolve_repo(args.repo)
    with preference_lock(repo):
        path, gitignore_updated = ensure_storage(repo)
        entries = read_preferences(path)
        timestamp = now_iso()
        updated_entries: list[Preference] = []
        found = False
        for pref in entries:
            if pref.id != args.id:
                updated_entries.append(pref)
                continue
            found = True
            updated_entries.append(
                replace(
                    pref,
                    description=normalize_field(args.description),
                    applies_when=normalize_field(args.applies_when) if args.applies_when is not None else pref.applies_when,
                    do_not_apply_when=normalize_field(args.do_not_apply_when) if args.do_not_apply_when is not None else pref.do_not_apply_when,
                    updated=timestamp,
                )
            )
        if not found:
            raise SystemExit(f"Preference id not found: {args.id}")
        write_preferences(path, updated_entries, timestamp)
        return {
            "ok": True,
            "op": "update",
            "status": "updated",
            "id": args.id,
            "active_count": len(updated_entries),
            "total_count": len(updated_entries),
            "preferences_path": str(path),
            "gitignore_updated": gitignore_updated,
        }


def delete_preference(args: argparse.Namespace) -> dict[str, Any]:
    repo = resolve_repo(args.repo)
    with preference_lock(repo):
        path, gitignore_updated = ensure_storage(repo)
        entries = read_preferences(path)
        remaining = [pref for pref in entries if pref.id != args.id]
        if len(remaining) == len(entries):
            raise SystemExit(f"Preference id not found: {args.id}")
        timestamp = now_iso()
        write_preferences(path, remaining, timestamp)
        return {
            "ok": True,
            "op": "delete",
            "status": "deleted",
            "id": args.id,
            "active_count": len(remaining),
            "total_count": len(remaining),
            "preferences_path": str(path),
            "gitignore_updated": gitignore_updated,
        }


def list_preferences(args: argparse.Namespace) -> dict[str, Any]:
    repo = resolve_repo(args.repo)
    path = preferences_path(repo)
    entries = read_preferences(path)
    return {
        "ok": True,
        "op": "list",
        "active_count": len(entries),
        "total_count": len(entries),
        "preferences_path": str(path),
        "preferences": [pref.__dict__ for pref in entries],
    }


def add_common_repo_arg(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--repo", default=".", help="Path inside the target git repository")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage repo-scoped user profile preferences.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    add = subparsers.add_parser("add", help="Add a repo-scoped user preference")
    add_common_repo_arg(add)
    add.add_argument("--type", required=True, choices=sorted(ALLOWED_TYPES))
    add.add_argument("--description", required=True)
    add.add_argument("--applies-when", required=True)
    add.add_argument("--do-not-apply-when", default="")
    add.set_defaults(func=add_preference)

    update = subparsers.add_parser("update", help="Update an existing preference by id")
    add_common_repo_arg(update)
    update.add_argument("--id", required=True)
    update.add_argument("--description", required=True)
    update.add_argument("--applies-when")
    update.add_argument("--do-not-apply-when")
    update.set_defaults(func=update_preference)

    delete = subparsers.add_parser("delete", help="Delete an existing preference by id")
    add_common_repo_arg(delete)
    delete.add_argument("--id", required=True)
    delete.set_defaults(func=delete_preference)

    list_cmd = subparsers.add_parser("list", help="List active preferences")
    add_common_repo_arg(list_cmd)
    list_cmd.set_defaults(func=list_preferences)

    return parser


def main(argv: list[str]) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = args.func(args)
    except StorageError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
