// Pure RoyalTree layout: positions = layoutGraph(elements, options).
//
// Runs in the layout Web Worker (royalTreeLayout.worker.js) or, where workers
// are unavailable (tests), on the main thread. It uses a headless Cytoscape
// instance so dagre sees exactly the node sizes and node/edge order the page's
// own graph would give it, and so returns the same positions the page used to
// compute in place. Packing components onto the shared year axis stays on the
// main thread (packComponents), because it needs label-aware bounding boxes.
//
// To swap the algorithm (e.g. a couple-aware layout), replace layoutComponent;
// the worker, caching and packing plumbing don't change.

import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';

cytoscape.use(dagre);

// The node-size properties of the page stylesheet. Layout depends only on
// these (dagre is given each node's outer box), so the page spreads them into
// its own style and the headless layout graph uses the same values.
export const PERSON_SIZE_STYLE = { width: 80, height: 100, 'border-width': 5, padding: '10px' };
export const MARRIAGE_SIZE_STYLE = { width: 5, height: 5, 'border-width': 2 };

const LAYOUT_STYLE = [
  { selector: 'node', style: PERSON_SIZE_STYLE },
  { selector: 'node[type = "marriage"]', style: MARRIAGE_SIZE_STYLE },
];

export const DAGRE_OPTIONS = { nodeSep: 50, rankSep: 100 };

// dagre 0.8.5's network-simplex ranker recomputes every cut value on every
// pivot, so it grows roughly quadratically: ~0.16s for England (261 nodes),
// ~7s at 2,309 nodes and ~30s at 3,806. Components above this size use the
// tight-tree ranker instead (1.1s and 2.4s for those two), which gives a valid
// but slightly wider layering. Smaller components keep network-simplex, so
// their layout is unchanged.
export const MAX_NETWORK_SIMPLEX_NODES = 1000;

// Parse a Wikidata date string ("+1650-...", "-0069-...") to a signed year.
export function parseYear(dateStr) {
  if (!dateStr) return null;
  const digits = String(dateStr).replace(/^[+-]/, '').split('-')[0];
  const year = parseInt(digits, 10);
  if (Number.isNaN(year)) return null;
  return String(dateStr).startsWith('-') ? -year : year;
}

// Only what layout reads: ids, endpoints, node type (size) and birth date
// (component median year). Succession edges are left out: they ride on top of
// the bloodline layout and would merge unrelated components.
export function toLayoutElements(elements) {
  const out = [];
  elements.forEach(el => {
    const d = el.data;
    if (el.group === 'nodes') {
      out.push({ group: 'nodes', data: { id: d.id, type: d.type, dob: d['date of birth'] } });
    } else if (d.relation !== 'succession') {
      out.push({ group: 'edges', data: { source: d.source, target: d.target } });
    }
  });
  return out;
}

function rankerFor(nodeCount, options) {
  const max = options.maxNetworkSimplexNodes ?? MAX_NETWORK_SIMPLEX_NODES;
  return nodeCount > max ? 'tight-tree' : 'network-simplex';
}

// Lay out one connected component. Returns flat [x0, y0, x1, y1, ...] in the
// component's node order.
function layoutComponent(comp, ranker) {
  comp.layout({ name: 'dagre', ...DAGRE_OPTIONS, ranker, animate: false, fit: false }).run();
  const nodes = comp.nodes();
  const xy = new Array(nodes.length * 2);
  nodes.forEach((n, i) => {
    const p = n.position();
    xy[2 * i] = p.x;
    xy[2 * i + 1] = p.y;
  });
  return xy;
}

function medianYear(nodes) {
  const years = nodes
      .map(n => parseYear(n.data('dob')))
      .filter(y => y != null)
      .sort((a, b) => a - b);
  return years.length ? years[Math.floor(years.length / 2)] : null;
}

// Cache of component layouts keyed by exact content and order, so re-merges
// that leave a component unchanged (rank filter, look-back, re-selecting a
// view) reuse its positions instead of re-running dagre on it.
const CACHE_LIMIT = 64;
const componentCache = new Map();

function componentKey(comp, ranker) {
  const parts = [ranker];
  comp.nodes().forEach(n => parts.push(n.id() + (n.data('type') === 'marriage' ? '*' : '')));
  parts.push('|');
  comp.edges().forEach(e => parts.push(e.data('source') + '>' + e.data('target')));
  return parts.join(',');
}

export function clearLayoutCache() {
  componentCache.clear();
}

/**
 * Lay out a RoyalTree graph.
 * @param {Array} elements layout elements (see toLayoutElements), in page order.
 * @param {object} [options] { maxNetworkSimplexNodes }
 * @returns {{components: Array<{ids: string[], xy: number[], medianYear: number|null, ranker: string, cached: boolean}>, ms: number}}
 */
export function layoutGraph(elements, options = {}) {
  const start = Date.now();
  const cy = cytoscape({ headless: true, styleEnabled: true, style: LAYOUT_STYLE, elements });
  try {
    const components = cy.elements().components().map(comp => {
      const nodes = comp.nodes();
      const ranker = rankerFor(nodes.length, options);
      const key = componentKey(comp, ranker);
      let xy = componentCache.get(key);
      const cached = Boolean(xy);
      if (cached) {
        componentCache.delete(key); // refresh LRU order
      } else {
        xy = layoutComponent(comp, ranker);
      }
      componentCache.set(key, xy);
      if (componentCache.size > CACHE_LIMIT) {
        componentCache.delete(componentCache.keys().next().value);
      }
      return { ids: nodes.map(n => n.id()), xy, medianYear: medianYear(nodes), ranker, cached };
    });
    return { components, ms: Date.now() - start };
  } finally {
    cy.destroy();
  }
}

// ~ dagre's rank spacing (200px/generation) over a ~25yr generation.
const PX_PER_YEAR = 8;
const COMPONENT_GAP = 140;

/** Map of node id -> {x, y} from a layoutGraph result (pre-packing). */
export function positionsById(result) {
  const out = new Map();
  result.components.forEach(({ ids, xy }) => {
    ids.forEach((id, i) => out.set(id, { x: xy[2 * i], y: xy[2 * i + 1] }));
  });
  return out;
}

/**
 * Pack laid-out components on the page's graph (nodes already placed at their
 * layoutGraph positions): shift each onto a shared birth-year axis and tile
 * them left to right in chronological order. Bounding boxes come from the live
 * graph so they include labels, as they always have.
 */
export function packComponents(cy, result) {
  const infos = result.components.map(({ ids, medianYear: year }) => {
    const nodes = cy.collection(ids.map(id => cy.getElementById(id)));
    const comp = nodes.union(nodes.connectedEdges().filter(e => e.data('relation') !== 'succession'));
    return { comp, bb: comp.boundingBox(), medianYear: year };
  });

  const knownYears = infos.map(i => i.medianYear).filter(y => y != null);
  const refYear = knownYears.length ? Math.min(...knownYears) : 0;

  // Read left-to-right in chronological order, like a timeline.
  infos.sort((a, b) => (a.medianYear ?? Infinity) - (b.medianYear ?? Infinity));

  let xOffset = 0;
  cy.batch(() => {
    infos.forEach(({ comp, bb, medianYear: year }) => {
      const dx = xOffset - bb.x1;
      const dy = year != null
          ? (year - refYear) * PX_PER_YEAR - (bb.y1 + bb.y2) / 2
          : -bb.y1;
      comp.nodes().shift({ x: dx, y: dy });
      xOffset += bb.w + COMPONENT_GAP;
    });
  });
}
