import * as v from 'valibot';
import { command, getRequestEvent, query } from '$app/server';
import { requireOrg, requirePerm, assertScope, requireUser } from '#lib/server/context.ts';
import * as svc from '#lib/server/services/agreements.ts';
import {
	agreementCreate,
	agreementSign,
	agreementUpdate,
	idSchema,
	templateInput
} from '#lib/schemas.ts';
import { getPortal } from './portal.remote.ts';

export const getTemplates = query(async () => svc.listTemplates((await requireOrg()).orgId));

export const saveTemplate = command(templateInput, async (input) => {
	const t = await svc.saveTemplate(await requireOrg('admin'), input);
	void getTemplates().refresh();
	return t;
});

export const deleteTemplate = command(idSchema, async (id) => {
	await svc.deleteTemplate(await requireOrg('admin'), id);
	void getTemplates().refresh();
});

export const getAgreements = query(idSchema, async (leaseId) =>
	svc.listAgreements((await requireOrg()).orgId, leaseId)
);

export const createAgreement = command(agreementCreate, async (input) => {
	const a = await svc.createAgreement(
		await assertScope(await requirePerm('leases', 'write'), input),
		input
	);
	void getAgreements(input.leaseId).refresh();
	return a;
});

export const updateAgreement = command(agreementUpdate, async (input) => {
	const a = await svc.updateAgreement(
		await assertScope(await requirePerm('leases', 'write'), input),
		input
	);
	void getAgreements(a.leaseId).refresh();
	return a;
});

export const deleteAgreement = command(idSchema, async (id) => {
	const a = await svc.deleteDraft(await requirePerm('leases', 'write'), id);
	void getAgreements(a.leaseId).refresh();
});

export const sendAgreement = command(idSchema, async (id) => {
	const a = await svc.sendAgreement(await requirePerm('leases', 'write'), id);
	void getAgreements(a.leaseId).refresh();
	return { unreachable: a.unreachable };
});

export const voidAgreement = command(idSchema, async (id) => {
	const a = await svc.voidAgreement(await requireOrg('admin'), id);
	void getAgreements(a.leaseId).refresh();
});

export const signAgreement = command(v.omit(agreementSign, ['consent']), async (input) => {
	const event = getRequestEvent();
	let ip: string | null;
	try {
		ip = event.getClientAddress();
	} catch {
		ip = null;
	}
	const r = await svc.signAgreement(requireUser().user.id, input, {
		ip,
		userAgent: event.request.headers.get('user-agent')
	});
	void getPortal().refresh();
	return r;
});
