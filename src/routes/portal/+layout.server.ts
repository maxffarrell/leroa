import { redirect } from '@sveltejs/kit';
import { syncIfStale } from '#lib/server/profile/client.ts';
import { enabledSocialProviders } from '#lib/server/social.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	void syncIfStale(locals.user.id);
	return {
		user: { name: locals.user.name, email: locals.user.email },
		social: enabledSocialProviders()
	};
};
