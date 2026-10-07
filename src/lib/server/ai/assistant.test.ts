import { describe, expect, it } from 'vitest';
import { draftTicketTitle, findUnit, SCREENING } from './assistant.ts';

const units = [
	{
		id: 'u-a',
		name: 'A',
		propertyName: 'Harbor Lofts',
		propertyId: 'p-h',
		status: 'vacant',
		marketRent: null
	},
	{
		id: 'u-101',
		name: '101',
		propertyName: 'Maple Court',
		propertyId: 'p-m',
		status: 'occupied',
		marketRent: null
	}
] as never;

const pack = { units } as never;

describe('findUnit', () => {
	it('matches multi-char names by word boundary', () => {
		expect(findUnit(pack, 'draft a work order for a leaking sink in 101')).toMatchObject({
			id: 'u-101'
		});
	});
	it('does not match a single-letter name on the article "a"', () => {
		expect(findUnit(pack, 'draft a work order for a leaking sink in 101')?.id).toBe('u-101');
		expect(findUnit(pack, 'make a ticket for a broken door')).toBeNull();
	});
	it('matches short names only with an explicit anchor', () => {
		expect(findUnit(pack, 'work order for unit A')).toMatchObject({ id: 'u-a' });
		expect(findUnit(pack, 'ticket for Harbor Lofts A')).toMatchObject({ id: 'u-a' });
	});
});

describe('draftTicketTitle', () => {
	it('strips command phrasing and keeps the problem', () => {
		expect(draftTicketTitle('draft a work order for a leaking sink in 101', '101')).toBe(
			'leaking sink'
		);
		expect(draftTicketTitle('create ticket for broken AC in unit A', 'A')).toBe('broken AC');
	});
	it('a one-letter unit name cannot eat letters mid-word', () => {
		expect(draftTicketTitle('draft a work order for a leaking sink', 'A')).toBe('leaking sink');
	});
});

describe('SCREENING', () => {
	it.each([
		'Should I approve this applicant?',
		'Should I deny this applicant?',
		'was he denied before?',
		'is she qualified for the unit?',
		'can you screen this lead?',
		'should I rent to this person?',
		'run a credit check on the applicant',
		'eviction history?'
	])('refuses judgement phrasing: %s', (q) => {
		expect(SCREENING.test(q)).toBe(true);
	});
	it.each([
		'how many applications do we have?',
		'any leads touring this week?',
		'vacancy rate?',
		'draft a work order for a leaking sink in 101'
	])('leaves neutral questions alone: %s', (q) => {
		expect(SCREENING.test(q)).toBe(false);
	});
});
