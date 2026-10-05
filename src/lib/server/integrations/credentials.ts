import {
	QBO_BASE_URL,
	QBO_CLIENT_ID,
	QBO_CLIENT_SECRET,
	QBO_ENVIRONMENT,
	XERO_BASE_URL,
	XERO_CLIENT_ID,
	XERO_CLIENT_SECRET,
	XERO_SCOPES
} from '$app/env/private';

/** The server's own app registration with a provider, plus endpoint overrides for development. */
export type OAuthApp = {
	clientId: string;
	clientSecret: string;
	/** Merged into the connection's params on every use. */
	params: Record<string, string>;
	/** Replaces the integration's default scopes. */
	scopes?: string[];
	authorizeUrl?: string;
	tokenUrl?: string;
	revokeUrl?: string;
};

const qboMock = QBO_BASE_URL?.replace(/\/$/, '');
const xeroMock = XERO_BASE_URL?.replace(/\/$/, '');

const apps: Record<string, { env: string[]; app: () => OAuthApp | null }> = {
	quickbooks: {
		env: ['QBO_CLIENT_ID', 'QBO_CLIENT_SECRET'],
		app: () =>
			QBO_CLIENT_ID && QBO_CLIENT_SECRET
				? {
						clientId: QBO_CLIENT_ID,
						clientSecret: QBO_CLIENT_SECRET,
						params: { environment: QBO_ENVIRONMENT, ...(qboMock ? { apiBase: qboMock } : {}) },
						...(qboMock
							? {
									authorizeUrl: `${qboMock}/connect/oauth2`,
									tokenUrl: `${qboMock}/oauth2/v1/tokens/bearer`,
									revokeUrl: `${qboMock}/v2/oauth2/tokens/revoke`
								}
							: {})
					}
				: null
	},
	xero: {
		env: ['XERO_CLIENT_ID', 'XERO_CLIENT_SECRET'],
		app: () =>
			XERO_CLIENT_ID && XERO_CLIENT_SECRET
				? {
						clientId: XERO_CLIENT_ID,
						clientSecret: XERO_CLIENT_SECRET,
						params: xeroMock ? { apiBase: xeroMock } : ({} as Record<string, string>),
						...(XERO_SCOPES ? { scopes: XERO_SCOPES.split(/\s+/) } : {}),
						...(xeroMock
							? {
									authorizeUrl: `${xeroMock}/identity/connect/authorize`,
									tokenUrl: `${xeroMock}/connect/token`,
									revokeUrl: `${xeroMock}/connect/revocation`
								}
							: {})
					}
				: null
	}
};

export const oauthApp = (integrationId: string) => apps[integrationId]?.app() ?? null;

/** Environment variables that set up an integration's app. */
export const oauthEnv = (integrationId: string) => apps[integrationId]?.env ?? [];
