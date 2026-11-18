import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatDate } from './formatDate';
import { createLabel } from './RoyalTreeUtils';
import NodeToolTip from './NodeToolTip';

describe('formatDate', () => {
  it('matches the Python year-0 and historical rules', () => {
    const year0 = { time: '+0000-00-00T00:00:00Z', precision: 9 };
    expect(formatDate({ time: '+0000-00-00T00:00:00Z', precision: 6 })).toBe('c. 1st millennium');
    expect(formatDate({ time: '+0000-00-00T00:00:00Z', precision: 7 })).toBe('c. 1st century');
    expect(formatDate({ time: '+0000-00-00T00:00:00Z', precision: 8 })).toBe('0s');
    expect(formatDate(year0)).toBe('1 BCE');
    expect(formatDate({ time: '+0000-00-00T00:00:00Z', precision: 11 })).toBe('1 BCE');
    expect(formatDate({ time: '-0043-03-15T00:00:00Z', precision: 11 })).toBe('15 March 44 BCE');
    expect(formatDate({ time: '+1100-01-01T00:00:00Z', precision: 7 })).toBe('c. 12th century');
    expect(formatDate({ time: '+0990-01-01T00:00:00Z', precision: 8 })).toBe('990s');
    expect(formatDate({ time: '-0100-01-01T00:00:00Z', precision: 7 })).toBe('c. 2nd century BCE');
    expect(formatDate({ time: '2022-09-08T00:00:00Z', precision: 11 })).toBe('8 September 2022');
  });

  it('labels the two Ealdgyths from precision when it is present', () => {
    const century = { time: '1100-01-01T00:00:00Z', precision: 7 };
    const decade = { time: '0990-01-01T00:00:00Z', precision: 8 };
    expect(createLabel({
      label: 'Ealdgyth',
      'date of birth': century,
      'date of death': century,
    })).toBe('Ealdgyth\nc. 12th century-c. 12th century');
    expect(createLabel({ label: 'Ealdgyth', 'date of birth': decade })).toBe('Ealdgyth\n990s-?');
  });

  it('keeps a bare timestamp as a year', () => {
    expect(formatDate('+1100-01-01T00:00:00Z')).toBe('1100');
    expect(formatDate('+1214-04-25T00:00:00Z')).toBe('1214');
    expect(formatDate('+0990-01-01T00:00:00Z')).toBe('990');
    expect(formatDate('+0000-01-01T00:00:00Z')).toBe('1 BCE');
    expect(formatDate('-0043-03-15T00:00:00Z')).toBe('44 BCE');
    const person = {
      label: 'Ealdgyth',
      'date of birth': '+1100-01-01T00:00:00Z',
      'date of death': '+1214-04-25T00:00:00Z',
    };
    expect(createLabel(person)).toBe('Ealdgyth\n1100-1214');
  });

  it('does not pick one side of a date tie', () => {
    const tie = {
      tie: true,
      values: [
        { time: '1125-01-01T00:00:00Z', precision: 9 },
        { time: '1200-01-01T00:00:00Z', precision: 7 },
      ],
    };
    expect(formatDate(tie)).toBe('1125 / c. 13th century');
  });

  it('renders the same string on the label and in the tooltip', () => {
    const birth = { time: '+1100-01-01T00:00:00Z', precision: 7 };
    const death = { time: '-0043-03-15T00:00:00Z', precision: 11 };
    const person = { label: 'Ealdgyth', 'date of birth': birth, 'date of death': death };
    expect(createLabel(person)).toBe(`Ealdgyth\n${formatDate(birth)}-${formatDate(death)}`);
    render(<NodeToolTip data={person} />);
    expect(screen.getByText(formatDate(birth))).toBeTruthy();
    expect(screen.getByText(formatDate(death))).toBeTruthy();
  });
});
