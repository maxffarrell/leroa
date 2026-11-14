import { redirect } from '@sveltejs/kit';
import { isDemo } from '#lib/server/demo-mode.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	return {
		demo: isDemo(),
		demoExpiresAt: isDemo() ? (locals.session?.expiresAt.getTime() ?? null) : null,
		demoServerNow: Date.now(),
		user: { name: locals.user.name, email: locals.user.email }
	};
};
