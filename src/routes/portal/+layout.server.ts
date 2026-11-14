import { redirect } from '@sveltejs/kit';
import { isDemo } from '#lib/server/demo-mode.ts';
import { syncIfStale } from '#lib/server/profile/client.ts';
import { enabledSocialProviders } from '#lib/server/social.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	void syncIfStale(locals.user.id);
	return {
		demo: isDemo(),
		demoExpiresAt: isDemo() ? (locals.session?.expiresAt.getTime() ?? null) : null,
		demoServerNow: Date.now(),
		user: { name: locals.user.name, email: locals.user.email },
		social: enabledSocialProviders()
	};
};
