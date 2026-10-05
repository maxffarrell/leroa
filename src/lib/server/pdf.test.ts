import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { agreementPdf, toWinAnsi } from './pdf.ts';

describe('toWinAnsi', () => {
	it('keeps Windows-1252 text and replaces the rest', () => {
		expect(toWinAnsi('“Café” – €5\t✓ 名')).toBe('“Café” – €5    ? ?');
	});
});

describe('agreementPdf', () => {
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
