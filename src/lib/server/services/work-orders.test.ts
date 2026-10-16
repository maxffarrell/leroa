import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { ticketNote } from '#lib/server/db/schema.ts';

const state = vi.hoisted(() => ({
	select: vi.fn(),
	selectWhere: vi.fn(),
	rows: [] as unknown[][],
	transaction: vi.fn(),
	returning: vi.fn(),
	where: vi.fn(),
	images: vi.fn(),
	save: vi.fn(),
	store: vi.fn(),
	emit: vi.fn()
}));
vi.mock('$app/env/private', () => ({
	BETTER_AUTH_SECRET: 'test_not_real_work_order_hmac_secret'
}));
vi.mock('#lib/server/db/index.ts', () => ({
	db: { select: state.select, transaction: state.transaction }
}));
vi.mock('./documents.ts', () => ({
	IMAGE_TYPE: /^image\/(png|jpeg|gif|webp|avif)$/,
	entityImages: state.images,
	saveDocument: state.save
}));
vi.mock('./storage.ts', () => ({ store: { get: state.store } }));
vi.mock('./events.ts', () => ({ emit: state.emit }));
vi.mock('./notifications.ts', () => ({
	notifyTicketStatus: vi.fn(async () => {}),
	notifyVendorUpdate: vi.fn(async () => {})
}));

import {
	getWorkOrder,
	updateWorkOrder,
	uploadWorkOrderPhotos,
	validateWorkOrderLink,
	workOrderPhoto,
	workOrderToken
} from './work-orders.ts';

const ticketId = '11111111-1111-4111-8111-111111111111';
const vendorId = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-10-16T00:00:00Z');
const row = {
	ticket: {
		id: ticketId,
		organizationId: 'private-org',
		vendorId,
		tenantId: 'private-tenant',
		assigneeId: 'private-assignee',
		internalField: 'never serialize',
		number: 42,
		title: 'Repair',
		description: 'Fix the sink',
		status: 'open',
		priority: 'normal',
		dueDate: null,
		costAmount: null,
		createdAt: now
	},
	vendorName: 'Test vendor',
	orgName: 'Org',
	portalTitle: null,
	orgAccent: null,
	property: { name: 'Property', addressLine1: 'Recipient service address' },
	unitName: 'A'
};
const invalid = { status: 404, body: { message: 'This work order link is not valid' } };

