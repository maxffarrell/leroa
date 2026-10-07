import { command, query } from '$app/server';
import { requireOrg } from '#lib/server/context.ts';
import * as svc from '#lib/server/services/workflows.ts';
import { idSchema, workflowInput, workflowUpdate } from '#lib/schemas.ts';

export const getWorkflows = query(async () => svc.listWorkflows((await requireOrg()).orgId));

export const saveWorkflow = command(workflowInput, async (input) => {
	const row = await svc.createWorkflow(await requireOrg('admin'), input);
	void getWorkflows().refresh();
	return { id: row!.id };
});

export const updateWorkflow = command(workflowUpdate, async (input) => {
	await svc.updateWorkflow(await requireOrg('admin'), input);
	void getWorkflows().refresh();
});

export const deleteWorkflow = command(idSchema, async (id) => {
	await svc.deleteWorkflow((await requireOrg('admin')).orgId, id);
	void getWorkflows().refresh();
});
