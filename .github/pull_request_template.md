<!--
Keep the pull request focused on one problem. The format below comes from CONTRIBUTING.md (change summary)
and docs/testing/test-plan.md (section 3, verification). Write "None" plus a reason for any document the
change does not affect. No real rider data, secrets, or security details in this description.
-->

## Change summary

```text
What changed:
Why:
Product impact (product.md):
Roadmap impact (roadmap.md):
Feature impact (feature.md):
Security impact (SECURITY.md):
Audit impact (AUDIT.md):
Docs updated:
Test plan: <"Test plan updated: what and why" or "No test plan update needed: why">
Status: Planned | Implemented | Verified (what was checked and how)
Open questions:
```

## Verification

```text
Author: Claude Code | Codex | <name>
Verifier: Codex | Claude Code | <name> | Pending (reason)
Tested commit: <full SHA>
Author checks: <commands run> -> <results>
Verifier checks: <commands and scenarios> -> <results>
Remaining gaps: <untested areas, blocked checks, assumptions>
```

## Checklist

- [ ] Tests for the changed behavior, affected integrations, and relevant regressions ran (or the documentation-only rule applied)
- [ ] `npm run check:docs` passes; every broken link or anchor is fixed in this pull request
- [ ] Every tracked Markdown file was checked for what this change affected, and stale mentions are updated
- [ ] `DATA_MODEL.md` is updated if the database schema or data behavior changed
- [ ] No secrets, real rider data, or sensitive security details
