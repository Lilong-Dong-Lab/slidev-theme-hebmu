# Coding standards

Enforced by the Standards axis of `/code-review`. These are judgement rules
tooling cannot check; everything else follows CLAUDE.md, AGENTS.md, and the
smell baseline in the code-review skill. Each rule was earned by a real
defect — the linked issue tells the story.

- **Sync note rule** (#9, #13, #19): values that must change together — a
  CSS variable and its fallback rule, a glob pattern and its lookup key —
  carry a must-change-together comment at the pair. An unmarked pair is a
  finding.
- **Single-owner rule** (#14): behavior needed by several layouts —
  pagination gating, asset resolution — lives in one component or helper.
  A second copy of gating or fallback logic across layouts is a finding
  even when the values currently match.
- **Stale-reference sweep** (#13): a rename or move triggers a grep for the
  old term across CLAUDE.md, AGENTS.md, docs/, README, and package.json
  before review. AGENTS.md is CLAUDE.md's twin: editing one means checking
  the other.
- **Spec-of-record rule** (#10, #14): a shipped change that contradicts
  `docs/specs.md` either updates the spec in the same PR or records the
  follow-up sentence in the PR body. Silent drift is the finding.
