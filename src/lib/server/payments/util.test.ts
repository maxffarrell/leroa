import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	fromDecimal,
	hmacValid,
	leaseRef,
	mollieMethod,
	parseLeaseRef,
	squareMethod,
	toDecimal
} from './util.ts';

const lease = '0c63a834-455b-4da0-99b1-1ca0b8ff28d0';

describe('money', () => {
	it('round-trips minor units', () => {
		expect(toDecimal(145000)).toBe('1450.00');
		expect(toDecimal(5)).toBe('0.05');
		expect(fromDecimal('1450.00')).toBe(145000);
		expect(fromDecimal('12.5')).toBe(1250);
		expect(fromDecimal('7')).toBe(700);
	});
	it('rejects malformed amounts', () => {
		for (const v of ['', '-1.00', '1.234', 'abc', null, undefined]) expect(fromDecimal(v)).toBe(0);
	});
});

describe('lease refs', () => {
	it('round-trips', () => {
		expect(parseLeaseRef(leaseRef('org_AbC-12', lease))).toEqual({
			orgId: 'org_AbC-12',
			leaseId: lease
		});
	});
	it('rejects anything else', () => {
		for (const v of [undefined, 42, 'org', `org:${lease}:x`, `a b:${lease}`, 'org:not-a-uuid'])
			expect(parseLeaseRef(v)).toBeNull();
	});
});

describe('hmacValid', () => {
	const body = '{"type":"payment.updated"}';
	it('checks hex signatures (GoCardless)', () => {
		const sig = createHmac('sha256', 'gc_secret').update(body).digest('hex');
		expect(hmacValid(body, sig, ['old', 'gc_secret'], 'hex')).toBe(true);
		expect(hmacValid(body + ' ', sig, ['gc_secret'], 'hex')).toBe(false);
		expect(hmacValid(body, sig, ['wrong'], 'hex')).toBe(false);
		expect(hmacValid(body, null, ['gc_secret'], 'hex')).toBe(false);
		expect(hmacValid(body, 'zz', ['gc_secret'], 'hex')).toBe(false);
	});
	it('checks base64 signatures over url + body (Square)', () => {
		const url = 'https://pm.example.com/api/payments/square/webhook';
		const sig = createHmac('sha256', 'sq_key')
			.update(url + body)
			.digest('base64');
		expect(hmacValid(body, sig, ['sq_key'], 'base64', url)).toBe(true);
		expect(hmacValid(body, sig, ['sq_key'], 'base64', 'https://evil.example.com/x')).toBe(false);
	});
});

describe('method mapping', () => {
	it('maps provider methods', () => {
		expect(mollieMethod('ideal')).toBe('transfer');
		expect(mollieMethod('creditcard')).toBe('card');
		expect(mollieMethod('directdebit')).toBe('direct_debit');
		expect(mollieMethod('klarna')).toBe('other');
		expect(squareMethod('CARD')).toBe('card');
		expect(squareMethod('BANK_ACCOUNT')).toBe('ach');
		expect(squareMethod('CASH_APP')).toBe('other');
	});
});
