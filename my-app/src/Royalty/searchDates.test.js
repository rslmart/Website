import { describe, expect, it, vi } from 'vitest';
import { mergeMonarchies, searchDates, zoomAnimationMs } from './RoyalTreeUtils';

function person(id, label, birth) {
    return {
        id,
        label,
        'date of birth': birth,
        'date of death': '+1500-01-01T00:00:00Z',
    };
}

describe('search dates and reduced motion', () => {
    it('formats a life span and leaves unknown dates blank', () => {
        expect(searchDates(person('Q1', 'Henry', '+1491-01-01T00:00:00Z'))).toBe('1491–1500');
        expect(searchDates({ label: 'Unknown' })).toBe('');
    });

    it('marks monarchs on the search list', () => {
        const merged = mergeMonarchies([{
            monarchList: ['Q1'],
            nodes: {
                Q1: person('Q1', 'Henry', '+1491-01-01T00:00:00Z'),
                Q2: person('Q2', 'Anne', '+1507-01-01T00:00:00Z'),
            },
        }], ['England']);
        expect(merged.peopleList.find((row) => row.id === 'Q1')).toMatchObject({
            monarch: true,
            dates: '1491–1500',
        });
        expect(merged.peopleList.find((row) => row.id === 'Q2').monarch).toBe(false);
    });

    it('uses no zoom animation when reduced motion is requested', () => {
        vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
            matches: String(query).includes('reduce'),
            media: query,
            addEventListener() {},
            removeEventListener() {},
        }));
        expect(zoomAnimationMs(500)).toBe(0);
    });

    it('keeps the zoom animation when the user has not asked for reduced motion', () => {
        vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
            matches: false,
            media: query,
            addEventListener() {},
            removeEventListener() {},
        }));
        expect(zoomAnimationMs(500)).toBe(500);
    });
});
