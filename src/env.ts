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
	CRON_SECRET: {
		description:
			'Bearer token for `/api/cron`, which posts rent, late fees and reminders for every workspace. Vercel Cron sends it automatically.',
		schema: (value) => value || undefined
	},
	LEROA_CLOUD: {
		description:
			'Set to `true` on Leroa Cloud. Enables enterprise features and cloud-only behaviour.',
		schema: (value) => value === 'true'
	}
});
