import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { statementTotals } from './statement-totals.ts';

describe('rent statement ledger totals', () => {
	it.each([
		{ charges: [], payments: [], charged: 0, paid: 0, ledgerBalance: 0 },
		{
			charges: [{ amount: 100000, dueDate: '2999-01-01' }],
			payments: [],
			charged: 100000,
			paid: 0,
			ledgerBalance: 100000
		},
		{
			charges: [
				{ amount: 100000, dueDate: '2000-01-01' },
				{ amount: 50000, dueDate: '2999-01-01' }
			],
			payments: [{ amount: 25000 }],
			charged: 150000,
			paid: 25000,
			ledgerBalance: 125000
		},
		{
			charges: [{ amount: 100000 }],
			payments: [{ amount: 100000 }],
			charged: 100000,
			paid: 100000,
			ledgerBalance: 0
		},
		{
			charges: [{ amount: 100000 }],
			payments: [{ amount: 125000 }],
			charged: 100000,
			paid: 125000,
			ledgerBalance: -25000
		}
	])(
		'reconciles every listed charge and payment: %j',
		({ charges, payments, charged, paid, ledgerBalance }) => {
			expect(statementTotals(charges, payments)).toEqual({ charged, paid, ledgerBalance });
		}
	);
	it('keeps the current server balance distinct and never claims the contractual deposit was received', () => {
		const source = readFileSync(
			new URL('../routes/leases/[id]/statement/+page.svelte', import.meta.url),
			'utf8'
		);
		expect(source).toContain('formatMoney(ledgerBalance, l.currency)');
		expect(source).toContain('formatMoney(l.balance, l.currency)');
		expect(source).toContain('Ledger balance includes future charges.');
		expect(source).toContain('Contractual deposit:');
		expect(source.match(/<dt class="text-neutral-500">Current balance<\/dt>/g)).toHaveLength(1);
		expect(source).not.toContain('Deposit held:');
	});
});
