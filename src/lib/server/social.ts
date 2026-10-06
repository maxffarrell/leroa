import {
	FACEBOOK_CLIENT_ID,
	FACEBOOK_CLIENT_SECRET,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET,
	LEROA_DEMO,
	X_CLIENT_ID,
	X_CLIENT_SECRET
} from '$app/env/private';

export type SocialProvider = 'google' | 'facebook' | 'twitter';

/** Each provider is on only when its keys are set; self-hosters register their own apps. */
export function socialProviders() {
	return {
		...(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
			? {
					google: {
						clientId: GOOGLE_CLIENT_ID,
						clientSecret: GOOGLE_CLIENT_SECRET,
						prompt: 'select_account' as const
					}
				}
			: {}),
		...(FACEBOOK_CLIENT_ID && FACEBOOK_CLIENT_SECRET
			? { facebook: { clientId: FACEBOOK_CLIENT_ID, clientSecret: FACEBOOK_CLIENT_SECRET } }
			: {}),
		...(X_CLIENT_ID && X_CLIENT_SECRET
			? { twitter: { clientId: X_CLIENT_ID, clientSecret: X_CLIENT_SECRET } }
			: {})
	};
}

export function enabledSocialProviders(): SocialProvider[] {
	if (LEROA_DEMO) return [];
	return Object.keys(socialProviders()) as SocialProvider[];
}
