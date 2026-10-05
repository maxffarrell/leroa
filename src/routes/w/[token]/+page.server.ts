import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ setHeaders }) => {
	// The token in the URL is the credential: keep it out of caches and Referer headers.
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
};
