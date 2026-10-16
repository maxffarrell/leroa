import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFName, PDFPage } from 'pdf-lib';
import { agreementPdf, toWinAnsi } from './pdf.ts';

describe('toWinAnsi', () => {
	it('keeps Windows-1252 text and replaces the rest', () => {
		expect(toWinAnsi('“Café” – €5\t✓ 名')).toBe('“Café” – €5    ? ?');
	});
});

describe('agreementPdf', () => {
	it('draws hostile lease content as literal text, not HTML or PDF actions', async () => {
		const draw = vi.spyOn(PDFPage.prototype, 'drawText');
		try {
			const body = '<script>alert(1)</script> & Tenant\n) Tj /JavaScript (alert(1))';
			const bytes = await agreementPdf({
				id: 'test',
				title: 'Lease',
				orgName: 'A & B',
				body,
				watermark: null,
				certificate: false,
				contentHash: null,
				sentAt: null,
				completedAt: null,
				signers: []
			});
			expect(draw.mock.calls.map(([text]) => text)).toContain('<script>alert(1)</script> & Tenant');
			expect(draw.mock.calls.map(([text]) => text)).toContain(') Tj /JavaScript (alert(1))');
			const pdf = await PDFDocument.load(bytes);
			expect(pdf.catalog.has(PDFName.of('OpenAction'))).toBe(false);
			expect(pdf.getPages()[0].node.has(PDFName.of('AA'))).toBe(false);
		} finally {
			draw.mockRestore();
		}
	});

	it('renders a long body with a signature certificate', async () => {
		const bytes = await agreementPdf({
			id: 'a1',
			title: 'Lease',
			orgName: 'Acme',
			body: '# Heading\n' + 'word '.repeat(4000) + '\n' + 'x'.repeat(500) + '\n✓',
			watermark: null,
			certificate: true,
			contentHash: 'ab'.repeat(32),
			sentAt: new Date(),
			completedAt: new Date(),
			signers: [
				{
					name: 'Ana Ruiz',
					email: 'ana@example.com',
					signedName: 'Ana Ruiz',
					signedAt: new Date(),
					ip: '203.0.113.5',
					userAgent: 'Mozilla/5.0'
				}
			]
		});
		const doc = await PDFDocument.load(bytes);
		expect(doc.getPageCount()).toBeGreaterThan(2);
		expect(doc.getTitle()).toBe('Lease');
	});
});
