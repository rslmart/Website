// One zoom definition for RoyalTree (website-prop-royaltree-controls-mobile).
// Criteria 5–7 measure at the default zoom this module defines.
// Research 2026-11-17 (reviews/royaltree-view/findings.md): min-zoomed-font-size
// plus a zoom-tier class, no new dependency, no minimap.

import { parseYear } from './royalTreeLayout';

// Monarch overview labels are this many CSS pixels in the stylesheet.
// The default view is a fit clamped so those labels are at least
// MIN_ONSCREEN_LABEL_PX on screen (font size × zoom).
export const MONARCH_LABEL_FONT = 18;
export const MIN_ONSCREEN_LABEL_PX = 10;
export const DEFAULT_MIN_ZOOM = MIN_ONSCREEN_LABEL_PX / MONARCH_LABEL_FONT;

// Overview is everything below ZOOM_MID, including the default zoom.
// Portraits are not tiered: a node with an image shows it at every zoom.
// Mid shows full monarch labels. Detail shows every label and the house names on edges.
export const ZOOM_MID = 1;
export const ZOOM_DETAIL = 1.6;

export const NON_MONARCH_FONT = 14;
export const EDGE_LABEL_FONT = 14;

// The detail cut, in CSS pixels of type. The handler switches labels with a
// class rather than min-zoomed-font-size, because that threshold is scaled by
// the device pixel ratio and would show house names on a retina phone at the
// overview zoom.
export const DETAIL_LABEL_MIN = NON_MONARCH_FONT * ZOOM_DETAIL;
export const EDGE_LABEL_MIN = EDGE_LABEL_FONT * ZOOM_DETAIL;

export const MONARCH_MARK = '♔';
export const ZOOM_STEP = 1.25;

// Phone details sheet, as a fraction of the screen. RoyalTreeStyle.css caps
// .mobile-sheet at the same 45%.
export const SHEET_FRACTION = 0.45;

export function zoomTier(zoom) {
  if (zoom >= ZOOM_DETAIL) return 'detail';
  if (zoom >= ZOOM_MID) return 'mid';
  return 'overview';
}

// The only default-zoom function. Fit, then never go below the readable floor.
export function defaultZoomLevel(fittedZoom) {
  const fitted = Number.isFinite(fittedZoom) ? fittedZoom : DEFAULT_MIN_ZOOM;
  return Math.max(fitted, DEFAULT_MIN_ZOOM);
}

// A string is a year. An object that carries precision goes through parseYear,
// so millennium, century and decade stay null. A time with no precision is
// still that year, including a BCE year.
export function yearOf(value) {
  if (typeof value === 'string') return parseYear(value);
  if (value && typeof value === 'object' && value.precision != null) return parseYear(value);
  if (value && typeof value.time === 'string') return parseYear(value.time);
  return null;
}

function formatReignYear(year) {
  if (year > 0) return String(year);
  return `${1 - year} BCE`;
}

// A crown office (monarch, king, queen, emperor) beats a longer lesser title,
// so Richard III is 1483–1485 and not his years as Duke of Gloucester.
// Years only, so a day-precision reign stays "1066–1087".
// An object with precision is passed through whole, so a century does not
// become the year on its timestamp.
const CROWN_OFFICE = /monarch|king|queen|emperor|empress|kaiser|tsar|sultan|shah|pharaoh/i;

export function reignYears(person) {
  const positions = Array.isArray(person?.['position held']) ? person['position held'] : [];
  const dated = [];
  positions.forEach((pos) => {
    const start = yearOf(pos?.['start time']);
    if (start == null) return;
    const end = yearOf(pos?.['end time']);
    dated.push({
      start,
      end,
      span: (end == null ? start : end) - start,
      crown: CROWN_OFFICE.test(String(pos?.label || '')),
    });
  });
  const crowns = dated.filter((pos) => pos.crown);
  const pool = crowns.length ? crowns : dated;
  let best = null;
  pool.forEach((pos) => {
    if (!best || pos.span > best.span) best = pos;
  });
  if (!best) return '';
  const startText = formatReignYear(best.start);
  if (best.end == null) return `${startText}–`;
  const endText = formatReignYear(best.end);
  return startText === endText ? startText : `${startText}–${endText}`;
}

export function monarchShortLabel(person) {
  const name = String(person?.label || '').split('\n')[0];
  const reign = reignYears(person);
  return reign ? `${MONARCH_MARK} ${name}\n${reign}` : `${MONARCH_MARK} ${name}`;
}