beforeEach(() => {
	vi.resetAllMocks();
	vi.useFakeTimers();
	vi.setSystemTime(now);
	state.rows = [[row], []];
	state.select.mockImplementation(() => {
		const rows = state.rows.shift() ?? [];
		const query = {
			from: () => query,
			innerJoin: () => query,
			leftJoin: () => query,
			where: (condition: unknown) => {
				state.selectWhere(condition);
				return query;
			},
			orderBy: () => query,
			then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve)
		};
		return query;
	});
	state.images.mockResolvedValue([]);
	state.returning.mockResolvedValue([row.ticket]);
	state.where.mockReturnValue({ returning: state.returning });
	state.transaction.mockImplementation(async (fn) =>
		fn({ update: () => ({ set: () => ({ where: state.where }) }) })
	);
	state.emit.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('public work-order link authorization', () => {
	it('authorizes a current, correctly signed link', async () => {
		await expect(
			validateWorkOrderLink(workOrderToken(ticketId, vendorId))
		).resolves.toBeUndefined();
		expect(state.select).toHaveBeenCalledOnce();
		const query = new PgDialect().sqlToQuery(state.selectWhere.mock.calls[0][0]);
		expect(query.params).toEqual([ticketId, vendorId]);
	});

	it.each(['', '1', 'a.b', 'v2.a.b', 'x'.repeat(501)])(
		'rejects malformed tokens before touching the database (%s)',
		async (token) => {
			await expect(getWorkOrder(token)).rejects.toMatchObject(invalid);
			expect(state.select).not.toHaveBeenCalled();
		}
	);

	it('rejects tampering, trailing segments, noncanonical encoding and legacy links', async () => {
		const token = workOrderToken(ticketId, vendorId);
		const [, encoded, sig] = token.split('.');
		for (const bad of [
			`${token}.extra`,
			`v2.${encoded}=.${sig}`,
			`v2.${encoded}.${sig!.slice(0, -1)}${sig!.endsWith('A') ? 'B' : 'A'}`,
			`${encoded}.${sig}`
		])
			await expect(getWorkOrder(bad)).rejects.toMatchObject(invalid);
		expect(state.select).not.toHaveBeenCalled();
	});

	it('rejects authenticated malformed IDs and oversized expiry claims before querying', async () => {
		const signed = (payload: string) =>
			`v2.${Buffer.from(payload).toString('base64url')}.${createHmac('sha256', 'test_not_real_work_order_hmac_secret').update(`work-order:v2:${payload}`).digest('base64url')}`;
		for (const payload of [
			`1.${vendorId}.1792108801`,
			`${ticketId}.${vendorId}.9999999999`,
			`${ticketId}.${vendorId}.1792108801.extra`
		])
			await expect(getWorkOrder(signed(payload))).rejects.toMatchObject(invalid);
		expect(state.select).not.toHaveBeenCalled();
	});

	it('expires at exactly 30 days, including for mutations and photo reads', async () => {
		const token = workOrderToken(ticketId, vendorId);
		vi.setSystemTime(now.getTime() + 30 * 24 * 60 * 60 * 1000);
		await expect(getWorkOrder(token)).rejects.toMatchObject(invalid);
		await expect(updateWorkOrder({ token, status: 'done' })).rejects.toMatchObject(invalid);
		await expect(uploadWorkOrderPhotos(token, [])).rejects.toMatchObject(invalid);
		await expect(workOrderPhoto(token, 'photo')).rejects.toMatchObject(invalid);
		expect(state.select).not.toHaveBeenCalled();
		expect(state.transaction).not.toHaveBeenCalled();
		expect(state.store).not.toHaveBeenCalled();
		expect(state.save).not.toHaveBeenCalled();
	});

	it('returns the same 404 for missing, reassigned and cancelled work orders', async () => {
		const token = workOrderToken(ticketId, vendorId);
		for (const rows of [[], [], [{ ...row, ticket: { ...row.ticket, status: 'cancelled' } }]]) {
			state.rows = [rows];
			await expect(getWorkOrder(token)).rejects.toMatchObject(invalid);
		}
	});

	it('does not serialize raw ticket rows, internal IDs, photo storage keys or note internals', async () => {
		state.rows = [
			[row],
			[
				{
					id: 'note',
					authorType: 'vendor',
					authorName: 'Test vendor',
					vendorId,
					body: 'Recipient note',
					createdAt: now,
					internalField: 'never serialize'
				}
			]
		];
		state.images.mockResolvedValue([{ id: 'photo', name: 'tap.png', storageKey: 'private' }]);
		const result = await getWorkOrder(workOrderToken(ticketId, vendorId));
		expect(Object.keys(result).sort()).toEqual(
			[
				'number',
				'title',
				'description',
				'status',
				'priority',
				'dueDate',
				'costAmount',
				'createdAt',
				'orgName',
				'orgAccent',
				'vendorName',
				'property',
				'unitName',
				'photos',
				'notes'
			].sort()
		);
		expect(result.photos).toEqual([{ id: 'photo', name: 'tap.png' }]);
		expect(result.notes).toEqual([
			{
				id: 'note',
				authorType: 'vendor',
				authorName: 'Test vendor',
				body: 'Recipient note',
				createdAt: now,
				mine: true
			}
		]);
		expect(JSON.stringify(result)).not.toMatch(/private|never serialize/);
		const noteQuery = new PgDialect().sqlToQuery(state.selectWhere.mock.calls[1][0]);
		expect(noteQuery.params).toEqual([ticketId, row.ticket.organizationId, false]);
		const noteProjection = state.select.mock.calls[1][0];
		expect(noteProjection).toEqual({
			id: ticketNote.id,
			authorType: ticketNote.authorType,
			authorName: ticketNote.authorName,
			vendorId: ticketNote.vendorId,
			body: ticketNote.body,
			createdAt: ticketNote.createdAt
		});
	});

	it('rechecks missing assignments for updates and uploads, and scopes photo downloads', async () => {
		const token = workOrderToken(ticketId, vendorId);
		state.rows = [[]];
		await expect(updateWorkOrder({ token, status: 'done' })).rejects.toMatchObject(invalid);
		state.rows = [[]];
		await expect(uploadWorkOrderPhotos(token, [])).rejects.toMatchObject(invalid);
		expect(state.transaction).not.toHaveBeenCalled();
		expect(state.save).not.toHaveBeenCalled();
		state.rows = [[row], []];
		await expect(workOrderPhoto(token, 'other-ticket-photo')).rejects.toMatchObject({
			status: 404
		});
		const query = new PgDialect().sqlToQuery(state.selectWhere.mock.calls.at(-1)![0]);
		expect(query.params).toEqual([
			'other-ticket-photo',
			row.ticket.organizationId,
			'maintenance',
			ticketId
		]);
		expect(state.store).not.toHaveBeenCalled();
	});

	it('revalidates the token on mutation and prevents concurrent reassignment/status changes', async () => {
		state.returning.mockResolvedValue([]);
		await expect(
			updateWorkOrder({ token: workOrderToken(ticketId, vendorId), status: 'done' })
		).rejects.toMatchObject(invalid);
		const query = new PgDialect().sqlToQuery(state.where.mock.calls[0][0]);
		expect(query.sql).toContain('"maintenance_ticket"."vendor_id" =');
		expect(query.sql).toContain('"maintenance_ticket"."status" =');
		expect(query.params).toEqual([ticketId, row.ticket.organizationId, vendorId, 'open']);
		expect(state.emit).not.toHaveBeenCalled();
	});

	it('preserves a normal authorized status update', async () => {
		await expect(
			updateWorkOrder({ token: workOrderToken(ticketId, vendorId), status: 'done' })
		).resolves.toBeUndefined();
		expect(state.emit).toHaveBeenCalledOnce();
	});
});
