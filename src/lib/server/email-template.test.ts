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

	it('uses the workspace accent on the button, defaulting to dark', () => {
		expect(email.html).toContain('background:#18181b');
		const branded = renderEmail({
			orgName: 'Sunrise',
			heading: 'Hi',
			lines: [],
			action: { label: 'Open', url: 'https://x.example.com' },
			accent: '#0ea5e9'
		});
		expect(branded.html).toContain('background:#0ea5e9');
	});

	it('does not interpolate CSS or attribute markup from workspace accents', () => {
		const result = renderEmail({
			orgName: '<script>not markup</script>',
			heading: '<img src=x onerror=alert(1)>',
			lines: ['<svg onload=alert(1)>'],
			accent: '#fff;"><img src=x onerror=alert(1)>',
			action: { label: 'Open', url: 'https://example.com/' }
		});
		expect(result.html).toContain('background:#18181b;');
		expect(result.html).not.toMatch(/<(script|img|svg)\b/);
		expect(result.text).toContain('<svg onload=alert(1)>');
	});

	it.each([
		'javascript:alert(1)',
		'data:text/html,<script>alert(1)</script>',
		'//evil.example',
		'bad URL'
	])('omits unsafe or malformed HTML action URL %s', (url) => {
		const result = renderEmail({
			orgName: 'Org',
			heading: 'Hello',
			lines: [],
			action: { label: 'Open', url }
		});
		expect(result.html).not.toContain('<a ');
		expect(result.text).toContain(`Open: ${url}`);
	});
});
