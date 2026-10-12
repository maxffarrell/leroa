import { staffOrgForRecord } from '#lib/server/access.ts';
import type { PageServerLoad } from './$types';
import { getOrg } from '#lib/server/context.ts';
import { publicListing } from '#lib/server/services/listings.ts';
import { getLeasingSettings } from '#lib/server/services/crm.ts';
import { profileHubUrl, takePrefill } from '#lib/server/profile/client.ts';
import { applicationPrefill } from '#lib/profile.ts';

export const load: PageServerLoad = async ({ params, setHeaders, cookies }) => {
	const viewer = await getOrg();
	const data = await publicListing(
		params.org,
		params.listing,
		await staffOrgForRecord(viewer, 'listings', 'listings', params.listing)
	);
	const { selfBooking } = await getLeasingSettings(data.org.id);
	const shared = takePrefill(cookies);
	setHeaders({
		'cache-control': data.preview || viewer || shared ? 'private, no-store' : 'public, max-age=60'
	});
	return {
		...data,
		selfBooking,
		profileHub: !!profileHubUrl(),
		prefill: shared ? applicationPrefill(shared) : null
	};
};
