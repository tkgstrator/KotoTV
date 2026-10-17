# Repository instructions

<!-- non-code-verification -->
## Verification for non-code changes

- For changes limited to audited development documentation, do not start heavy
  local or CI builds, simulator/UI suites, integration tests, or benchmarks.
  Run the lightweight scope/policy checks and record a documentation-only
  exemption; do not report unexecuted tests as passing.
- Source, tests, runtime/build inputs, assets, dependencies, lockfiles, signing,
  and CI configuration changes still require the applicable verification.
  Determine the actual changed inputs; an unknown or incomplete diff runs heavy.
- Use the repository's explicit documentation allowlist and adopted change-scope
  workflow. Markdown consumed by the product or tests is an input, not a blanket
  exemption. Keep required status names, lightweight checks, and existing
  manual, scheduled, release, and deployment gates intact.
- See `docs/development/ci-change-scope.md` for the common classifier contract.
<!-- /non-code-verification -->
