// Reign bars for the strip above the tree.
//
// Each monarch's bar uses the position held whose from/to best match the
// previous and next people in monarchList (the succession order). successionList
// is the family path between those monarchs, so its middle names are relatives,
// not the crown's predecessor and successor. A score of 10 is an immediate
// neighbour; 3 is some other monarch in the same list. The best score wins.
// A lower-scoring bar that overlaps it is a different office (James's Scottish
// reign on the England lane) and is dropped. A crown office that only continues
// a kept bar forward (Stephen's restored years) is kept. Touching spans merge.
// An office with a start and no end stays open. When no bar was kept, and the
// person has no death date, the open crown with the latest start is kept. A
// closed office, or an open office that is not a crown, stays dropped. A dead
// person's missing end is not an open reign. Nothing here edits the payload.

import { extractYear, monarchyColors } from './RoyalTreeUtils';

export const RAIL_EXPANDED_MIN_WIDTH = 768;
const STRONG_SCORE = 6;
const WEAK_SCORE = 3;
const CROWN_OFFICE = /monarch|king|queen|emperor|empress|kaiser|tsar|sultan|shah|pharaoh/i;

export function railCollapsedForWidth(width, manualCollapsed) {
  if (manualCollapsed != null) return manualCollapsed;
  return width < RAIL_EXPANDED_MIN_WIDTH;
}

function idSet(value) {
  if (!value) return new Set();
  if (typeof value === 'string') return new Set([value]);
  if (Array.isArray(value)) return new Set(value.filter((id) => typeof id === 'string'));
  return new Set();
}

function scorePosition(position, index, monarchs) {
  const from = idSet(position?.from);
  const to = idSet(position?.to);
  const previous = index > 0 ? monarchs[index - 1] : null;
  const next = index + 1 < monarchs.length ? monarchs[index + 1] : null;
  const earlier = new Set(monarchs.slice(0, index));
  const later = new Set(monarchs.slice(index + 1));
  let score = 0;
  if (previous && from.has(previous)) score += 10;
  if (next && to.has(next)) score += 10;
  if ([...from].some((id) => earlier.has(id))) score += 3;
  if ([...to].some((id) => later.has(id))) score += 3;
  return score;
}

function overlaps(a, b) {
  const aEnd = a.end == null ? Infinity : a.end;
  const bEnd = b.end == null ? Infinity : b.end;
  return a.start < bEnd && b.start < aEnd;
}

function mergeTouching(parts) {
  const closed = parts
    .filter((part) => part.end != null)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  closed.forEach((part) => {
    const last = merged[merged.length - 1];
    if (last && part.start <= last.end) last.end = Math.max(last.end, part.end);
    else merged.push({ start: part.start, end: part.end, openEnded: false });
  });
  parts.filter((part) => part.end == null).forEach((part) => {
    merged.push({ start: part.start, end: null, openEnded: true });
  });
  return merged;
}

// Titles the neighbour score drops even though the office is already dated.
// Matching is the trimmed label, case-insensitive, and only on that monarchy.
// A label is not kept just because someone else with that title scores 6.
const KEPT_TITLES = {
  bavaria: ['duke of bavaria'],
  austria: ['king of bohemia', 'king of the romans'],
  poland: ['king of poland'],
  germany: ['holy roman emperor', 'king of the romans'],
  'holy roman empire': ['holy roman emperor', 'king of the romans'],
};

function monarchyKey(name) {
  return String(name || '').replace(/_/g, ' ').trim().toLowerCase();
}

function keptTitle(monarchy, label) {
  const titles = KEPT_TITLES[monarchyKey(monarchy)];
  if (!titles) return false;
  return titles.includes(String(label || '').trim().toLowerCase());
}

function hasDeathDate(person) {
  const death = person?.['date of death'];
  if (death == null || death === '') return false;
  if (typeof death === 'object') return Boolean(death.time || death.tie);
  return String(death).trim() !== '';
}

export function reignSegments(person, index, monarchs, monarchy) {
  const positions = Array.isArray(person?.['position held']) ? person['position held'] : [];
  const candidates = [];
  positions.forEach((position) => {
    const start = extractYear(position?.['start time']);
    if (start == null) return;
    const label = position?.label || '';
    const end = extractYear(position?.['end time']);
    candidates.push({
      start,
      end,
      label,
      openEnded: end == null,
      score: scorePosition(position, index, monarchs),
      crown: CROWN_OFFICE.test(String(label)),
    });
  });
  const strong = candidates.filter((part) => part.score >= STRONG_SCORE);
  const kept = strong.filter((part) => !strong.some((other) => other.score > part.score && overlaps(part, other)));
  candidates.forEach((part) => {
    if (part.score >= STRONG_SCORE || part.score < WEAK_SCORE || !part.crown) return;
    const continues = kept.some((bar) => (
      bar.end != null && part.start >= bar.start && part.start <= bar.end
    ));
    if (continues) kept.push(part);
  });
  candidates.forEach((part) => {
    if (!keptTitle(monarchy, part.label)) return;
    if (kept.some((bar) => overlaps(part, bar))) return;
    kept.push(part);
  });
  if (!kept.length && !hasDeathDate(person)) {
    const openCrown = candidates
      .filter((part) => part.openEnded && part.crown)
      .sort((a, b) => b.start - a.start)[0];
    if (openCrown) kept.push(openCrown);
  }
  return mergeTouching(kept);
}

const DYNASTY_COLORS = [
  '#166534', '#1D4ED8', '#B45309', '#7C3AED', '#BE123C', '#0F766E', '#A16207', '#4338CA',
];

