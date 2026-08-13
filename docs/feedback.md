# ProofGate — Feedback Loop

This document is the canonical place to capture feedback on ProofGate and how
it is fed back into the product. It supports the Level 5 "feedback loop"
requirement: real feedback is logged, triaged, and tied to the work that
addresses it.

## How feedback flows

1. **Collect** — feedback arrives from demo sessions, the product X account,
   the bootcamp, or this repo (issues/PRs). Anyone can add a row below.
2. **Triage** — each item gets a priority and an owner, and is classified as
   *Product*, *Privacy/Security*, *UX*, or *Engineering*.
3. **Act** — the item is linked to the commit/PR that resolves it and moved to
   `Resolved`.
4. **Review** — every demo starts by revisiting the open items so nothing is
   silently dropped.

## Log

| Date | Source | Category | Feedback | Priority | Status | Resolution |
|---|---|---|---|---|---|---|
| 2026-08-09 | Bootcamp demo | UX | "The hero story is great but there is no signal that anything is live on the network — add real activity." | High | Resolved | Level 5 analytics: live Proof-network metrics panel in Phase 2 (`02 / Proof network activity`) + `GET /api/metrics`. Commits `9829d22`, `43dbab9`. |
| 2026-08-09 | Bootcamp demo | Privacy/Security | "Don't store the wallet list anywhere public — metrics must never reveal who did what." | High | Resolved | Public surface exposes aggregates only; wallet export moved to bearer-protected `GET /api/admin/users`; `MONGODB_URI` is server-side only. |
| 2026-08-13 | Internal review | Privacy/Security | "Make exactly-once counting explicit so retries can't inflate the numbers." | Medium | Resolved | Unique `{idempotencyKey, operationType}` index + `outcome: duplicate`; test asserts no double count. |
| 2026-08-13 | Internal review | Product | "Track the Preprod onboarding goal on the landing page, not just generic counters." | Medium | Resolved | "Preprod users **n / 50**" tracker driven by `PREPROD_TARGET_NETWORK`/`PREPROD_TARGET_COUNT`. |
| — | — | — | *(open)* | — | Open | *(leave empty — this is where the next demo's feedback lands)* |

## Ideas waiting for triage

- Allow the admin export to stream as CSV for offline review.
- Surface a 7-day activity sparkline in the metrics panel.
- Opt-in / opt-out control for analytics event reporting in Settings.

## Definition of done for feedback

An item counts as resolved only when it is addressed by a concrete, committed
change and a test (where practical) guards the behaviour from regressing.
