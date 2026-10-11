# Self-hosted SSO and BYOK AI

Basic SAML/OIDC SSO, passkeys and BYOK AI are part of the AGPLv3 core. They do
not require `LEROA_ENTERPRISE_KEY` or a Cloud subscription.

## Sign-in

Serve the app over HTTPS, set `ORIGIN` to its public URL, and open Settings → Security.
Passkeys are per user. Workspace administrators can connect their own identity
provider; SSO preserves the existing organization membership and authorization checks.
Configure the provider's callback URL to match the app's public origin and provider ID.
The public demo blocks SSO and passkey configuration.

## AI provider

Set these private environment variables on the server and restart the app.
No provider key or model usage is included; you pay your provider directly.
AI requests send the relevant input to the configured endpoint.

```dotenv
AI_API_KEY=your-provider-key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=your-model
```

For a keyless local OpenAI-compatible endpoint, set `AI_BASE_URL` to its
`/v1` URL and select a model; leave `AI_API_KEY` unset. Optional
`AI_DECISION_API_KEY`, `AI_DECISION_BASE_URL` and `AI_DECISION_MODEL` overrides
route structured calls separately. Unset overrides inherit the feature settings.
Without a configured provider, the existing deterministic local fallbacks remain available.
