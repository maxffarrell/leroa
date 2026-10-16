# Security policy

Leroa is pre-1.0 software. Security fixes target the current main branch and the newest release; older releases are not maintained separately.

## Reporting a vulnerability

Please report through [GitHub private vulnerability reporting](https://github.com/maxffarrell/leroa/security/advisories/new). Do not include exploit details, credentials or customer data in public issues. If private reporting is unavailable, open an issue requesting a private reporting channel without disclosing the vulnerability.

Include the affected revision, installation mode, prerequisites, a minimal reproduction and expected behavior. Use disposable test data. A source review or passing CI is not a guarantee of production safety.

## Operating an installation

Use HTTPS, persistent authentication secrets, restricted database access and tested backups. Keep dependencies and releases current. Enable demo mode only on a separate disposable installation. Basic SSO, passkeys and BYOK AI are available in the self-hosted core; operators must configure their identity and model providers.

Tenant-configured webhooks and integrations accept public HTTP(S) destinations without redirects. For a trusted private integration, an installation operator may set `OUTBOUND_PRIVATE_ORIGINS` to comma-separated exact origins (scheme, host and port). This grants those tenants access to the allowlisted endpoint; keep the list narrow. Local operator-configured BYOK endpoints retain their own configuration.

Forwarded client IPs are accepted only from exact socket peer IPs configured in `TRUSTED_PROXY_IPS`. Configure a trusted reverse proxy to replace client-supplied forwarding headers; leave the variable unset for direct access.

## Public work-order links

Vendor links are bearer credentials: share them only with the assigned recipient. New `v2` links expire after 30 days and are HMAC authenticated; reassignment or cancellation denies access. Cancelled, missing and expired links all return the same 404. Completed orders remain accessible until expiry so vendors can add final costs and photos. Notes marked internal, resident IDs, staff assignments and storage keys are not included in the public DTO.

Legacy work-order links had no expiry and are no longer accepted. After upgrading, staff must copy or send a fresh link for outstanding work. Generating a fresh link does not revoke earlier unexpired links for the same assignment; use cancellation or reassignment to deny access. Reassigning back to the same vendor can re-enable an unexpired link. Rotating `BETTER_AUTH_SECRET` invalidates all links and sessions and must be coordinated by the operator, not used as a routine per-link revoke.

Lease templates and merged values are plain text, not trusted HTML. Keep them as Svelte text nodes and PDF text drawing calls; do not introduce `{@html}` or an HTML-to-PDF renderer without an established allowlist sanitizer at that boundary.
