// @vitest-environment node
// Couple-layout and band measurements on the committed royalty payloads.
// England at the default look-back (2) and siblings off. Crossings use
// England + Scotland. Layout time uses 9 monarchies at look-back 5.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import cytoscape from 'cytoscape';
import { convertToChart, mergeMonarchies, DEFAULT_BRIDGE_OPTIONS } from './RoyalTreeUtils';
import {
  assignLayoutBands, bandWidths, clearLayoutCache, compareSpouses, coupleOffsets, layoutGraph,
  packComponents, PERSON_SIZE_STYLE, MARRIAGE_SIZE_STYLE, positionsById,
  toLayoutElements, visibleSuccession,
} from './royalTreeLayout';

vi.unmock('cytoscape');
vi.unmock('cytoscape-dagre');

const ROYALTY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/royalty');
const HENRY = 'Q38370';
const WIVES = [
  ['Q162819', 'Catherine of Aragon'],
  ['Q80823', 'Anne Boleyn'],
  ['Q182637', 'Jane Seymour'],
];
const EDWARD = 'Q187114';
const EDWARD_WIVES = [
  ['Q3499686', 'Ecgwynn'],
  ['Q3435047', 'Ælfflæd, wife of Edward the Elder'],
  ['Q3433685', 'Eadgifu of Kent'],
];

const PAGE_STYLE = [
  { selector: 'node', style: { ...PERSON_SIZE_STYLE, label: 'data(label)', 'text-valign': 'bottom', 'text-wrap': 'wrap', 'text-max-width': 120 } },
  { selector: 'node[type = "marriage"]', style: { ...MARRIAGE_SIZE_STYLE, label: '' } },
];

function loadMonarchy(name) {
  return JSON.parse(gunzipSync(readFileSync(path.join(ROYALTY, `${name}.json.gz`))));
}

function chartElements(names, bridge = DEFAULT_BRIDGE_OPTIONS) {
  const payloads = names.map(loadMonarchy);
  const merged = mergeMonarchies(payloads, names, bridge, {});
  const chart = convertToChart(
      merged.data, merged.highlightedNodes, merged.sharedNodes, merged.nodeMonarchyIndex,
      merged.successionEdges, true, merged.memberFlag,
  );
  const all = [
    ...chart.nodes.map(n => ({ group: 'nodes', data: { ...n } })),
    ...chart.edges.map(e => ({ group: 'edges', data: { ...e } })),
  ];
  assignLayoutBands(all);
  return { all, merged };
}

function place(names, couple, bridge = DEFAULT_BRIDGE_OPTIONS, { bands = true } = {}) {
  const { all, merged } = chartElements(names, bridge);
  if (!bands) all.forEach(el => { if (el.group === 'edges') el.data.crossBand = false; });
  const elements = all.filter(el => el.data.relation !== 'succession');
  const succession = all.filter(el => el.data.relation === 'succession');
  const layout = layoutGraph(toLayoutElements(elements), { couple });
  const pos = positionsById(layout);
  const placed = elements.map(el => (
    el.group === 'nodes' ? { ...el, position: pos.get(el.data.id) } : el
  ));
  const cy = cytoscape({
    headless: true, styleEnabled: true, style: PAGE_STYLE, elements: placed, layout: { name: 'preset' },
  });
  packComponents(cy, layout);
  return { cy, layout, merged, elements, succession, all };
}

function marriageId(a, b) {
  return [a, b].sort().join('');
}

function rankIndex(cy) {
  const ys = [];
  cy.nodes().forEach(n => {
    const y = Math.round(n.position('y') * 1000) / 1000;
    if (!ys.includes(y)) ys.push(y);
  });
  ys.sort((a, b) => a - b);
  const index = new Map(ys.map((y, i) => [y, i]));
  return (id) => index.get(Math.round(cy.getElementById(id).position('y') * 1000) / 1000);
}

function sameRow(cy, ids) {
  const ys = ids.map(id => cy.getElementById(id).position('y'));
  return Math.max(...ys) - Math.min(...ys) < 1;
}

function boxesOverlap(a, b) {
  return a.x1 < b.x2 - 0.5 && b.x1 < a.x2 - 0.5 && a.y1 < b.y2 - 0.5 && b.y1 < a.y2 - 0.5;
}

function overlapCount(cy) {
  const nodes = cy.nodes().toArray();
  let n = 0;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i].boundingBox({ includeLabels: false });
    for (let j = i + 1; j < nodes.length; j++) {
      if (boxesOverlap(a, nodes[j].boundingBox({ includeLabels: false }))) n++;
    }
  }
  return n;
}

