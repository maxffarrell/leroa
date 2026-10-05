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
			'Signing secret(s) for `/api/stripe/webhook`. Comma-separate several (e.g. account and Connect endpoints).',
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
