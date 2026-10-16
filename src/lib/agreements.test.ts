import { describe, expect, it } from 'vitest';
import { ordinal, renderTemplate } from './agreements.ts';

describe('renderTemplate', () => {
	it('fills known fields and keeps unknown ones', () => {
		const r = renderTemplate('Hi {{ tenant_names }}, rent {{rent_amount}} {{pets}}', {
			tenant_names: 'Ana',
			rent_amount: '$1,000.00'
		});
		expect(r.text).toBe('Hi Ana, rent $1,000.00 {{pets}}');
		expect(r.unknown).toEqual(['pets']);
	});

	it('does not re-expand placeholders inside values', () => {
		expect(renderTemplate('{{tenant_names}}', { tenant_names: '{{today}}', today: 'x' }).text).toBe(
			'{{today}}'
		);
	});

	it('preserves literal lease text for Svelte text nodes and PDF text drawing', () => {
		const text = '<img src=x onerror=alert(1)> & "Tenant"';
		expect(renderTemplate('# {{tenant_names}}\nA & B', { tenant_names: text }).text).toBe(
			`# ${text}\nA & B`
		);
	});
});

describe('ordinal', () => {
	it.each([
		[1, '1st'],
		[2, '2nd'],
		[3, '3rd'],
		[4, '4th'],
		[11, '11th'],
		[12, '12th'],
		[13, '13th'],
		[21, '21st'],
		[28, '28th']
	])('%i → %s', (n, s) => expect(ordinal(n)).toBe(s));
});
