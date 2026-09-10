# User Instructions (Standing)

Persistent instructions from the user that apply to all future work on this
repository. Newest first.

## 2026-09-10 — Feature discovery is my job, not the user's

> "Do not ask me to enumerate missing features. You are expected to discover
> them yourself through repository analysis, product analysis, UX analysis,
> and comparison against the capabilities expected from a modern premium
> personal finance application. If something important is absent, implement
> it."

Implications for how I work:
- Never reply "what else do you want?" when capabilities might be missing.
- Every pass starts with a gap analysis: inventory what exists (repo), what a
  modern premium personal-finance app is expected to do (product/UX), then
  implement the important gaps — with i18n (EN+FIL), tests, type-safety, and
  verification — before reporting back.
- "Important" = a capability a user of a premium finance app would expect and
  would notice as absent on first use (data safety, automation, money math,
  trust), not feature bloat.
