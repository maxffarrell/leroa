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
	/** Red banner on every page, e.g. for drafts. */
	watermark: string | null;
	/** Append the signature certificate page. */
	certificate: boolean;
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
		if (input.watermark)
			page.drawText(toWinAnsi(input.watermark), {
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
	if (input.certificate) {
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

export type InspectionPdfInput = {
	title: string;
	orgName: string;
	address: string;
	tenants: string[];
	inspectedAt: Date | null;
	inspector: string | null;
	summary: string | null;
	watermark: string | null;
	areas: {
		area: string;
		items: {
			label: string;
			condition: string;
			before: string | null;
			notes: string | null;
			photos: { type: string; data: Uint8Array }[];
		}[];
	}[];
	acknowledgement: { at: Date; name: string; comment: string | null } | null;
};

const PHOTO = { w: 112, h: 84, gap: 8 };

/** Inspection report with ratings, notes and embedded JPEG/PNG photos. */
export async function inspectionPdf(input: InspectionPdfInput) {
	const pdf = await PDFDocument.create();
	pdf.setTitle(toWinAnsi(input.title));
	pdf.setAuthor(toWinAnsi(input.orgName));
	pdf.setProducer('Leroa');
	pdf.setCreator('Leroa');
	const regular = await pdf.embedFont(StandardFonts.Helvetica);
	const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
	const width = PAGE.w - PAGE.margin * 2;

	let page!: PDFPage;
	let y = 0;
	const newPage = () => {
		page = pdf.addPage([PAGE.w, PAGE.h]);
		y = PAGE.h - PAGE.margin;
		if (input.watermark)
			page.drawText(toWinAnsi(input.watermark), {
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
	const write = (
		text: string,
		font: PDFFont,
		size: number,
		color = ink,
		gapAfter = 0,
		w = width,
		x = PAGE.margin
	) => {
		for (const line of wrap(toWinAnsi(text), font, size, w)) {
			ensure(size * LEAD);
			y -= size * LEAD;
			page.drawText(line, { x, y, size, font, color });
		}
		y -= gapAfter;
	};
	const bad = new Set(['Poor', 'Damaged']);

	newPage();
	write(input.orgName, regular, SIZE.body, muted, 6);
	write(input.title, bold, SIZE.title, ink, 8);
	write(input.address, regular, SIZE.body, ink, 2);
	if (input.tenants.length) write(`Residents: ${input.tenants.join(', ')}`, regular, SIZE.body);
	write(
		`Inspected ${fmt(input.inspectedAt)}${input.inspector ? ` by ${input.inspector}` : ''}`,
		regular,
		SIZE.body,
		muted,
		8
	);
	if (input.summary) {
		write('Summary', bold, SIZE.heading, ink, 2);
		for (const para of input.summary.replace(/\r\n?/g, '\n').split('\n')) {
			if (para.trim()) write(para, regular, SIZE.body);
			else y -= SIZE.body * 0.6;
		}
		y -= 6;
	}

	const rateW = 150;
	for (const group of input.areas) {
		y -= 8;
		ensure(SIZE.heading * LEAD * 3);
		write(group.area, bold, SIZE.heading, ink, 2);
		for (const item of group.items) {
			ensure(SIZE.body * LEAD * 2);
			y -= 4;
			page.drawLine({
				start: { x: PAGE.margin, y },
				end: { x: PAGE.w - PAGE.margin, y },
				thickness: 0.25,
				color: rgb(0.85, 0.85, 0.87)
			});
			const top = y;
			write(item.label, regular, SIZE.body, ink, 0, width - rateW - 8);
			const afterLabel = y;
			y = top;
			const rating = item.before ? `${item.condition}  (move-in: ${item.before})` : item.condition;
			write(
				rating,
				bold,
				SIZE.body,
				bad.has(item.condition) ? rgb(0.75, 0.2, 0.2) : ink,
				0,
				rateW,
				PAGE.w - PAGE.margin - rateW
			);
			y = Math.min(y, afterLabel);
			if (item.notes) write(item.notes, regular, SIZE.small + 1, muted, 0, width - rateW - 8);
			const photos = [];
			for (const p of item.photos) {
				try {
					photos.push(
						p.type === 'image/png' ? await pdf.embedPng(p.data) : await pdf.embedJpg(p.data)
					);
				} catch {
					// Skip photos pdf-lib cannot decode.
				}
			}
			const perRow = Math.floor((width + PHOTO.gap) / (PHOTO.w + PHOTO.gap));
			for (let i = 0; i < photos.length; i += perRow) {
				ensure(PHOTO.h + PHOTO.gap);
				y -= PHOTO.h + 4;
				photos.slice(i, i + perRow).forEach((img, j) => {
					const s = Math.min(PHOTO.w / img.width, PHOTO.h / img.height);
					page.drawImage(img, {
						x: PAGE.margin + j * (PHOTO.w + PHOTO.gap),
						y,
						width: img.width * s,
						height: img.height * s
					});
				});
			}
			const skipped = item.photos.length - photos.length;
			if (skipped > 0)
				write(
					`${skipped} more photo${skipped === 1 ? '' : 's'} in Leroa`,
					regular,
					SIZE.small,
					muted
				);
			y -= 2;
		}
	}

	if (input.acknowledgement) {
		y -= 12;
		ensure(80);
		write('Resident review', bold, SIZE.heading, ink, 2);
		write(
			`Reviewed by ${input.acknowledgement.name} in the Leroa resident portal on ${fmt(input.acknowledgement.at)}.`,
			regular,
			SIZE.body
		);
		if (input.acknowledgement.comment)
			write(`Resident comments: ${input.acknowledgement.comment}`, regular, SIZE.body);
	}

	const pages = pdf.getPages();
	const foot = toWinAnsi(input.title);
	pages.forEach((p, i) =>
		p.drawText(`${foot} · Page ${i + 1} of ${pages.length}`, {
			x: PAGE.margin,
			y: 32,
			size: SIZE.small,
			font: regular,
			color: muted
		})
	);
	return pdf.save();
}
