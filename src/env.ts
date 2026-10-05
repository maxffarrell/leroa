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
	LEROA_CLOUD: {
		description:
			'Set to `true` on Leroa Cloud. Enables enterprise features and cloud-only behaviour.',
		schema: (value) => value === 'true'
	}
});
