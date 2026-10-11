import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'Postgres connection string.' },
	BETTER_AUTH_SECRET: {
		description: 'Secret used to sign sessions. Use 32+ random characters in production.'
	},
	ORIGIN: {
		description:
			'Public origin, e.g. `https://pm.example.com`. Optional; derived from the request when unset.',
		schema: (value) => value || undefined
	},
	LEROA_ENTERPRISE_KEY: {
		description:
			'Enterprise license key. Unlocks SAML/OIDC SSO and passkeys on self-hosted installs.',
		schema: (value) => value || undefined
	},
	LEROA_DEMO: {
		description:
			'Set to `true` for a public demo: visitors get a throwaway sample workspace (deleted after 24h), and sign-up, API access, webhooks, integrations, invites and uploads are disabled.',
		schema: (value) => value === 'true'
	},
	GOOGLE_CLIENT_ID: {
		description:
			'Google OAuth client ID. Shows "Continue with Google" on sign-in. Redirect URI: `<origin>/api/auth/callback/google`.',
		schema: (value) => value || undefined
	},
	GOOGLE_CLIENT_SECRET: {
		description: 'Google OAuth client secret.',
		schema: (value) => value || undefined
	},
	FACEBOOK_CLIENT_ID: {
		description:
			'Facebook app ID. Shows "Continue with Facebook" on sign-in. Redirect URI: `<origin>/api/auth/callback/facebook`.',
		schema: (value) => value || undefined
	},
	FACEBOOK_CLIENT_SECRET: {
		description: 'Facebook app secret.',
		schema: (value) => value || undefined
	},
	X_CLIENT_ID: {
		description:
			'X (Twitter) OAuth 2.0 client ID. Shows "Continue with X" on sign-in. Redirect URI: `<origin>/api/auth/callback/twitter`. X bills API reads per use.',
		schema: (value) => value || undefined
	},
	X_CLIENT_SECRET: {
		description: 'X (Twitter) OAuth 2.0 client secret.',
		schema: (value) => value || undefined
	},
	LEROA_PROFILE_URL: {
		description:
			'Origin of a Leroa Profile service, e.g. `https://id.example.com`. Lets residents fill applications and keep their details up to date from their portable Leroa profile.',
		schema: (value) => value?.replace(/\/+$/, '') || undefined
	},
	LEROA_PROFILE_HUB: {
		description:
			'Set to `true` to run this install as a Leroa Profile service that other installs (including self-hosted ones) connect to.',
		schema: (value) => value === 'true'
	},
	EMAIL_FROM: {
		description: 'Sender for notification emails, e.g. `Leroa <no-reply@pm.example.com>`.',
		schema: (value) => value || undefined
	},
	RESEND_API_KEY: {
		description: 'Send email through Resend. Takes precedence over `SMTP_URL`.',
		schema: (value) => value || undefined
	},
	SMTP_URL: {
		description: 'Send email through SMTP, e.g. `smtps://user:pass@smtp.example.com:465`.',
		schema: (value) => value || undefined
	},
	STRIPE_SECRET_KEY: {
		description:
			'Stripe secret key. Lets tenants pay rent online with Stripe Checkout; money goes straight to Stripe, never through Leroa.',
		schema: (value) => value || undefined
	},
	STRIPE_WEBHOOK_SECRET: {
		description:
			'Signing secret(s) for `/api/payments/stripe/webhook`. Comma-separate several (e.g. account and Connect endpoints).',
		schema: (value) => value || undefined
	},
	BILT_CLIENT_ID: {
		description:
			'Bilt Checkout partner client ID, issued by Bilt at onboarding. Lets tenants pay rent with Bilt.',
		schema: (value) => value || undefined
	},
	BILT_CLIENT_SECRET: {
		description: 'Bilt Checkout partner client secret.',
		schema: (value) => value || undefined
	},
	BILT_WEBHOOK_SECRET: {
		description:
			'Signing secret(s) (`whsec_…`) for `/api/payments/bilt/webhook`. Comma-separate several during rotation.',
		schema: (value) => value || undefined
	},
	BILT_ENVIRONMENT: {
		description: '`production` (default) or `staging`.',
		schema: (value) => (value === 'staging' ? 'staging' : 'production')
	},
	PAYPAL_CLIENT_ID: {
		description: 'PayPal REST app client ID. Lets tenants pay rent with PayPal.',
		schema: (value) => value || undefined
	},
	PAYPAL_CLIENT_SECRET: {
		description: 'PayPal REST app secret.',
		schema: (value) => value || undefined
	},
	PAYPAL_WEBHOOK_ID: {
		description:
			'ID of the PayPal webhook pointing at `/api/payments/paypal/webhook`, used to verify deliveries.',
		schema: (value) => value || undefined
	},
	PAYPAL_ENVIRONMENT: {
		description: '`live` (default) or `sandbox`.',
		schema: (value) => (value === 'sandbox' ? 'sandbox' : 'live')
	},
	SQUARE_ACCESS_TOKEN: {
		description: 'Square access token. Lets tenants pay rent by card through Square checkout.',
		schema: (value) => value || undefined
	},
	SQUARE_WEBHOOK_SIGNATURE_KEY: {
		description:
			'Signature key of the Square webhook subscription for `/api/payments/square/webhook`.',
		schema: (value) => value || undefined
	},
	SQUARE_LOCATION_ID: {
		description: 'Square location that takes rent payments. Defaults to the first active location.',
		schema: (value) => value || undefined
	},
	SQUARE_ENVIRONMENT: {
		description: '`production` (default) or `sandbox`.',
		schema: (value) => (value === 'sandbox' ? 'sandbox' : 'production')
	},
	GOCARDLESS_ACCESS_TOKEN: {
		description:
			'GoCardless access token. Lets tenants pay rent by bank (Instant Bank Pay or direct debit).',
		schema: (value) => value || undefined
	},
	GOCARDLESS_WEBHOOK_SECRET: {
		description:
			'Secret of the GoCardless webhook endpoint for `/api/payments/gocardless/webhook`.',
		schema: (value) => value || undefined
	},
	GOCARDLESS_ENVIRONMENT: {
		description: '`live` (default) or `sandbox`.',
		schema: (value) => (value === 'sandbox' ? 'sandbox' : 'live')
	},
	MOLLIE_API_KEY: {
		description:
			'Mollie API key (`live_…` or `test_…`). Lets tenants pay rent with iDEAL, cards, SEPA and more.',
		schema: (value) => value || undefined
	},
	QBO_CLIENT_ID: {
		description:
			'Client ID of your Intuit developer app. Lets workspaces connect QuickBooks Online and sync tenants, charges and payments to it.',
		schema: (value) => value || undefined
	},
	QBO_CLIENT_SECRET: {
		description: 'Client secret of your Intuit developer app.',
		schema: (value) => value || undefined
	},
	QBO_ENVIRONMENT: {
		description:
			'`production` (default) or `sandbox`. Must match the keys: development keys only work with sandbox companies.',
		schema: (value) => (value === 'sandbox' ? 'sandbox' : 'production')
	},
	QBO_BASE_URL: {
		description:
			'Development only: send QuickBooks sign-in and API requests to this mock server instead of Intuit.',
		schema: (value) => value || undefined
	},
	XERO_CLIENT_ID: {
		description:
			'Client ID of your Xero app. Lets workspaces connect Xero and sync tenants, charges and payments to it.',
		schema: (value) => value || undefined
	},
	XERO_CLIENT_SECRET: {
		description: 'Client secret of your Xero app.',
		schema: (value) => value || undefined
	},
	XERO_SCOPES: {
		description:
			'Space-separated OAuth scopes to request from Xero instead of the defaults, for apps that must use different scopes.',
		schema: (value) => value?.trim() || undefined
	},
	XERO_BASE_URL: {
		description:
			'Development only: send Xero sign-in and API requests to this mock server instead of Xero.',
		schema: (value) => value || undefined
	},
	CRON_SECRET: {
		description:
			'Bearer token for `/api/cron`, which posts rent, late fees and reminders for every workspace. Vercel Cron sends it automatically.',
		schema: (value) => value || undefined
	},
	LEROA_CLOUD: {
		description:
			'Set to `true` on Leroa Cloud. Enables enterprise features and cloud-only behaviour.',
		schema: (value) => value === 'true'
	},
	AI_API_KEY: {
		description:
			'API key for an OpenAI-compatible chat-completions endpoint powering generative AI features (enterprise tier), and the fallback key for structured AI decision calls when AI_DECISION_API_KEY is unset. Unset, the features use deterministic local fallbacks.',
		schema: (value) => value || undefined
	},
	AI_BASE_URL: {
		description: 'OpenAI-compatible API base URL. Defaults to `https://api.openai.com/v1`.',
		schema: (value) => value?.replace(/\/+$/, '') || 'https://api.openai.com/v1'
	},
	AI_MODEL: {
		description: 'Model name used for AI features. Defaults to `gpt-4o-mini`.',
		schema: (value) => value || 'gpt-4o-mini'
	},
	AI_DECISION_API_KEY: {
		description:
			'Optional separate API key for structured AI decision calls (maintenance intake, lead scoring, message triage, delinquency watch). Falls back to `AI_API_KEY`.',
		schema: (value) => value || undefined
	},
	AI_DECISION_BASE_URL: {
		description:
			'Optional OpenAI-compatible base URL for AI decision calls. Falls back to `AI_BASE_URL`.',
		schema: (value) => value?.replace(/\/+$/, '') || undefined
	},
	AI_DECISION_MODEL: {
		description:
			'Optional model name for AI decision calls, e.g. a cheaper/faster model than the feature model. Falls back to `AI_MODEL`.',
		schema: (value) => value || undefined
	}
});