function orient(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function segmentsCross(a, b, c, d) {
  const d1 = orient(a.x, a.y, b.x, b.y, c.x, c.y);
  const d2 = orient(a.x, a.y, b.x, b.y, d.x, d.y);
  const d3 = orient(c.x, c.y, d.x, d.y, a.x, a.y);
  const d4 = orient(c.x, c.y, d.x, d.y, b.x, b.y);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// Straight-line crossings of drawn genealogy edges (not succession, not the
// hidden cross-band edges). Edges that share a vertex are not crossings.
function crossingCount(cy) {
  const edges = cy.edges().filter(e => e.data('relation') !== 'succession' && !e.data('crossBand')).toArray();
  const segs = edges.map(e => ({
    s: e.source().id(),
    t: e.target().id(),
    a: e.source().position(),
    b: e.target().position(),
  }));
  let n = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const p = segs[i];
      const q = segs[j];
      if (p.s === q.s || p.s === q.t || p.t === q.s || p.t === q.t) continue;
      if (segmentsCross(p.a, p.b, q.a, q.b)) n++;
    }
  }
  return n;
}

function coupleReport(cy, hub, spouses, data) {
  const ids = [hub, ...spouses.map(([id]) => id)];
  const marks = spouses.map(([id]) => marriageId(hub, id));
  const rowIds = [...ids, ...marks];
  const row = sameRow(cy, rowIds);
  const rank = rankIndex(cy);
  const hubRank = rank(hub);
  const children = [];
  spouses.forEach(([sid]) => {
    const mark = marriageId(hub, sid);
    Object.values(data).forEach(person => {
      if (!cy.getElementById(person.id).empty()
          && (person.mother === sid || person.father === sid)
          && (person.mother === hub || person.father === hub)) {
        children.push({
          id: person.id,
          label: person.label,
          spouse: sid,
          rankDelta: rank(person.id) - rank(mark),
        });
      }
    });
  });
  const order = spouses.map(([id, label]) => ({
    id,
    label,
    x: cy.getElementById(id).position('x'),
    y: cy.getElementById(id).position('y'),
  })).sort((a, b) => a.x - b.x);
  const markOverlap = marks.some(mid => {
    const box = cy.getElementById(mid).boundingBox({ includeLabels: false });
    return cy.nodes(`[type != "marriage"]`).some(n => boxesOverlap(box, n.boundingBox({ includeLabels: false })));
  });
  return { row, children, order, markOverlap, hubX: cy.getElementById(hub).position('x') };
}

// Nearest spouse on the right, the next on the left, then further right, and so on.
function expectedLeftToRight(hubId, spouseIds, data) {
  const ordered = spouseIds.map(id => ({
    id,
    label: data[id].label,
    dob: data[id]['date of birth'],
    marriageYear: data[id].marriageYear,
  })).sort(compareSpouses);
  const right = [];
  const left = [];
  ordered.forEach((s, i) => (i % 2 === 0 ? right : left).push(s.id));
  return [...left.reverse(), hubId, ...right];
}

const NINE = ['England', 'France', 'Germany', 'Austria', 'Spain', 'Holy_Roman_Empire', 'Bavaria', 'Bohemia', 'Hungary'];
// Tight-tree layout of this view, recorded by website-prop-royaltree-performance.
const RECORDED_LAYOUT_MS = 2400;

