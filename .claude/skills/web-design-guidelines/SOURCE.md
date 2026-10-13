# Source of this skill

- **Upstream:** https://github.com/vercel-labs/agent-skills (skills/web-design-guidelines) + https://github.com/vercel-labs/web-interface-guidelines (command.md)
- **Commit:** `063bee9 + 434b7f9` (cloned 2026-10-13)
- **License:** MIT (LICENSE)
- **Reviewed by:** Claude Code session for the EPI owner, 2026-10-13 — read before installation (ADR-027).
- **Local changes:** SKILL.md changed to read the vendored `guidelines.md` instead of fetching it from GitHub at run time (air-gapped project; avoids remote content steering reviews).

To update: re-clone upstream into a scratch directory, review the diff, copy, and update this file.
