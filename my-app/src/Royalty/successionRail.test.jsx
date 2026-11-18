import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { extractYear } from './RoyalTreeUtils';
import { parseYear } from './royalTreeLayout';
import SearchPanel from './SearchPanel';
import SuccessionRail from './SuccessionRail';
import {
  buildReignLanes,
  dynastyColor,
  formatReignYear,
  laneCoverage,
  railCollapsedForWidth,
  sharedDomain,
  successiveBreaks,
  yearToX,
} from './reignBars';

const ROYALTY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/royalty');
const JAMES = 'Q79972';

function loadMonarchy(name) {
  const raw = readFileSync(path.join(ROYALTY, `${name}.json.gz`));
  return JSON.parse(gunzipSync(raw).toString('utf8'));
}

describe('extractYear', () => {
  it('reads +YYYY timestamps, BCE years and missing values', () => {
    expect(extractYear('+1603-03-24T00:00:00Z')).toBe(1603);
    expect(extractYear('+2022-09-08T00:00:00Z')).toBe(2022);
    expect(extractYear('-0043-03-15T00:00:00Z')).toBe(-43);
    expect(extractYear('-0069-01-01T00:00:00Z')).toBe(-69);
    expect(extractYear({ time: '+1066-10-14T00:00:00Z' })).toBe(1066);
    expect(extractYear(null)).toBeNull();
    expect(extractYear(undefined)).toBeNull();
    expect(extractYear('')).toBeNull();
    expect(extractYear({})).toBeNull();
    expect(extractYear({ tie: true, values: [] })).toBeNull();
    expect(extractYear('+1650-01-01T00:00:00Z')).toBe(parseYear('+1650-01-01T00:00:00Z'));
    expect(extractYear('-0069-01-01T00:00:00Z')).toBe(parseYear('-0069-01-01T00:00:00Z'));
  });
});

describe('reign lanes', () => {
  const england = loadMonarchy('England');
  const scotland = loadMonarchy('Scotland');
  const lanes = buildReignLanes([england, scotland], ['England', 'Scotland']);
  const [englandLane, scotlandLane] = lanes;
  const domain = sharedDomain(lanes, 2026);

  it('lists England’s 63 monarchs in order, with open ends flagged', () => {
    expect(englandLane.monarchs.map((monarch) => monarch.id)).toEqual(england.monarchList);
    expect(englandLane.monarchs).toHaveLength(63);
    const coverage = laneCoverage(englandLane);
    expect(coverage.withStartAndEnd).toBeGreaterThanOrEqual(57);
    expect(coverage.withStartAndEnd / coverage.total).toBeGreaterThanOrEqual(0.9);
    expect(coverage.missing.map((monarch) => monarch.label)).toEqual([
      'Edgar Ætheling',
      'Henry the Young King',
      'Louis VIII of France',
      'Charles III',
    ]);
    const openPayload = {
      monarchList: ['Q1', 'Q2'],
      nodes: {
        Q1: {
          label: 'First',
          'position held': [{
            label: 'king',
            to: ['Q2'],
            'start time': '+1000-01-01T00:00:00Z',
            'end time': '+1010-01-01T00:00:00Z',
          }],
        },
        Q2: {
          label: 'Open',
          'position held': [{
            label: 'king',
            from: ['Q1'],
            'start time': '+1010-01-01T00:00:00Z',
          }],
        },
      },
    };
    const [lane] = buildReignLanes([openPayload], ['Fixture']);
    const open = lane.bars.find((bar) => bar.id === 'Q2');
    expect(open.openEnded).toBe(true);
    expect(open.end).toBeNull();
    expect(lane.bars.find((bar) => bar.id === 'Q2').missing).toBe(false);
  });

  it('spaces the undated Frankish kings between Clovis I and Theuderic III', () => {
    const france = loadMonarchy('France');
    const [lane] = buildReignLanes([france], ['France']);
    const clovis = lane.bars.find((bar) => bar.label === 'Clovis I');
    const theuderic = lane.bars.find((bar) => bar.label === 'Theuderic III');
    const between = lane.bars.filter((bar) => bar.order > clovis.order && bar.order < theuderic.order && bar.missing);
    expect(between.length).toBeGreaterThan(8);
    const years = between.map((bar) => bar.markerYear);
    expect(new Set(years).size).toBe(years.length);
    expect(Math.min(...years)).toBeGreaterThan(clovis.end);
    expect(Math.max(...years)).toBeLessThan(theuderic.start);
    const clovisBar = lane.bars.find((bar) => bar.label === 'Clovis I');
    const pepin = lane.bars.find((bar) => bar.label === 'Pepin the Short');
    expect(clovisBar.family).toBe('Merovingian dynasty');
    expect(dynastyColor(clovisBar.family, '#000')).not.toBe(dynastyColor(pepin.family, '#000'));
  });

  it('draws a dated office the neighbour score drops when the title is on the allow-list', () => {
    const laneFor = (name) => buildReignLanes([loadMonarchy(name)], [name])[0];
    const segment = (lane, label, start) => lane.monarchs.find((monarch) => monarch.label === label)
      .segments.find((part) => part.start === start);

    expect(segment(laneFor('Bavaria'), 'Eberhard, Duke of Bavaria', 937)).toMatchObject({ end: 938 });
    expect(segment(laneFor('Austria'), 'Ottokar II of Bohemia', 1253)).toMatchObject({ end: 1278 });
    expect(segment(laneFor('Poland'), 'Bolesław II the Generous', 1076)).toMatchObject({ end: 1079 });
    expect(segment(laneFor('Germany'), 'Otto II', 973)).toMatchObject({ end: 983 });
    expect(segment(laneFor('Holy_Roman_Empire'), 'Charles the Bald', 875)).toMatchObject({ end: 877 });

    // Rudolf's 1306 bar is his King of Bohemia office. King of Poland is the same years and is not an Austria title.
    expect(segment(laneFor('Austria'), 'Rudolf I of Bohemia', 1306)).toMatchObject({ end: 1307 });
    const [excluded] = buildReignLanes([{
      monarchList: ['Q1'],
      nodes: {
        Q1: {
          label: 'Only the excluded titles',
          'position held': [
            { label: 'King of Poland', 'start time': '+1306-01-01T00:00:00Z', 'end time': '+1307-01-01T00:00:00Z' },
            { label: 'Holy Roman Emperor', 'start time': '+1452-01-01T00:00:00Z', 'end time': '+1493-01-01T00:00:00Z' },
          ],
        },
      },
    }], ['Austria']);
    expect(excluded.monarchs[0].segments).toEqual([]);
  });

  it('puts James VI and I on the shared 1603 x in both lanes', () => {
    const english = englandLane.monarchs.find((monarch) => monarch.id === JAMES);
    const scottish = scotlandLane.monarchs.find((monarch) => monarch.id === JAMES);
    expect(english.segments).toEqual([{ start: 1603, end: 1625, openEnded: false }]);
    expect(scottish.segments.some((part) => part.start <= 1603 && part.end >= 1603)).toBe(true);
    const width = 800;
    const englandX = yearToX(1603, domain, width);
    const scotlandX = yearToX(1603, domain, width);
    expect(Math.abs(englandX - scotlandX)).toBeLessThanOrEqual(1);
    expect(englandX).toBe(yearToX(english.segments[0].start, domain, width));
  });

  it('follows the width default unless the visitor has chosen', () => {
    expect(railCollapsedForWidth(767, null)).toBe(true);
    expect(railCollapsedForWidth(768, null)).toBe(false);
    expect(railCollapsedForWidth(390, false)).toBe(false);
    expect(railCollapsedForWidth(1440, true)).toBe(true);
    expect(formatReignYear(-43)).toBe('44 BCE');
    expect(successiveBreaks(englandLane.monarchs).map((gap) => gap.before)).toEqual([
      'Æthelstan',
      'Edmund II of England',
      'Harold Harefoot',
      'Henry II of England',
      'Charles II of England',
      'William III of England',
    ]);
  });
});

