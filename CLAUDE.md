Skills are organized into bucket folders under `skills/`:

- `engineering/` — daily code work
- `productivity/` — daily non-code workflow tools
- `personal/` — tied to my own setup, not promoted

This repo maintains **one README only**: the top-level `README.md`. Bucket folders do not have their own `README.md`. Every skill in `engineering/` or `productivity/` (the **promoted** buckets) must have an entry in the top-level `README.md`, grouped under its bucket heading, with the skill name linked to its `SKILL.md` and a one-line description. Skills in `personal/` are listed under the Personal heading of the same `README.md`.

The Claude Code plugin ships the skills listed in `.claude-plugin/plugin.json`'s `skills` array. When adding a skill that should ship with the plugin, add it to that array; when removing or renaming one, update the array to match. The repo is also its own single-plugin Claude Code marketplace: `.claude-plugin/marketplace.json` lists the one `yoliani-skills` plugin. When bumping the release version, keep `.claude-plugin/plugin.json`'s `version` in sync with `package.json`'s — Claude uses the plugin `version` to decide when installed users see an update. Run `claude plugin validate . --strict` after touching either manifest.

`CONTEXT.md` is the shared language for this repo. When a term is defined there, use it — in skill descriptions, commit messages, and conversation — instead of a synonym. When you introduce a new recurring concept (or catch two names for the same thing), add or resolve it in `CONTEXT.md`.

To (re)link every skill into the local harness skill directories (`~/.claude/skills`, `~/.agents/skills`), run `scripts/link-skills.sh`. Each entry is a symlink into this repo, so a `git pull` keeps installed skills current; re-run the script after adding, removing, or renaming a skill. `scripts/list-skills.sh` lists every skill in the repo.
