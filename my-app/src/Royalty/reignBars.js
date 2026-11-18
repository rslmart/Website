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
// An office with a start and no end stays open. Nothing here edits the payload.

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

export function reignSegments(person, index, monarchs) {
  const positions = Array.isArray(person?.['position held']) ? person['position held'] : [];
  const candidates = [];
  positions.forEach((position) => {
    const start = extractYear(position?.['start time']);
    if (start == null) return;
    const end = extractYear(position?.['end time']);
    candidates.push({
      start,
      end,
      openEnded: end == null,
      score: scorePosition(position, index, monarchs),
      crown: CROWN_OFFICE.test(String(position?.label || '')),
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
  return mergeTouching(kept);
}

function markerYear(monarchs, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const ends = monarchs[i].segments.map((part) => part.end).filter((year) => year != null);
    if (ends.length) return Math.max(...ends);
  }
  for (let i = index + 1; i < monarchs.length; i += 1) {
    const starts = monarchs[i].segments.map((part) => part.start).filter((year) => year != null);
    if (starts.length) return Math.min(...starts);
  }
  return null;
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
      order,
      segments: reignSegments(person, order, ids),
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
        openEnded: false,
        missing: true,
        markerYear: markerYear(monarchs, order),
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
    rowCount: assignRows(bars),
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
