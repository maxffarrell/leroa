/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
/**
 * Leroa PWA service worker.
 * - Precaches the built client assets + static files at install.
 * - Navigations: network-first, falling back to cache then /offline.html.
 * - Precached assets: cache-first.
 * - Everything else (remote functions, API calls, mutations) goes straight to
 *   the network — never cache non-GET or dynamic app data.
 */
import { assets, immutable, prerendered } from '$app/manifest';
import { version } from '$app/env';
import { asset } from '$app/paths';

declare const self: ServiceWorkerGlobalScope;

const CACHE = `leroa-${version}`;
const OFFLINE = asset('/offline.html');

// immutable/prerendered paths are already URL paths; static files resolve via asset().
const ASSETS = new Set([
	...immutable.map((f) => f.path),
	...prerendered.map((f) => f.path),
	...assets.map((f) => asset(f.path)),
	OFFLINE
]);

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll([...ASSETS]))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);

	// Precached build/static asset: cache-first.
	if (ASSETS.has(url.pathname)) {
		event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
		return;
	}

	// Page navigations: network-first, cache successful responses, then fall
	// back to cache/offline page when the network is gone.
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request)
				.then((res) => {
					if (res.ok && url.origin === self.location.origin) {
						const copy = res.clone();
						caches.open(CACHE).then((cache) => cache.put(request, copy));
					}
					return res;
				})
				.catch(async () => {
					const cached = await caches.match(request);
					return (
						cached ?? (await caches.match(OFFLINE)) ?? new Response('Offline', { status: 503 })
					);
				})
		);
		return;
	}

	// Same-origin GETs (images etc.): stale-while-revalidate.
	if (url.origin === self.location.origin) {
		event.respondWith(
			caches.match(request).then((hit) => {
				const refresh = fetch(request)
					.then((res) => {
						if (res.ok) {
							const copy = res.clone();
							caches.open(CACHE).then((cache) => cache.put(request, copy));
						}
						return res;
					})
					.catch(() => hit ?? Promise.reject(new Error('offline')));
				return hit ?? refresh;
			})
		);
	}
});
