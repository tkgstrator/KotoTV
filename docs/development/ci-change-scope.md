# CI change scope classifier

`.github/workflows/ci-change-scope.yaml` is a reusable workflow
(`workflow_call`) that decides whether a change is documentation-only so callers
can skip heavy test/build jobs. It is dependency-free: no checkout, secrets,
nested concurrency or network access beyond read-only GitHub REST calls through
`actions/github-script@v7`. The classifier is inline JavaScript so the same file
can be copied byte-for-byte across repositories.

## Contract

Inputs (all strings/booleans, passed as literals by the caller):

| Input | Default | Meaning |
| --- | --- | --- |
| `doc-paths` | `[]` | JSON array of exact documentation paths (`.md` or `LICENSE`). |
| `doc-prefixes` | `[]` | JSON array of directory prefixes with a trailing slash. Only `*.md` files beneath them qualify. |
| `runner` | `"ubuntu-latest"` | JSON Linux runner label or array of labels. |
| `force-heavy` | `false` | When `true`, always report `docs_only=false` (release, manual and closed-event callers). |

Outputs: `docs_only` (`"true"`/`"false"`) and `reason` (short text).
Permissions: `contents: read` only, including nested release callers.

## Decision rules

`docs_only=true` requires every changed file to be `added` or `modified`, to
have a plain relative name, and to match the allowlist. Everything else is
`false`, with the reason recorded:

- Events other than `pull_request` (`opened`, `synchronize`, `reopened`,
  `ready_for_review`) and branch `push` are always heavy: manual, schedule,
  release, `merge_group`, tags and unknown events.
- Pull requests: compare the immutable event base/head SHAs, without mutable PR
  endpoints. The event changed-file count must be 1..299 and match the complete
  comparison (fewer than 300 files, at most 100 fully listed commits). Larger or
  mismatched comparisons run heavy checks. Later branch updates cannot change
  the classification of that snapshot. Merge decisions must still check the
  latest head and required statuses under the repository's branch protection.
- Pushes: not forced, non-zero before/after, `refs/heads/` only; the compare must
  be `ahead`, its base and merge base must equal `before`, `total_commits` is
  1..100 and equals the listed commits whose last SHA is `after`, and the file
  list must be 1..99 entries (a conservative budget below the API's separate
  300-file comparison limit; `per_page` limits commits, not files).
  GitHub documents the separate first-page file limit in
  [Compare two commits](https://docs.github.com/en/rest/commits/commits#compare-two-commits).
- Renames, removals, copies and unknown statuses are heavy.
- Paths with traversal, absolute or backslash forms, whitespace, control or
  shell-special characters are heavy.
- Allowlist inputs that are malformed, empty, or that touch `.github`,
  `.devcontainer`, source, tests, resources, dependency, build, signing or other
  denied directories are rejected (heavy). Inputs cannot override the denylist.
  Markdown is never allowed extension-wide.
- Any API error, parse error or incomplete diff yields `false`. There is no
  `continue-on-error`; failures to write the job summary only warn and never
  change the result. Summary file names are written as code blocks, capped at 200.

## Caller guidance

Keep the required status check names stable and let a docs-only result skip the
heavy steps inside them (or report success from a light job with the same name).
A docs-only exemption means the tests were **not executed**; it does not mean
they passed. Keep lightweight checks (lint, link/format checks, commit lint)
running. When the scope is unknown, run the heavy checks. Pass `force-heavy`
for release or manual gates. Define the allowlist per repository after
confirming which directories are human-only documentation.

## Tests

The canonical test suite is maintained in `qtmleap/devcontainers`; copied
workflows do not require a duplicate test file. From that repository root:

```sh
node --test scripts/tests/test-ci-change-scope.mjs
```

The tests extract the inline script from the YAML and execute it with fake
`github`, `context` and `core` objects (no network, no YAML dependency).
