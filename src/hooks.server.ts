import '../scripts/check-node.mjs';
import type { Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '#lib/server/auth.ts';
import { isDemoBlockedPath } from '#lib/server/demo-mode.ts';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const FORM_LIKE = /^(application\/x-www-form-urlencoded|multipart\/form-data|text\/plain)/;

/**
 * SvelteKit's cross-site form check, re-applied in userland so `/id/*` can be
 * exempt (kit.csrf.trustedOrigins: ['*'] in vite.config.ts): the profile hub's
 * OAuth endpoints are called server-to-server by installs, which never send an
 * Origin header — SvelteKit 3 has no per-route exemption.
 */
function csrfForbidden(event: Parameters<Handle>[0]['event']): boolean {
	if (event.url.pathname.startsWith('/id/')) return false;
	const contentType = event.request.headers.get('content-type');
	return (
		(!contentType || FORM_LIKE.test(contentType)) &&
		MUTATING.has(event.request.method) &&
		event.request.headers.get('origin') !== event.url.origin
	);
}

export const handle: Handle = async ({ event, resolve }) => {
	if (csrfForbidden(event)) {
		return new Response(`Cross-site ${event.request.method} form submissions are forbidden`, {
			status: 403
		});
	}

	if (isDemoBlockedPath(event.url.pathname)) {
		return Response.json({ message: 'This is turned off in the public demo.' }, { status: 403 });
	}

	if (!building && !event.url.pathname.startsWith('/api/v1/')) {
		const session = await auth.api.getSession({ headers: event.request.headers });
		if (session) {
			event.locals.session = session.session;
			event.locals.user = session.user;
		}
	}

	return svelteKitHandler({ event, resolve, auth, building });
};
