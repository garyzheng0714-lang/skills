---
name: skills-repo-sync
description: Manage a shared GitHub skills repository by validating, diffing, syncing, and reporting changes for one local skill folder. Use when Codex needs to save or update a skill into git@github.com:garyzheng0714-lang/skills.git for multi-device synchronization, including add-if-missing and update-if-existing workflows.
---

# Skills Repo Sync

## Execute Workflow

1. Accept one local source skill folder path from the user.
2. Run the sync script to validate source structure, compare file-level diffs, and sync to repository.
3. Read the generated report and present: operation (`add` / `update` / `no-change`), file counts, and key changed files.
4. If the user asks to persist remote changes, run commit and push.

## Use Script

- Script path: `scripts/sync_skill_folder.py`
- Default repository URL: `git@github.com:garyzheng0714-lang/skills.git`
- Default local repository path: `~/.codex/repos/skills`
- Default branch: `main`
- Sync target rule: use source folder name as target folder name unless `--skill-name` is specified.

### Dry-run validation and diff

```bash
python3 scripts/sync_skill_folder.py \
  --source "/absolute/path/to/skill-folder" \
  --dry-run
```

### Apply sync and write report files

```bash
python3 scripts/sync_skill_folder.py \
  --source "/absolute/path/to/skill-folder" \
  --report "/tmp/skill-sync-report.md" \
  --json-report "/tmp/skill-sync-report.json"
```

### Use non-default target in repository

```bash
python3 scripts/sync_skill_folder.py \
  --source "/absolute/path/to/local-skill-folder" \
  --skill-name "custom-skill-name" \
  --skills-subdir "skills"
```

## Enforce Guardrails

1. Validate before write: require `SKILL.md` and frontmatter `name` + `description`.
2. Refuse sync if repository has local uncommitted changes.
3. Refuse sync if repository remote URL does not match expected remote.
4. Skip noise files (`.DS_Store`, `__pycache__`, `*.pyc`) during compare and copy.
5. Always output an update report after dry-run or apply.

## Commit and Push (Optional)

Run these commands only when the user explicitly asks for remote persistence:

```bash
git -C ~/.codex/repos/skills add <skill-folder-name>
git -C ~/.codex/repos/skills commit -m "sync: update <skill-folder-name>"
git -C ~/.codex/repos/skills push origin main
```
