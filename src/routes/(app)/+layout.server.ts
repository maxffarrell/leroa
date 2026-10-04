import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getOrg } from '#lib/server/context.ts';
import { portalTenants } from '#lib/server/services/portal.ts';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	const ctx = await getOrg();
	if (!ctx) redirect(303, (await portalTenants(locals.user.id)).length ? '/portal' : '/onboarding');
	return {
		user: {
			id: locals.user.id,
			name: locals.user.name,
			email: locals.user.email,
			image: locals.user.image ?? null
		},
		org: ctx.org,
		role: ctx.role
	};
};
