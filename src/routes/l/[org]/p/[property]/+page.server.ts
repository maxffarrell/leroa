import type { PageServerLoad } from './$types';
import { getOrg } from '#lib/server/context.ts';
import { publicProperty } from '#lib/server/services/crm.ts';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const viewer = await getOrg();
	const data = await publicProperty(params.org, params.property, viewer?.orgId ?? null);
	setHeaders({
		'cache-control': data.preview || viewer ? 'private, no-store' : 'public, max-age=60'
	});
	return data;
};
