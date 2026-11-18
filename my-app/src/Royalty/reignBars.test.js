import { describe, expect, it } from 'vitest';
import { reignSegments } from './reignBars';

function office({ label, start, end, from, to }) {
  return {
    label,
    from,
    to,
    'start time': start,
    'end time': end,
  };
}

describe('reignSegments open crown', () => {
  const monarchs = ['Q9682', 'Q43274'];

  it('keeps a last monarch’s open crown when the neighbour score is 0', () => {
    const segments = reignSegments({
      'position held': [
        office({
          label: 'Prince of Wales',
          start: '+1958-07-26T00:00:00Z',
          end: '+2022-09-08T00:00:00Z',
        }),
        office({
          label: 'monarch of the United Kingdom',
          start: '+2022-09-08T00:00:00Z',
        }),
      ],
    }, 1, monarchs, 'England');

    expect(segments).toEqual([{ start: 2022, end: null, openEnded: true }]);
  });

  it('keeps a scored bar and leaves a score of 0 out', () => {
    const segments = reignSegments({
      'position held': [
        office({
          label: 'king',
          start: '+2010-01-01T00:00:00Z',
          end: '+2020-01-01T00:00:00Z',
          from: ['Q9682'],
        }),
        office({
          label: 'monarch of the United Kingdom',
          start: '+2022-09-08T00:00:00Z',
        }),
      ],
    }, 1, monarchs, 'England');

    expect(segments).toEqual([{ start: 2010, end: 2020, openEnded: false }]);
  });

  it('does not keep a closed crown or an open office that is not a crown', () => {
    const closedCrown = reignSegments({
      'position held': [
        office({
          label: 'king',
          start: '+2010-01-01T00:00:00Z',
          end: '+2020-01-01T00:00:00Z',
        }),
      ],
    }, 1, monarchs, 'England');
    const openGovernor = reignSegments({
      'position held': [
        office({
          label: 'governor',
          start: '+2022-09-08T00:00:00Z',
        }),
      ],
    }, 1, monarchs, 'England');
    const latestOpenCrown = reignSegments({
      'position held': [
        office({
          label: 'king',
          start: '+2010-01-01T00:00:00Z',
          end: '+2020-01-01T00:00:00Z',
        }),
        office({
          label: 'king',
          start: '+1990-01-01T00:00:00Z',
        }),
        office({
          label: 'monarch',
          start: '+2022-09-08T00:00:00Z',
        }),
        office({
          label: 'governor',
          start: '+2024-01-01T00:00:00Z',
        }),
      ],
    }, 1, monarchs, 'England');

    expect(closedCrown).toEqual([]);
    expect(openGovernor).toEqual([]);
    expect(latestOpenCrown).toEqual([{ start: 2022, end: null, openEnded: true }]);
  });
});
