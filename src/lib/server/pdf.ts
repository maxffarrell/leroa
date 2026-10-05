import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type PdfSigner = {
	name: string;
	email: string | null;
	signedName: string | null;
	signedAt: Date | null;
	ip: string | null;
	userAgent: string | null;
};

export type AgreementPdfInput = {
	id: string;
	title: string;
	orgName: string;
	body: string;
	draft: boolean;
	contentHash: string | null;
	sentAt: Date | null;
	completedAt: Date | null;
	signers: PdfSigner[];
};

// Standard PDF fonts only cover Windows-1252; anything else is replaced.
const CP1252_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
export function toWinAnsi(s: string) {
	let out = '';
	for (const ch of s.normalize('NFC')) {
		const c = ch.codePointAt(0)!;
		if (ch === '\t') out += '    ';
		else if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.has(ch))
			out += ch;
		else if (c === 0x2212) out += '-';
		else if (c >= 0x20) out += '?';
	}
	return out;
}

const PAGE = { w: 612, h: 792, margin: 64 };
const SIZE = { body: 10.5, heading: 13, title: 18, small: 8 };
const LEAD = 1.45;
const ink = rgb(0.09, 0.09, 0.11);
const muted = rgb(0.44, 0.44, 0.48);

function wrap(text: string, font: PDFFont, size: number, width: number) {
	const lines: string[] = [];
	let line = '';
	for (const word of text.split(/ +/)) {
		const next = line ? `${line} ${word}` : word;
		if (font.widthOfTextAtSize(next, size) <= width) {
			line = next;
			continue;
		}
		if (line) lines.push(line);
		// Hard-break words longer than a full line.
		let rest = word;
		while (font.widthOfTextAtSize(rest, size) > width) {
			let i = rest.length - 1;
			while (i > 1 && font.widthOfTextAtSize(rest.slice(0, i), size) > width) i--;
			lines.push(rest.slice(0, i));
			rest = rest.slice(i);
		}
		line = rest;
	}
	lines.push(line);
	return lines;
}

const fmt = (d: Date | null) => (d ? d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—');

export async function agreementPdf(input: AgreementPdfInput) {
	const pdf = await PDFDocument.create();
	pdf.setTitle(toWinAnsi(input.title));
	pdf.setAuthor(toWinAnsi(input.orgName));
	pdf.setProducer('Leroa');
	pdf.setCreator('Leroa');
	const regular = await pdf.embedFont(StandardFonts.Helvetica);
	const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
	const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
	const width = PAGE.w - PAGE.margin * 2;

	let page!: PDFPage;
	let y = 0;
	const newPage = () => {
		page = pdf.addPage([PAGE.w, PAGE.h]);
		y = PAGE.h - PAGE.margin;
		if (input.draft)
			page.drawText('DRAFT - NOT FOR SIGNATURE', {
				x: PAGE.margin,
				y: PAGE.h - 36,
				size: SIZE.small,
				font: bold,
				color: rgb(0.75, 0.2, 0.2)
			});
	};
	const ensure = (h: number) => {
		if (y - h < PAGE.margin + 16) newPage();
	};
	const write = (text: string, font: PDFFont, size: number, color = ink, gapAfter = 0) => {
		for (const line of wrap(toWinAnsi(text), font, size, width)) {
			ensure(size * LEAD);
			y -= size * LEAD;
			page.drawText(line, { x: PAGE.margin, y, size, font, color });
		}
		y -= gapAfter;
	};

	newPage();
	write(input.orgName, regular, SIZE.body, muted, 6);
	write(input.title, bold, SIZE.title, ink, 12);

	for (const raw of input.body.replace(/\r\n?/g, '\n').split('\n')) {
		const line = raw.trimEnd();
		if (!line.trim()) {
			y -= SIZE.body * 0.6;
		} else if (line.startsWith('# ')) {
			y -= 6;
			ensure(SIZE.heading * LEAD * 2);
			write(line.slice(2), bold, SIZE.heading, ink, 2);
		} else {
			write(line, regular, SIZE.body);
		}
	}

	// Signature certificate
	if (!input.draft) {
		newPage();
		write('Signature certificate', bold, SIZE.heading, ink, 4);
		write(
			'Each signer reviewed this document in the Leroa resident portal, agreed to sign electronically, and typed their name as their signature.',
			regular,
			SIZE.body,
			muted,
			8
		);
		const rows: [string, string][] = [
			['Document ID', input.id],
			['SHA-256 of document text', input.contentHash ?? '—'],
			['Sent for signature', fmt(input.sentAt)],
			['Completed', fmt(input.completedAt)]
		];
		for (const [k, v] of rows) {
			write(k, bold, SIZE.small, muted);
			write(v, regular, SIZE.body, ink, 4);
		}
		for (const s of input.signers) {
			ensure(120);
			y -= 10;
			page.drawLine({
				start: { x: PAGE.margin, y },
				end: { x: PAGE.w - PAGE.margin, y },
				thickness: 0.5,
				color: muted
			});
			y -= 4;
			write(s.signedName ?? '(not signed)', italic, 16, ink, 2);
			write(`${s.name}${s.email ? ` <${s.email}>` : ''}`, bold, SIZE.body);
			write(`Signed ${fmt(s.signedAt)}`, regular, SIZE.small, muted);
			write(`IP address ${s.ip ?? '—'}`, regular, SIZE.small, muted);
			write(`Device ${(s.userAgent ?? '—').slice(0, 200)}`, regular, SIZE.small, muted);
		}
	}

	const pages = pdf.getPages();
	const foot = toWinAnsi(
		`${input.title} · ${input.contentHash ? `SHA-256 ${input.contentHash.slice(0, 16)}… · ` : ''}`
	);
	pages.forEach((p, i) =>
		p.drawText(`${foot}Page ${i + 1} of ${pages.length}`, {
			x: PAGE.margin,
			y: 32,
			size: SIZE.small,
			font: regular,
			color: muted
		})
	);
	return pdf.save();
}
