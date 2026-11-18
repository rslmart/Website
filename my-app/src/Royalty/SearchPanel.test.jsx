import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SearchPanel from './SearchPanel';

const people = [
    { id: 'q-anne', label: 'Anne Boleyn', dates: '1507–1536', monarch: false },
    { id: 'q-henry', label: 'Henry VIII', dates: '1491–1547', monarch: true },
    { id: 'q-cleves', label: 'Anne of Cleves', dates: '1515–1557', monarch: false },
];

function renderSearch() {
    const onZoomTo = vi.fn();
    render(
        <SearchPanel
            people={people}
            sharedPeople={[]}
            onZoomTo={onZoomTo}
        />
    );
    return onZoomTo;
}

describe('SearchPanel', () => {
    it('lists matches with dates in a listbox', async () => {
        const onZoomTo = renderSearch();
        const box = screen.getByRole('combobox', { name: 'Search for a person' });
        await userEvent.type(box, 'Anne');
        const list = screen.getByRole('listbox', { name: 'Search results' });
        const options = screen.getAllByRole('option');
        expect(list).toContainElement(options[0]);
        expect(options.map((option) => option.textContent)).toEqual([
            'Anne Boleyn1507–1536',
            'Anne of Cleves1515–1557',
        ]);
        await userEvent.keyboard('{ArrowDown}{Enter}');
        expect(onZoomTo).toHaveBeenCalledWith('q-cleves');
    });

    it('says when nothing matches and clears the query', async () => {
        renderSearch();
        const box = screen.getByRole('combobox', { name: 'Search for a person' });
        await userEvent.type(box, 'zzzz');
        expect(screen.getByRole('status')).toHaveTextContent('No results');
        expect(screen.queryByRole('listbox')).toBeNull();
        await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
        expect(box).toHaveValue('');
        expect(screen.queryByRole('status')).toBeNull();
        expect(box).toHaveFocus();
    });

    it('filters the list to monarchs when the checkbox is on', async () => {
        renderSearch();
        await userEvent.type(screen.getByRole('combobox', { name: 'Search for a person' }), 'e');
        expect(screen.getAllByRole('option')).toHaveLength(3);
        await userEvent.click(screen.getByRole('checkbox', { name: 'Monarchs only' }));
        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(1);
        expect(options[0]).toHaveTextContent('Henry VIII');
        expect(options[0]).toHaveTextContent('1491–1547');
    });
});
