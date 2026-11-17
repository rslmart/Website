import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import cytoscape from 'cytoscape';
import { convertToChart } from './RoyalTreeUtils';
import { MONARCH_SIZE_STYLE, PERSON_SIZE_STYLE } from './royalTreeLayout';
import NodeToolTip from './NodeToolTip';
import {
  FOCUS_FONT,
  FOCUS_STATE_KEY,
  MIN_LABEL_PX,
  applyFocusFields,
  buildHourglass,
  fitHourglassViewport,
  focusNodeStyle,
  layoutHourglass,
  personPool,
  placeMarriageNodes,
  rememberView,
  restoreView,
  usableFocusViewport,
} from './focusHourglass';

vi.unmock('cytoscape');
vi.unmock('cytoscape-dagre');

const ROYALTY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/royalty');
const HENRY = 'Q38370';
const MARY = 'Q131412';

function loadMonarchy(name) {
  return JSON.parse(gunzipSync(readFileSync(path.join(ROYALTY, `${name}.json.gz`))));
}

function person(id, extra = {}) {
  return { id, label: extra.label || id, 'sex or gender': 'male', ...extra };
}

// An independent count of the same rule the badges use: parents of the top
// blood generation and children of the bottom one, when those relatives are
// in the pool and not already drawn.
function expectedBadges(pool, model) {
  const side = new Set(model.side);
  const gens = model.generations;
  const blood = model.people.filter((id) => !side.has(id));
  const values = blood.map((id) => gens[id]);
  const minGen = Math.min(...values);
  const maxGen = Math.max(...values);
  const badges = [];
  for (const id of blood) {
    const person = pool[id];
    if (gens[id] === minGen) {
      const hidden = [person.father, person.mother].filter((pid, index, list) => (
        pid && pool[pid] && list.indexOf(pid) === index && !(pid in gens)
      ));
      if (hidden.length) badges.push({ id, direction: 'up', count: hidden.length, hiddenIds: [...hidden].sort() });
    }
    if (gens[id] === maxGen) {
      const seen = new Set();
      const hidden = [];
      for (const cid of person.child || []) {
        if (!cid || seen.has(cid) || !pool[cid] || cid in gens) continue;
        seen.add(cid);
        hidden.push(cid);
      }
      if (hidden.length) badges.push({ id, direction: 'down', count: hidden.length, hiddenIds: hidden.sort() });
    }
  }
  badges.sort((a, b) => a.id.localeCompare(b.id) || a.direction.localeCompare(b.direction));
  return badges;
}

function diamondPool() {
  return {
    F: person('F', { label: 'Focus', father: 'A', mother: 'B', spouse: ['S'], child: ['C'] }),
    S: person('S', { label: 'Spouse', spouse: ['F'] }),
    A: person('A', { label: 'Father', mother: 'GM', child: ['F', 'Sib'] }),
    B: person('B', { label: 'Mother', mother: 'GM', child: ['F'] }),
    GM: person('GM', { label: 'Shared grandmother', child: ['A', 'B'] }),
    Sib: person('Sib', { label: 'Collateral sibling', father: 'A' }),
    C: person('C', { label: 'Child', father: 'F', mother: 'S', child: ['G'] }),
    G: person('G', { label: 'Grandchild', father: 'C' }),
    Hidden: person('Hidden', { label: 'Great grandmother', child: ['GM'] }),
  };
}

describe('hourglass subgraph', () => {
  it('keeps direct kin and spouses, drops collaterals, and links a repeated ancestor', () => {
    const pool = diamondPool();
    const model = buildHourglass(pool, 'F', { up: 2, down: 2 });
    expect(model.people).toEqual(expect.arrayContaining(['F', 'S', 'A', 'B', 'GM', 'C', 'G']));
    expect(model.people).not.toContain('Sib');
    expect(model.people).not.toContain('Hidden');
    expect(new Set(model.people).size).toBe(model.people.length);
    expect(model.generations.GM).toBe(-2);
    expect(model.repeatedIds).toContain('GM');
    expect(model.linked).toBe(true);
    expect(model.side).toContain('S');
    expect(model.generations.S).toBe(0);
    expect(model.generations.G).toBe(2);
  });

  it('counts hidden parents and children and expands exactly those people', () => {
    const pool = diamondPool();
    pool.GM.mother = 'Hidden';
    const model = buildHourglass(pool, 'F', { up: 1, down: 1 });
    expect(model.people).not.toContain('GM');
    expect(model.people).not.toContain('G');
    const up = model.badges.find((badge) => badge.id === 'A' && badge.direction === 'up');
    const down = model.badges.find((badge) => badge.id === 'C' && badge.direction === 'down');
    expect(up.count).toBe(up.hiddenIds.length);
    expect(up.hiddenIds).toEqual(['GM']);
    expect(down).toMatchObject({ count: 1, hiddenIds: ['G'] });
    expect(model.badges).toEqual(expectedBadges(pool, model));

    const expanded = buildHourglass(pool, 'F', {
      up: 1,
      down: 1,
      expandedUp: { A: true },
      expandedDown: { C: true },
    });
    expect(expanded.people).toContain('GM');
    expect(expanded.people).toContain('G');
    expect(expanded.people).not.toContain('Sib');
    expect(expanded.badges.find((badge) => badge.id === 'A' && badge.direction === 'up')).toBeUndefined();
  });

  it('reads ancestors from nodes and extendedNodes of every selected tree', () => {
    const pool = personPool([
      {
        nodes: { A: { id: 'A', label: 'A', father: 'B' } },
        extendedNodes: { B: { id: 'B', label: 'B', father: 'C' } },
      },
      {
        nodes: { D: { id: 'D', label: 'D' } },
        extendedNodes: { C: { id: 'C', label: 'C' } },
      },
    ]);
    const model = buildHourglass(pool, 'A', { up: 3, down: 2 });
    expect(model.people).toEqual(expect.arrayContaining(['A', 'B', 'C']));
    expect(model.generations.C).toBe(-2);
    expect(new Set(model.people).size).toBe(model.people.length);
  });
});

