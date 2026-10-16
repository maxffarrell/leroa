const escapeHtml = (s: string) =>
	s.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
	);

export type EmailContent = {
	orgName: string;
	heading: string;
	lines: string[];
	action?: { label: string; url: string };
	/** Workspace accent color (enterprise branding) for the call-to-action. */
	accent?: string | null;
};

export function renderEmail({ orgName, heading, lines, action, accent }: EmailContent) {
	const color = accent && /^#[a-f0-9]{6}$/i.test(accent) ? accent : '#18181b';
	let actionUrl: string | null = null;
	if (action) {
		try {
			const url = new URL(action.url);
			if (url.protocol === 'https:' || url.protocol === 'http:') actionUrl = url.href;
		} catch {
			// Invalid links remain plain text, never HTML attributes.
		}
	}
	const text = [
		heading,
		'',
		...lines,
		...(action ? ['', `${action.label}: ${action.url}`] : []),
		'',
		`— ${orgName}`
	].join('\n');

	const paragraphs = lines
		.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${escapeHtml(l)}</p>`)
		.join('');
	const button =
		action && actionUrl
			? `<p style="margin:24px 0 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">${escapeHtml(action.label)}</a></p>`
			: '';
	const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px"><tr><td style="padding:32px"><p style="margin:0 0 16px;font-size:13px;color:#71717a">${escapeHtml(orgName)}</p><h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapeHtml(heading)}</h1>${paragraphs}${button}</td></tr></table><p style="margin:16px 0 0;font-size:12px;color:#a1a1aa">Sent by ${escapeHtml(orgName)} with Leroa</p></td></tr></table></body></html>`;

	return { text, html };
}
