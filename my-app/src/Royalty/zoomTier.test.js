import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MIN_ZOOM,
  DETAIL_LABEL_MIN,
  EDGE_LABEL_MIN,
  MONARCH_LABEL_FONT,
  MIN_ONSCREEN_LABEL_PX,
  NON_MONARCH_FONT,
  ZOOM_DETAIL,
  ZOOM_MID,
  defaultZoomLevel,
  monarchShortLabel,
  reignYears,
  yearOf,
  zoomTier,
} from './zoomTier';

describe('zoom tiers', () => {
  it('defines one default zoom that keeps monarch labels at 10px', () => {
    expect(DEFAULT_MIN_ZOOM).toBe(MIN_ONSCREEN_LABEL_PX / MONARCH_LABEL_FONT);
    expect(MONARCH_LABEL_FONT * DEFAULT_MIN_ZOOM).toBeGreaterThanOrEqual(10);
    expect(defaultZoomLevel(0.02)).toBe(DEFAULT_MIN_ZOOM);
    expect(defaultZoomLevel(2)).toBe(2);
    expect(defaultZoomLevel(Number.NaN)).toBe(DEFAULT_MIN_ZOOM);
  });

  it('splits overview, mid and detail, with the default in overview', () => {
    expect(zoomTier(DEFAULT_MIN_ZOOM)).toBe('overview');
    expect(zoomTier(ZOOM_MID - 0.01)).toBe('overview');
    expect(zoomTier(ZOOM_MID)).toBe('mid');
    expect(zoomTier(ZOOM_DETAIL - 0.01)).toBe('mid');
    expect(zoomTier(ZOOM_DETAIL)).toBe('detail');
    expect(DETAIL_LABEL_MIN).toBe(NON_MONARCH_FONT * ZOOM_DETAIL);
    expect(EDGE_LABEL_MIN).toBeGreaterThan(EDGE_LABEL_MIN * 0);
  });

  it('builds a short monarch label from reign years', () => {
    expect(monarchShortLabel({
      label: 'Alfred the Great',
      'position held': [
        { 'start time': '+0871-04-23T00:00:00Z', 'end time': '+0899-10-26T00:00:00Z', label: 'monarch of England' },
        { 'start time': '+0871-04-23T00:00:00Z', 'end time': '+0872-01-01T00:00:00Z', label: 'a shorter office' },
      ],
    })).toBe('♔ Alfred the Great\n871–899');

    expect(reignYears({
      'position held': [{
        'start time': { time: '+1066-12-25T00:00:00Z', precision: 11 },
        'end time': { time: '+1087-09-09T00:00:00Z', precision: 11 },
      }],
    })).toBe('1066–1087');

    expect(reignYears({
      'position held': [{ 'start time': '-0043-03-15T00:00:00Z', 'end time': '-0031-01-01T00:00:00Z' }],
    })).toBe('44 BCE–32 BCE');

    expect(reignYears({
      'position held': [{ 'start time': '+2022-09-08T00:00:00Z' }],
    })).toBe('2022–');

    expect(reignYears({
      'position held': [
        { label: 'Duke of Gloucester', 'start time': '+1461-11-01T00:00:00Z', 'end time': '+1483-06-26T00:00:00Z' },
        { label: 'monarch of England', 'start time': '+1483-06-26T00:00:00Z', 'end time': '+1485-08-22T00:00:00Z' },
      ],
    })).toBe('1483–1485');

    expect(monarchShortLabel({ label: 'Someone\nwith a date line' })).toBe('♔ Someone');
  });

  it('does not turn century precision into a reign year', () => {
    const century = { time: '1100-01-01T00:00:00Z', precision: 7 };
    const year = { time: '1100-01-01T00:00:00Z', precision: 9 };
    expect(yearOf(century)).toBeNull();
    expect(yearOf(year)).toBe(1100);
    expect(yearOf({ time: '-0043-03-15T00:00:00Z', precision: 11 })).toBe(-43);
    expect(reignYears({
      'position held': [{ label: 'king', 'start time': century, 'end time': year }],
    })).toBe('');
    expect(reignYears({
      'position held': [{
        label: 'king',
        'start time': year,
        'end time': { time: '1135-01-01T00:00:00Z', precision: 9 },
      }],
    })).toBe('1100–1135');
  });
});