describe('focus back stack', () => {
  it('restores zoom and pan in stack order', () => {
    let stack = rememberView([], { zoom: 0.2, pan: { x: 10, y: 20 } });
    stack = rememberView(stack, { zoom: 1.4, pan: { x: 3, y: 4 } });
    const first = restoreView(stack);
    expect(first.view).toEqual({ zoom: 1.4, pan: { x: 3, y: 4 } });
    const second = restoreView(first.stack);
    expect(second.view).toEqual({ zoom: 0.2, pan: { x: 10, y: 20 } });
    expect(restoreView(second.stack)).toEqual({ stack: [], view: null });
    expect(FOCUS_STATE_KEY).toBe('focusedPersonId');
  });
});

describe('Focus button', () => {
  it('is a keyboard-reachable button and does not fire when the row is only clicked as text', async () => {
    const onFocus = vi.fn();
    const user = userEvent.setup();
    render(<NodeToolTip data={{ id: 'Q1', label: 'Anne Boleyn', type: 'circle' }} onFocus={onFocus} />);
    const button = screen.getByRole('button', { name: 'Focus on Anne Boleyn' });
    button.focus();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledWith('Q1');
  });
});

const PAGE_STYLE = [
  {
    selector: 'node',
    style: {
      ...PERSON_SIZE_STYLE,
      label: '',
      'font-size': 14,
      'text-valign': 'bottom',
      'text-wrap': 'wrap',
    },
  },
  {
    selector: 'node[?monarch]',
    style: { ...MONARCH_SIZE_STYLE, label: 'data(shortLabel)', 'font-size': 18 },
  },
  focusNodeStyle(),
  { selector: 'node[type = "marriage"]', style: { width: 5, height: 5, label: '' } },
];

function assertHourglassFits(pool, focusId, highlighted) {
  const model = buildHourglass(pool, focusId, { up: 3, down: 2 });
  expect(model.people.length).toBeGreaterThan(5);
  expect(model.people.length).toBeLessThan(80);
  expect(new Set(model.people).size).toBe(model.people.length);
  expect(model.badges).toEqual(expectedBadges(pool, model));

  const usable = usableFocusViewport(390, 844, { mobile: true });
  const layout = layoutHourglass(pool, model, usable);
  const data = {};
  model.people.forEach((id) => { data[id] = pool[id]; });
  const chart = convertToChart(data, highlighted, new Set(), {}, [], false, null);
  placeMarriageNodes(layout.positions, chart.nodes, chart.edges);
  const elements = [];
  for (const node of chart.nodes) {
    const position = layout.positions.get(node.id);
    if (!position) continue;
    const data = {
      ...node,
      color: node.style?.fill,
      borderColor: node.style?.stroke,
      opacity: node.style?.opacity,
    };
    const element = { group: 'nodes', data, position: { ...position } };
    if (node.type !== 'marriage') {
      element.classes = 'focus-on';
      applyFocusFields(data, pool[node.id] || node, layout, !!node.monarch);
    }
    elements.push(element);
  }
  expect(elements.filter((el) => el.data.type !== 'marriage').length).toBe(model.people.length);

  const cy = cytoscape({ headless: true, styleEnabled: true, style: PAGE_STYLE, elements });
  const bounds = cy.elements().boundingBox({ includeLabels: true });
  const fit = fitHourglassViewport(bounds, usable);
  expect(FOCUS_FONT * fit.zoom).toBeGreaterThanOrEqual(MIN_LABEL_PX);

  cy.nodes('[type != "marriage"]').forEach((node) => {
    const box = node.boundingBox({ includeLabels: true });
    const x1 = box.x1 * fit.zoom + fit.pan.x;
    const y1 = box.y1 * fit.zoom + fit.pan.y;
    const x2 = box.x2 * fit.zoom + fit.pan.x;
    const y2 = box.y2 * fit.zoom + fit.pan.y;
    expect(x1, node.id()).toBeGreaterThanOrEqual(-1);
    expect(y1, node.id()).toBeGreaterThanOrEqual(-1);
    expect(x2, node.id()).toBeLessThanOrEqual(391);
    expect(y2, node.id()).toBeLessThanOrEqual(845);
    const font = parseFloat(node.style('font-size'));
    expect(font * fit.zoom, node.id()).toBeGreaterThanOrEqual(MIN_LABEL_PX);
    expect(String(node.style('label') || ''), node.id()).not.toBe('');
    expect(parseFloat(node.style('width')), node.id()).toBeCloseTo(layout.nodeW, 0);
  });
  return { model, fit };
}

describe('+k counts and phone fit', () => {
  const england = personPool([loadMonarchy('England')]);
  const scotland = personPool([loadMonarchy('Scotland')]);

  it('matches Henry VIII’s hidden-relative counts and fits 390×844', () => {
    const { model } = assertHourglassFits(england, HENRY, [HENRY]);
    expect(model.people).toContain('Q162819');
    expect(model.generations[HENRY]).toBe(0);
    const up = Math.min(...model.people.map((id) => model.generations[id]));
    const down = Math.max(...model.people.map((id) => model.generations[id]));
    expect(up).toBe(-3);
    expect(down).toBeGreaterThanOrEqual(1);
    expect(down).toBeLessThanOrEqual(2);
  });

  it('fits Mary, Queen of Scots, the same way', () => {
    assertHourglassFits(scotland, MARY, [MARY]);
  });
});
