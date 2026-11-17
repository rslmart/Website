// @vitest-environment node
import { describe, expect, it, beforeEach, vi } from 'vitest';
import cytoscape from 'cytoscape';
import {
  layoutGraph, toLayoutElements, packComponents, positionsById, clearLayoutCache, parseYear,
  PERSON_SIZE_STYLE, MARRIAGE_SIZE_STYLE, bandWidths, visibleSuccession,
} from './royalTreeLayout';
import { convertToChart } from './RoyalTreeUtils';

// src/test/setup.js mocks Cytoscape for component tests; layout needs the real one.
vi.unmock('cytoscape');
vi.unmock('cytoscape-dagre');

// A small two-family graph plus an unrelated pair, in the shapes
// convertToChart produces (people, marriage dots, succession overlay).
function person(id, extra = {}) {
  return { id, label: id, 'sex or gender': 'male', ...extra };
}
const DATA = {
  A: person('A', { spouse: ['B'], 'date of birth': '+1500-01-01T00:00:00Z' }),
  B: person('B', { 'sex or gender': 'female', spouse: ['A'], 'date of birth': '+1502-01-01T00:00:00Z' }),
  C: person('C', { father: 'A', mother: 'B', 'date of birth': '+1530-01-01T00:00:00Z', spouse: ['D'] }),
  D: person('D', { 'sex or gender': 'female', spouse: ['C'], 'date of birth': '+1531-01-01T00:00:00Z' }),
  E: person('E', { father: 'C', mother: 'D', 'date of birth': '+1560-01-01T00:00:00Z' }),
  F: person('F', { father: 'C', mother: 'D', 'date of birth': '+1562-01-01T00:00:00Z' }),
  X: person('X', { 'date of birth': '-0069-01-01T00:00:00Z' }),
  Y: person('Y', { father: 'X', 'date of birth': '-0040-01-01T00:00:00Z' }),
};
const SUCCESSION = [{ source: 'A', target: 'C' }, { source: 'C', target: 'E' }];

function pageElements() {
  const chart = convertToChart(DATA, ['A', 'C', 'E'], new Set(), {}, SUCCESSION, true, null);
  return [
    ...chart.nodes.map(n => ({ group: 'nodes', data: { ...n } })),
    ...chart.edges.map(e => ({ group: 'edges', data: { ...e } })),
  ];
}

const PAGE_STYLE = [
  { selector: 'node', style: { ...PERSON_SIZE_STYLE, label: 'data(label)' } },
  { selector: 'node[type = "marriage"]', style: MARRIAGE_SIZE_STYLE },
];
// The size properties the pre-worker page stylesheet had, written out so the
// fidelity test doesn't just compare the module with itself.
const OLD_PAGE_STYLE = [
  { selector: 'node', style: { shape: 'rectangle', width: 80, height: 100, 'border-width': 5, padding: '10px', label: 'data(label)' } },
  { selector: 'node[type = "marriage"]', style: { width: 5, height: 5, 'border-width': 2 } },
];

// The pre-worker algorithm: dagre run in place on each bloodline component.
function referencePositions(elements) {
  const cy = cytoscape({ headless: true, styleEnabled: true, style: OLD_PAGE_STYLE, elements });
  const layoutEles = cy.elements().filter(el => el.isNode() || el.data('relation') !== 'succession');
  layoutEles.components().forEach(comp => {
    // Exactly the options the pre-worker RoyalTreePage used.
    comp.layout({ name: 'dagre', nodeSep: 50, rankSep: 100, animate: false }).run();
  });
  const out = {};
  cy.nodes().forEach(n => { out[n.id()] = { ...n.position() }; });
  cy.destroy();
  return out;
}

function positionsOf(result) {
  const out = {};
  result.components.forEach(({ ids, xy }) => {
    ids.forEach((id, i) => { out[id] = { x: xy[2 * i], y: xy[2 * i + 1] }; });
  });
  return out;
}

