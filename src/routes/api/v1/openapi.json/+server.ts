import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resources } from '#lib/server/api/resources.ts';
import { EVENT_TYPES } from '@leroa/integration-sdk';

export const GET: RequestHandler = ({ url }) => {
	const paths: Record<string, unknown> = {};
	for (const [name, r] of Object.entries(resources)) {
		const tags = [name];
		const one = name.replace(/s$/, '');
		paths[`/${name}`] = {
			get: {
				tags,
				summary: `List ${name}`,
				description: r.description,
				responses: { 200: { description: 'OK' } }
			},
			...(r.create
				? {
						post: {
							tags,
							summary: `Create ${one}`,
							requestBody: { content: { 'application/json': {} } },
							responses: {
								201: { description: 'Created' },
								422: { description: 'Validation error' }
							}
						}
					}
				: {})
		};
		if (r.get || r.update) {
			paths[`/${name}/{id}`] = {
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
				...(r.get
					? {
							get: {
								tags,
								summary: `Get ${one}`,
								responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } }
							}
						}
					: {}),
				...(r.update
					? {
							patch: {
								tags,
								summary: `Update ${one}`,
								requestBody: { content: { 'application/json': {} } },
								responses: { 200: { description: 'OK' } }
							}
						}
					: {})
			};
		}
	}
	return json({
		openapi: '3.1.0',
		info: {
			title: 'Leroa API',
			version: '1.0.0',
			description: `Amounts are integer cents. Webhook event types: ${EVENT_TYPES.join(', ')}.`
		},
		servers: [{ url: `${url.origin}/api/v1` }],
		security: [{ bearer: [] }],
		components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
		paths
	});
};