describe('couple and band layout', () => {
  beforeEach(() => clearLayoutCache());

  it('places a three-spouse row with marks between people', () => {
    const { offsets } = coupleOffsets('H', ['S1', 'S2', 'S3'], new Map([['S1', 'M1'], ['S2', 'M2'], ['S3', 'M3']]));
    const xs = Object.fromEntries([...offsets.entries()]);
    // Nearest (S1) on the right, S2 on the left, S3 further right.
    expect(xs.S2).toBeLessThan(xs.H);
    expect(xs.H).toBeLessThan(xs.S1);
    expect(xs.S1).toBeLessThan(xs.S3);
    expect(xs.M2).toBeGreaterThan(xs.S2);
    expect(xs.M2).toBeLessThan(xs.H);
    expect(xs.M1).toBeGreaterThan(xs.H);
    expect(xs.M1).toBeLessThan(xs.S1);
    expect(xs.M3).toBeGreaterThan(xs.S1);
    expect(xs.M3).toBeLessThan(xs.S3);
  });

  it('meets couple criteria 1-4 on England and England + Scotland', () => {
    const england = place(['England'], 'supernode');
    const height = england.cy.elements().boundingBox().h;
    clearLayoutCache();
    const baseline = place(['England'], 'off');
    const baseHeight = baseline.cy.elements().boundingBox().h;
    const drop = (baseHeight - height) / baseHeight;
    const henry = coupleReport(england.cy, HENRY, WIVES, england.merged.data);
    const edward = coupleReport(england.cy, EDWARD, EDWARD_WIVES, england.merged.data);

    expect(henry.row).toBe(true);
    expect(edward.row).toBe(true);
    expect(henry.children.length).toBeGreaterThan(0);
    expect(henry.children.every(c => c.rankDelta === 1)).toBe(true);
    expect(edward.children.every(c => c.rankDelta === 1)).toBe(true);
    expect(henry.markOverlap).toBe(false);
    expect(edward.markOverlap).toBe(false);
    const henryIds = [HENRY, ...WIVES.map(([id]) => id)];
    const edwardIds = [EDWARD, ...EDWARD_WIVES.map(([id]) => id)];
    const byX = (cy, ids) => [...ids].sort((a, b) => cy.getElementById(a).position('x') - cy.getElementById(b).position('x'));
    expect(byX(england.cy, henryIds)).toEqual(expectedLeftToRight(HENRY, WIVES.map(([id]) => id), england.merged.data));
    expect(byX(england.cy, edwardIds)).toEqual(expectedLeftToRight(EDWARD, EDWARD_WIVES.map(([id]) => id), england.merged.data));
    expect(drop).toBeGreaterThanOrEqual(0.35);

    clearLayoutCache();
    const both = place(['England', 'Scotland'], 'supernode');
    const crossings = crossingCount(both.cy);
    clearLayoutCache();
    const baseBoth = place(['England', 'Scotland'], 'off', DEFAULT_BRIDGE_OPTIONS, { bands: false });
    const baseCrossings = crossingCount(baseBoth.cy);
    expect(crossings).toBeLessThan(baseCrossings);
    expect(overlapCount(both.cy)).toBe(0);

    writeFileSync('/tmp/couple-acceptance.json', JSON.stringify({
      height, baseHeight, drop, crossings, baseCrossings,
      henry: henry.order.map(s => s.label),
      edward: edward.order.map(s => s.label),
    }, null, 2));
    england.cy.destroy();
    baseline.cy.destroy();
    both.cy.destroy();
    baseBoth.cy.destroy();
  });

  it('keeps England and France in separate x-bands and filters succession', () => {
    const view = place(['England', 'France'], 'supernode');
    const { cy, merged, succession, all } = view;
    const cross = all.filter(el => el.group === 'edges' && el.data.crossBand);
    expect(cross.length).toBeGreaterThan(0);
    const laidOut = new Set(toLayoutElements(all.filter(el => el.data.relation !== 'succession'))
        .filter(el => el.group === 'edges')
        .map(el => el.data.source + '>' + el.data.target));
    cross.forEach(el => expect(laidOut.has(el.data.source + '>' + el.data.target)).toBe(false));
    expect(merged.sharedCount).toBe(63);
    const seen = new Set();
    cy.nodes().forEach(n => {
      expect(seen.has(n.id())).toBe(false);
      seen.add(n.id());
    });

    const xs = { 0: [], 1: [] };
    cy.nodes().forEach(n => {
      if (n.data('type') === 'marriage' || merged.sharedNodes.has(n.id())) return;
      const b = n.data('band');
      if (xs[b]) xs[b].push(n.position('x'));
    });
    expect(Math.max(...xs[0])).toBeLessThan(Math.min(...xs[1]));

    const widths = bandWidths(cy);
    const kept = visibleSuccession(cy, succession, widths);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(succession.length);
    succession.forEach(el => {
      const sb = cy.getElementById(el.data.source).data('band');
      const tb = cy.getElementById(el.data.target).data('band');
      if (sb !== tb) expect(kept).not.toContain(el);
    });
    const sameBandKept = kept.filter(el => {
      const s = cy.getElementById(el.data.source);
      const t = cy.getElementById(el.data.target);
      return s.data('band') === t.data('band')
          && Math.abs(s.position('x') - t.position('x')) <= widths.get(el.data.monarchyIndex) / 2;
    });
    expect(sameBandKept.length).toBe(kept.length);
    let crossBandSuccession = 0;
    let longSuccession = 0;
    succession.forEach(el => {
      const s = cy.getElementById(el.data.source);
      const t = cy.getElementById(el.data.target);
      if (s.data('band') !== t.data('band')) crossBandSuccession++;
      else if (Math.abs(s.position('x') - t.position('x')) > widths.get(el.data.monarchyIndex) / 2) longSuccession++;
    });
    writeFileSync('/tmp/band-widths.json', JSON.stringify({
      england: widths.get(0),
      france: widths.get(1),
      halfEngland: widths.get(0) / 2,
      halfFrance: widths.get(1) / 2,
      successionKept: kept.length,
      successionTotal: succession.length,
      crossBandSuccession,
      longSuccession,
      crossBandEdges: cross.length,
    }, null, 2));
    cy.destroy();
  });

  it('lays out 9 monarchies at look-back 5 within 10% of the recorded layout', () => {
    const bridge = { ...DEFAULT_BRIDGE_OPTIONS, maxDepth: 5 };
    const { all } = chartElements(NINE, bridge);
    const elements = toLayoutElements(all.filter(el => el.data.relation !== 'succession'));
    clearLayoutCache();
    const before = layoutGraph(elements, { couple: 'off' });
    clearLayoutCache();
    const after = layoutGraph(elements, { couple: 'supernode' });
    writeFileSync('/tmp/layout-time.json', JSON.stringify({
      beforeMs: before.ms,
      afterMs: after.ms,
      recordedMs: RECORDED_LAYOUT_MS,
      nodes: elements.filter(el => el.group === 'nodes').length,
    }, null, 2));
    expect(after.ms).toBeLessThanOrEqual(before.ms * 1.1);
    expect(after.ms).toBeLessThanOrEqual(RECORDED_LAYOUT_MS * 1.1);
  }, 120_000);
});
