# leroa

## 0.4.1

### Patch Changes

- 44cc6d1: Show a reconciling full-ledger balance separately from the current due-date balance on rent statements, and label contractual deposits without implying they have been received.

## 0.4.0

### Minor Changes

- b52c643: Add `AI_PROVIDER` / `AI_DECISION_PROVIDER` (`openai` or `anthropic`) so AI features work against any OpenAI-compatible `/chat/completions` endpoint or the Anthropic Messages API.
- b52c643: Add printable rent statements (per-lease ledger) and monthly owner statements in the flat single-typeface strict-grid print style, linked from the lease and owner detail pages.

## 0.3.0

### Minor Changes

- 3d66852: Add printable rent statements (per-lease ledger) and monthly owner statements in the flat single-typeface strict-grid print style, linked from the lease and owner detail pages.

## 0.2.0

### Minor Changes

- 62dcf1d: Migrate the assistant and message threads to the new shadcn-svelte chat/AI components (message-scroller, input-group composer, trace indicator) and vendor the trace, code-block, and message-scroller primitives.
- ae6dda6: Float the demo banner as an absolute-positioned pill and show it on the resident and owner portals too.

### Patch Changes

- 1de05ba: Require patched Node.js runtimes for CVE-2026-111497 and rebuild containers with Node.js 26.12.1.

## 0.1.4

### Patch Changes

- 11af88c: Fix demo deployment for releases merged by a GitHub App account.

## 0.1.3

### Patch Changes

- e1c3abb: Expire vendor work-order links after 30 days, require fresh links after upgrading from legacy tokens, and harden public projections, email HTML sinks and self-hosted credential configuration.

## 0.1.2

### Patch Changes

- 56e039d: Link every public demo account to a sample portal profile in its own workspace so the admin sidebar portal opens successfully. Match the shared error page layout to Freeweight.

## 0.1.1

### Patch Changes

- bbe4b15: Close resource permission, tenant reference, and public data exposure gaps found in the release audit.

## 0.1.0

### Minor Changes

- 2b10953: Include basic SAML/OIDC SSO, passkeys and BYOK AI in the AGPL self-hosted core without an enterprise license. Preserve paid administrative feature gates and public demo restrictions.

### Patch Changes

- ca9b252: Harden tenant authorization, public responses and webhook delivery; add security regressions and self-hosting readiness guidance. Basic SSO, passkeys and BYOK AI remain in the free core.

## 0.0.3

### Patch Changes

- 48e01c1: Release current main updates to the public demo.

## 0.0.2

### Patch Changes

- ac52074: Add Changesets-driven demo releases with fixed eight-minute sessions and countdown banners.
