import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isEnterpriseEnabled } from '#lib/server/ee/license.ts';
import { isDemo } from '#lib/server/demo-mode.ts';
import { enabledSocialProviders } from '#lib/server/social.ts';

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, '/dashboard');
	if (isDemo() && url.pathname.startsWith('/signup')) redirect(303, '/login');
	return {
		enterprise: isEnterpriseEnabled(),
		demo: isDemo(),
		social: enabledSocialProviders()
	};
};
