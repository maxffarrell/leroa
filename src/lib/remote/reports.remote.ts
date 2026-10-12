import { command, query } from '$app/server';
import { requireOrg, requirePerm } from '#lib/server/context.ts';
import { runReport } from '#lib/server/services/reports.ts';
import { runImport } from '#lib/server/services/import.ts';
import { importInput, reportParams } from '#lib/schemas.ts';

export const getReport = query(reportParams, async ({ key, ...params }) =>
	(async () => {
		const ctx = await requirePerm('reports');
		return runReport(ctx.orgId, key, params, ctx);
	})()
);

export const importCsv = command(importInput, async (input) =>
	runImport(await requireOrg('admin'), input)
);
