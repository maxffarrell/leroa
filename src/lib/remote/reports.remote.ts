import { command, query } from '$app/server';
import { requireOrg } from '#lib/server/context.ts';
import { runReport } from '#lib/server/services/reports.ts';
import { runImport } from '#lib/server/services/import.ts';
import { importInput, reportParams } from '#lib/schemas.ts';

export const getReport = query(reportParams, async ({ key, ...params }) =>
	runReport((await requireOrg()).orgId, key, params)
);

export const importCsv = command(importInput, async (input) =>
	runImport(await requireOrg('admin'), input)
);
