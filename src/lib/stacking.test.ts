import { describe, expect, it } from 'vitest';
import { buildStacking, parseStack, unitTone } from './stacking.ts';

describe('parseStack', () => {
	it('splits digits into floor + stack', () => {
		expect(parseStack('204')).toEqual({ floor: '2', stack: '04' });
		expect(parseStack('1201')).toEqual({ floor: '12', stack: '01' });
		expect(parseStack('B-205')).toEqual({ floor: '2', stack: 'B05' });
	});
	it('treats short digits as the floor itself', () => {
		expect(parseStack('2B')).toEqual({ floor: '2', stack: 'B' });
		expect(parseStack('5')).toEqual({ floor: '5', stack: '5' });
	});
	it('puts letter-only names in the unstacked row', () => {
		expect(parseStack('A')).toEqual({ floor: '—', stack: 'A' });
	});
});

describe('unitTone', () => {
	const today = '2026-10-07';
	it('flags leases expiring inside 90 days', () => {
		expect(unitTone({ name: 'x', status: 'occupied', leaseEnd: '2026-12-01' }, today)).toBe(
			'expiring'
		);
		expect(unitTone({ name: 'x', status: 'occupied', leaseEnd: '2027-12-01' }, today)).toBe(
			'occupied'
		);
	});
	it('passes through other statuses', () => {
		expect(unitTone({ name: 'x', status: 'vacant' }, today)).toBe('vacant');
		expect(unitTone({ name: 'x', status: 'offline' }, today)).toBe('offline');
		expect(unitTone({ name: 'x', status: 'notice' }, today)).toBe('notice');
	});
});

describe('buildStacking', () => {
	it('orders floors high-to-low and stacks left-to-right', () => {
		const { columns, rows } = buildStacking(
			[
				{ name: '101', status: 'occupied' },
				{ name: '102', status: 'vacant' },
				{ name: '201', status: 'occupied' },
				{ name: '103', status: 'vacant' }
			],
			'2026-10-07'
		);
		expect(columns).toEqual(['01', '02', '03']);
		expect(rows.map((r) => r.floor)).toEqual(['2', '1']);
		expect(rows[0].cells.map((c) => c?.unit.name ?? null)).toEqual(['201', null, null]);
		expect(rows[1].cells.map((c) => c?.unit.name ?? null)).toEqual(['101', '102', '103']);
	});
});
