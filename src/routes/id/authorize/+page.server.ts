import { redirect } from '@sveltejs/kit';
import { parseScopes } from '#lib/profile.ts';
import {
	approve,
	denyUrl,
	findGrant,
	getProfile,
	parseAuthorize
} from '#lib/server/profile/hub.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const req = parseAuthorize(url);
	const [grant, profile] = await Promise.all([
		findGrant(locals.user!.id, req.clientId),
		getProfile(locals.user!.id)
	]);
	return {
		client: new URL(req.clientId).host,
		scopes: req.scopes,
		granted: grant?.scopes ?? null,
		profile: profile.data,
		empty: !profile.updatedAt
	};
};

export const actions: Actions = {
	default: async ({ url, request, locals }) => {
		const req = parseAuthorize(url);
		const form = await request.formData();
		if (form.get('decision') !== 'allow') redirect(303, denyUrl(req), { external: true });
		const chosen = parseScopes(form.getAll('scope').map(String).join(' '));
		redirect(303, await approve(locals.user!.id, req, chosen), { external: true });
	}
};