export function dynastyColor(family, fallback) {
  const name = typeof family === 'string' ? family.trim() : '';
  if (!name) return fallback;
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i) * (i + 3)) >>> 0;
  return DYNASTY_COLORS[hash % DYNASTY_COLORS.length];
}

// Undated monarchs have no reign to draw. A run of them is spaced between the
// neighbouring dated reigns so the empty years read as missing dates, not as
// a claim that nobody ruled.
function placeUndated(bars) {
  let index = 0;
  while (index < bars.length) {
    if (!bars[index].missing) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < bars.length && bars[end].missing) end += 1;
    const run = bars.slice(index, end);
    const previous = bars.slice(0, index).reverse().find((bar) => !bar.missing && (bar.end != null || bar.start != null));
    const next = bars.slice(end).find((bar) => !bar.missing && bar.start != null);
    const from = previous ? (previous.end ?? previous.start) : (next ? next.start : null);
    const to = next ? next.start : from;
    if (from != null) {
      const span = to == null ? 0 : to - from;
      run.forEach((bar, offset) => {
        bar.markerYear = span === 0 ? from : from + ((offset + 1) / (run.length + 1)) * span;
      });
    }
    index = end;
  }
  return bars;
}

function assignRows(bars) {
  const dated = bars.filter((bar) => !bar.missing);
  const ordered = [...dated].sort((a, b) => a.start - b.start || (a.end ?? 1e9) - (b.end ?? 1e9));
  const rowEnds = [];
  ordered.forEach((bar) => {
    const end = bar.end ?? Infinity;
    let row = 0;
    while ((rowEnds[row] ?? -Infinity) > bar.start) row += 1;
    rowEnds[row] = end;
    bar.row = row;
  });
  bars.forEach((bar) => {
    if (bar.missing) bar.row = 0;
  });
  return Math.max(1, rowEnds.length);
}

function buildLane(name, index, payload) {
  const ids = Array.isArray(payload?.monarchList) ? payload.monarchList : [];
  const nodes = payload?.nodes || {};
  const monarchs = ids.map((id, order) => {
    const person = nodes[id] || {};
    return {
      id,
      label: person.label || id,
      family: typeof person.family === 'string' ? person.family : '',
      order,
      segments: reignSegments(person, order, ids, name),
    };
  });
  const bars = [];
  monarchs.forEach((monarch, order) => {
    if (!monarch.segments.length) {
      bars.push({
        id: monarch.id,
        label: monarch.label,
        order,
        start: null,
        end: null,
        family: monarch.family,
        openEnded: false,
        missing: true,
        markerYear: null,
        row: 0,
      });
      return;
    }
    monarch.segments.forEach((segment) => {
      bars.push({
        id: monarch.id,
        label: monarch.label,
        order,
        start: segment.start,
        end: segment.end,
        family: monarch.family,
        openEnded: segment.openEnded,
        missing: false,
        markerYear: null,
        row: 0,
      });
    });
  });
  return {
    monarchy: name,
    index,
    color: monarchyColors(index).male,
    monarchs,
    bars,
    rowCount: assignRows(placeUndated(bars) || bars),
  };
}

export function buildReignLanes(payloads, selected) {
  const lanes = [];
  (selected || []).forEach((name, index) => {
    const payload = payloads?.[index];
    if (!payload || payload.type === 'house') return;
    lanes.push(buildLane(name, index, payload));
  });
  return lanes;
}

export function sharedDomain(lanes, nowYear) {
  let start = Infinity;
  let end = -Infinity;
  let open = false;
  (lanes || []).forEach((lane) => {
    lane.bars.forEach((bar) => {
      if (bar.missing || bar.start == null) return;
      start = Math.min(start, bar.start);
      if (bar.end != null) end = Math.max(end, bar.end);
      if (bar.openEnded) open = true;
    });
  });
  if (start === Infinity) return { start: 0, end: 1 };
  if (end === -Infinity) end = start;
  if (open) end = Math.max(end, nowYear);
  if (end <= start) end = start + 1;
  return { start, end };
}

export function yearToX(year, domain, width) {
  const span = domain.end - domain.start;
  if (!(span > 0)) return 0;
  return ((year - domain.start) / span) * width;
}

export function laneCoverage(lane) {
  const missing = lane.monarchs.filter((monarch) => monarch.segments.length === 0);
  const open = lane.monarchs.filter((monarch) => monarch.segments.some((part) => part.openEnded));
  const withStartAndEnd = lane.monarchs.filter((monarch) => (
    monarch.segments.some((part) => part.start != null && part.end != null)
  ));
  return {
    total: lane.monarchs.length,
    withStartAndEnd: withStartAndEnd.length,
    open: open.length,
    missing,
  };
}

export function successiveBreaks(monarchs) {
  const breaks = [];
  for (let i = 1; i < monarchs.length; i += 1) {
    const previous = monarchs[i - 1];
    const current = monarchs[i];
    const ends = previous.segments.map((part) => part.end).filter((year) => year != null);
    const starts = current.segments.map((part) => part.start).filter((year) => year != null);
    if (!ends.length || !starts.length) continue;
    const end = Math.max(...ends);
    const start = Math.min(...starts);
    if (start > end + 1) {
      breaks.push({
        after: previous.label,
        end,
        before: current.label,
        start,
        years: start - end,
      });
    }
  }
  return breaks;
}

export function formatReignYear(year) {
  if (year == null) return '';
  if (year > 0) return String(year);
  return `${1 - year} BCE`;
}
