import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import HelpModal from './HelpModal';

function Harness() {
    const [open, setOpen] = useState(false);
    return (
        <HelpModal
            open={open}
            onOpen={() => setOpen(true)}
            onClose={() => setOpen(false)}
            title="Royal Family Trees — Guide"
        >
            <p>Body copy</p>
        </HelpModal>
    );
}

describe('HelpModal', () => {
    it('opens a modal dialog and traps Tab', async () => {
        render(<Harness />);
        await userEvent.click(screen.getByRole('button', { name: 'Open help' }));
        const dialog = screen.getByRole('dialog', { name: 'Royal Family Trees — Guide' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveFocus();
        await userEvent.tab();
        expect(screen.getByRole('button', { name: 'Close help' })).toHaveFocus();
        await userEvent.tab();
        expect(screen.getByRole('button', { name: 'Got it' })).toHaveFocus();
        await userEvent.tab();
        expect(screen.getByRole('button', { name: 'Close help' })).toHaveFocus();
        await userEvent.tab({ shift: true });
        expect(screen.getByRole('button', { name: 'Got it' })).toHaveFocus();
    });

    it('closes on Escape and returns focus to the help button', async () => {
        render(<Harness />);
        await userEvent.click(screen.getByRole('button', { name: 'Open help' }));
        await userEvent.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.getByRole('button', { name: 'Open help' })).toHaveFocus();
    });
});
