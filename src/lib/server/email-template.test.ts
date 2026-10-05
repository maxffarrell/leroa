import { describe, expect, it } from 'vitest';
import { renderEmail } from './email-template.ts';

describe('renderEmail', () => {
	const email = renderEmail({
		orgName: 'Sunrise <Co>',
		heading: 'Rent reminder',
		lines: ['Hi Sam,', 'Rent of $1,500.00 is due on Oct 1.'],
		action: { label: 'View in portal', url: 'https://pm.example.com/portal?a=1&b=2' }
	});

	it('escapes user content in HTML', () => {
		expect(email.html).toContain('Sunrise &lt;Co&gt;');
		expect(email.html).toContain('href="https://pm.example.com/portal?a=1&amp;b=2"');
		expect(email.html).not.toContain('<Co>');
	});

	it('produces a plain-text version with the link', () => {
		expect(email.text).toContain('Rent of $1,500.00 is due on Oct 1.');
		expect(email.text).toContain('View in portal: https://pm.example.com/portal?a=1&b=2');
		expect(email.text.endsWith('— Sunrise <Co>')).toBe(true);
	});
});