describe('royalTreeLayout', () => {
  beforeEach(() => clearLayoutCache());

  it('parses signed Wikidata years', () => {
    expect(parseYear('+1650-01-01T00:00:00Z')).toBe(1650);
    expect(parseYear('-0069-01-01T00:00:00Z')).toBe(-69);
    expect(parseYear(undefined)).toBeNull();
  });

  it('drops succession edges and person data from layout input', () => {
    const els = toLayoutElements(pageElements());
    expect(els.some(e => e.group === 'edges' && e.data.relation)).toBe(false);
    expect(els.filter(e => e.group === 'edges')).toHaveLength(
        pageElements().filter(e => e.group === 'edges' && e.data.relation !== 'succession').length);
    const a = els.find(e => e.data.id === 'A');
    expect(a.data).toMatchObject({ id: 'A', type: 'circle', dob: '+1500-01-01T00:00:00Z', band: 0 });
    expect(a.data.label).toContain('A');
  });

  it('matches the in-place dagre layout exactly', () => {
    const elements = pageElements();
    const result = layoutGraph(toLayoutElements(elements), { couple: 'off' });
    expect(result.components).toHaveLength(2);
    expect(result.components.every(c => c.ranker === 'network-simplex')).toBe(true);
    expect(positionsOf(result)).toEqual(referencePositions(elements));
  });

  it('reports each component\'s median birth year', () => {
    const result = layoutGraph(toLayoutElements(pageElements()));
    const years = result.components.map(c => c.medianYear).sort((a, b) => a - b);
    expect(years).toEqual([-40, 1531]);
  });

  it('reuses cached component layouts', () => {
    const els = toLayoutElements(pageElements());
    const first = layoutGraph(els);
    const second = layoutGraph(els);
    expect(first.components.every(c => !c.cached)).toBe(true);
    expect(second.components.every(c => c.cached)).toBe(true);
    expect(positionsOf(second)).toEqual(positionsOf(first));
  });

  it('switches large components to the tight-tree ranker', () => {
    const result = layoutGraph(toLayoutElements(pageElements()), { maxNetworkSimplexNodes: 3 });
    const big = result.components.find(c => c.ids.includes('A'));
    const small = result.components.find(c => c.ids.includes('X'));
    expect(big.ranker).toBe('tight-tree');
    expect(small.ranker).toBe('network-simplex');
    // Parents still sit above children.
    const pos = positionsOf(result);
    expect(pos.A.y).toBeLessThan(pos.C.y);
    expect(pos.C.y).toBeLessThan(pos.E.y);
  });

  it('omits succession edges that cross bands or exceed half the band width', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: [{ selector: 'node', style: { width: 80, height: 100 } }],
      layout: { name: 'preset' },
      elements: [
        { data: { id: 'a', band: 0 }, position: { x: 0, y: 0 } },
        { data: { id: 'b', band: 0 }, position: { x: 1000, y: 0 } },
        { data: { id: 'c', band: 0 }, position: { x: 200, y: 0 } },
        { data: { id: 'd', band: 1 }, position: { x: 3000, y: 0 } },
      ],
    });
    const widths = bandWidths(cy);
    const edges = [
      { data: { source: 'a', target: 'c', monarchyIndex: 0 } },
      { data: { source: 'a', target: 'b', monarchyIndex: 0 } },
      { data: { source: 'c', target: 'd', monarchyIndex: 1 } },
    ];
    const kept = visibleSuccession(cy, edges, widths);
    expect(widths.get(0)).toBeGreaterThan(1000);
    expect(kept.map(e => e.data.target)).toEqual(['c']);
    cy.destroy();
  });

  it('packs components left to right in chronological order', () => {
    const elements = pageElements();
    const result = layoutGraph(toLayoutElements(elements));
    const pos = positionsById(result);
    const placed = elements.map(el => (el.group === 'nodes' ? { ...el, position: pos.get(el.data.id) } : el));
    const cy = cytoscape({ headless: true, styleEnabled: true, style: PAGE_STYLE, elements: placed, layout: { name: 'preset' } });
    packComponents(cy, result);
    const bb = id => cy.getElementById(id).boundingBox();
    // The Roman-era pair comes first, the 16th-century family after it.
    expect(bb('X').x2).toBeLessThan(bb('A').x1);
    // Generations keep their relative layout.
    expect(cy.getElementById('A').position('y')).toBeLessThan(cy.getElementById('E').position('y'));
    cy.destroy();
  });
});
