import { error } from '@sveltejs/kit';
import { REPORT_KEYS, type ReportKey } from '#lib/reports.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	if (!(REPORT_KEYS as readonly string[]).includes(params.key)) error(404, 'Report not found');
	return { key: params.key as ReportKey };
};
