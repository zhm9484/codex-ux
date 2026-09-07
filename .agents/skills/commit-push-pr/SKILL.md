---
name: commit-push-pr
description:
  Commit completed repository changes, push a branch, and open a GitHub pull request. Use when the
  user asks to publish work as a PR.
---

# Commit, Push, and Open a PR

1. Read the repository instructions, then inspect `git status`, the diff, the current branch, and
   its upstream. Keep unrelated user changes out of the commit.
2. Run the repository's required checks. Stop and report failures caused by the proposed change.
3. If necessary, create a focused branch named `codex/<short-topic>`.
4. Stage only the intended files and commit them with this Conventional Commit format:

   ```text
   <type>(<scope>): <summary>
   ```

   Use a short repository area for `scope`, an imperative lowercase summary, and no trailing period.
   Prefer `feat`, `fix`, `docs`, `refactor`, `test`, `ci`, or `chore` as the type. Examples:

   ```text
   feat(editor): add timeline snapping
   fix(server): reject stale revisions
   ci(actions): verify pull requests
   ```

5. Push with `git push -u origin <branch>` and open the PR with `gh pr create`. Use a concise
   Conventional Commit-style title; summarize the change and list the checks run in the PR body.
6. Return the commit hash and PR URL.

Never commit credentials, force-push, bypass hooks, or include unrelated changes. Do not push or
create a PR unless the user's request authorizes those external changes.
