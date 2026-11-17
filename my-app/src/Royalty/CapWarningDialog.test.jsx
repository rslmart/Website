import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CapWarningDialog from './CapWarningDialog';

function Harness({ onCancel = () => {}, onContinue = () => {} }) {
  const [open, setOpen] = useState(false);
  return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Look back</button>
        {open && (
            <CapWarningDialog
                count={2709}
                cap={2000}
                onCancel={() => { onCancel(); setOpen(false); }}
                onContinue={() => { onContinue(); setOpen(false); }}
            />
        )}
      </>
  );
}

describe('CapWarningDialog', () => {
  it('is a labelled modal dialog that focuses Cancel', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Look back' }));
    const dialog = screen.getByRole('dialog', { name: 'Show 2,709 people?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(/larger than 2,000 people/);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('cancels on Escape and returns focus to the trigger', async () => {
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);
    const trigger = screen.getByRole('button', { name: 'Look back' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('keeps Tab inside the dialog', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Look back' }));
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const showAll = screen.getByRole('button', { name: 'Show all' });
    await userEvent.tab();
    expect(showAll).toHaveFocus();
    await userEvent.tab();
    expect(cancel).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(showAll).toHaveFocus();
  });

  it('continues on Show all and returns focus', async () => {
    const onContinue = vi.fn();
    render(<Harness onContinue={onContinue} />);
    const trigger = screen.getByRole('button', { name: 'Look back' });
    await userEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });
});