function SyncHarness() {
  const monarchs = [
    { id: 'Q1', label: 'Alfred' },
    { id: 'Q2', label: 'Edward' },
  ];
  const [highlightId, setHighlightId] = useState(null);
  const lanes = [{
    monarchy: 'England',
    index: 0,
    color: '#2563eb',
    rowCount: 1,
    bars: [
      { id: 'Q1', label: 'Alfred', order: 0, start: 871, end: 899, openEnded: false, missing: false, row: 0 },
      { id: 'Q2', label: 'Edward', order: 1, start: 899, end: 924, openEnded: false, missing: false, row: 0 },
    ],
  }];
  return (
    <>
      <SuccessionRail
        lanes={lanes}
        domain={{ start: 871, end: 924 }}
        collapsed={false}
        highlightId={highlightId}
        onToggle={() => {}}
        onSelect={setHighlightId}
      />
      <SearchPanel
        people={[]}
        sharedPeople={[]}
        monarchOrder={[{ monarchy: 'England', monarchs }]}
        activeId={highlightId}
        onZoomTo={setHighlightId}
      />
    </>
  );
}

describe('rail sync', () => {
  it('moves the stepper from a bar and the highlight from the stepper', async () => {
    const user = userEvent.setup();
    render(<SyncHarness />);
    expect(screen.getByText('Alfred')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Edward, 899–924' }));
    expect(screen.getByRole('button', { name: 'Edward, 899–924' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('Edward')).toBeTruthy();
    expect(screen.getByText('2 of 2')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next monarch' }));
    expect(screen.getByRole('button', { name: 'Alfred, 871–899' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('1 of 2')).toBeTruthy();
  });

  it('collapses and expands from the button and the keyboard', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [collapsed, setCollapsed] = useState(false);
      return (
        <SuccessionRail
          lanes={[{
            monarchy: 'England',
            color: '#2563eb',
            rowCount: 1,
            bars: [{ id: 'Q1', label: 'Alfred', order: 0, start: 871, end: 899, openEnded: false, missing: false, row: 0 }],
          }]}
          domain={{ start: 871, end: 899 }}
          collapsed={collapsed}
          onToggle={() => setCollapsed((value) => !value)}
          onSelect={() => {}}
        />
      );
    }
    render(<Harness />);
    const hide = screen.getByRole('button', { name: 'Hide reigns' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    hide.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Show reigns' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Alfred, 871–899' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show reigns' }));
    expect(screen.getByRole('button', { name: 'Alfred, 871–899' })).toBeTruthy();
  });
});
