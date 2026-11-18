import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HelpPanel from './help-panel';
import NodeToolTip from './NodeToolTip';

describe('RoyalTree help copy', () => {
    it('describes the England default and what the lines mean', () => {
        render(<HelpPanel open onOpen={() => {}} onClose={() => {}} />);
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveTextContent(/opens on England/);
        expect(dialog).toHaveTextContent(/small dot is a marriage/);
        expect(dialog).toHaveTextContent(/sibling line is drawn only when/);
        expect(dialog).toHaveTextContent(/not blood relationships/);
        expect(dialog).toHaveTextContent(/Monarchs only/);
        expect(dialog).toHaveTextContent(/No results/);
        expect(dialog.textContent).not.toMatch(/edges\s+are parent/);
    });
});

describe('NodeToolTip', () => {
    it('orders fields and drops empty or repeated rows', () => {
        const { container } = render(
            <NodeToolTip
                data={{
                    label: 'Anne Boleyn\n1507-1536',
                    'noble title': [],
                    description: '',
                    'date of death': '+1536-05-19T00:00:00Z',
                    family: 'Boleyn family',
                    'date of birth': '+1507-00-00T00:00:00Z',
                    'position held': [
                        { label: 'queen consort', 'start time': '+1533-00-00T00:00:00Z', 'end time': '+1536-00-00T00:00:00Z' },
                        { label: 'queen consort', 'start time': '+1533-00-00T00:00:00Z', 'end time': '+1536-00-00T00:00:00Z' },
                    ],
                }}
            />
        );
        expect(screen.getByText('Anne Boleyn')).toBeTruthy();
        expect(screen.queryByText(/^Label/)).toBeNull();
        expect(screen.queryByText(/Noble title/)).toBeNull();
        expect(screen.queryByText(/Description/)).toBeNull();
        expect(screen.getAllByText('1507')).toHaveLength(1);
        expect(screen.getAllByText(/queen consort/)).toHaveLength(1);
        const text = container.textContent;
        expect(text.indexOf('Date of birth')).toBeLessThan(text.indexOf('Date of death'));
        expect(text.indexOf('Date of death')).toBeLessThan(text.indexOf('Family'));
        expect(text.indexOf('Family')).toBeLessThan(text.indexOf('Position held'));
    });
});
