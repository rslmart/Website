// Pure RoyalTree layout: positions = layoutGraph(elements, options).
//
// Runs in the layout Web Worker (royalTreeLayout.worker.js) or, where workers
// are unavailable (tests), on the main thread. It uses a headless Cytoscape
// instance so dagre sees exactly the node sizes and node/edge order the page's
// own graph would give it, and so returns the same positions the page used to
// compute in place. Packing components onto the shared year axis stays on the
// main thread (packComponents), because it needs label-aware bounding boxes.
//
// Couple rows are laid out here (layoutComponent). Cross-band genealogy edges
// are omitted by toLayoutElements; packComponents keeps each monarchy's
// components in one x-band. The worker, caching and the rest of the packing
// plumbing don't change.

import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';

cytoscape.use(dagre);

// The node-size properties of the page stylesheet. Layout depends only on
// these (dagre is given each node's outer box), so the page spreads them into
// its own style and the headless layout graph uses the same values.
export const PERSON_SIZE_STYLE = { width: 80, height: 100, 'border-width': 5, padding: '10px' };
export const MARRIAGE_SIZE_STYLE = { width: 5, height: 5, 'border-width': 2 };
// Larger than a person, same border width. The page draws monarchs at this
// size too, so dagre leaves room and bodies do not overlap. Shape and the
// crown glyph are paint-only; they are not part of the layout box.
// Wider than a person, same height. A taller body dropped the couple-layout
// height saving under 35%, and a wider one overlaps the marriage mark: the
// mark sits 75px from a spouse centre and padding makes the body wider than
// the style width. The ellipse and the crown glyph carry the rest of the cue.
export const MONARCH_SIZE_STYLE = { width: 90, height: 100, 'border-width': 5, padding: '10px' };

const LAYOUT_STYLE = [
  { selector: 'node', style: PERSON_SIZE_STYLE },
  { selector: 'node[?monarch]', style: MONARCH_SIZE_STYLE },
  { selector: 'node[type = "marriage"]', style: MARRIAGE_SIZE_STYLE },
];

export const DAGRE_OPTIONS = { nodeSep: 50, rankSep: 100 };

// Center distance between a person and the next person in a couple row.
// Person bodies are 80px and labels 120px, so 150 leaves a gap for the
// marriage mark and keeps the label boxes apart.
export const COUPLE_PITCH = 150;

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

// Only what layout reads: ids, endpoints, node type (size), birth date
// (component median year and couple ordering) and band. Succession edges and
// cross-band genealogy edges are left out. Succession rides on top of the
// bloodline. Cross-band edges stay on the page graph for the shared-person
// highlight, but they would merge two monarchies into one component.
export function toLayoutElements(elements) {
  const out = [];
  elements.forEach(el => {
    const d = el.data;
    if (el.group === 'nodes') {
      const data = { id: d.id, type: d.type, dob: d['date of birth'] };
      if (d.label) data.label = d.label;
      if (d.band != null) data.band = d.band;
      if (d.monarch) data.monarch = true;
      out.push({ group: 'nodes', data });
    } else if (d.relation !== 'succession' && !d.crossBand) {
      out.push({ group: 'edges', data: { source: d.source, target: d.target } });
    }
  });
  return out;
}

// Give every marriage node the band of its earliest spouse, then flag edges
// whose endpoints sit in different bands. People already carry `band` (the
// first selected monarchy that contains them). Shared people keep that one
// band, so the other monarchy's edges to them are the cross-band edges.
export function assignLayoutBands(elements) {
  const band = new Map();
  elements.forEach(el => {
    if (el.group === 'nodes' && el.data.type !== 'marriage' && el.data.band != null) {
      band.set(el.data.id, el.data.band);
    }
  });
  const incoming = new Map();
  elements.forEach(el => {
    if (el.group !== 'edges' || el.data.relation === 'succession' || el.data.relation === 'sibling') return;
    if (band.has(el.data.source) && !band.has(el.data.target)) {
      const list = incoming.get(el.data.target) || [];
      list.push(el.data.source);
      incoming.set(el.data.target, list);
    }
  });
  elements.forEach(el => {
    if (el.group !== 'nodes' || el.data.type !== 'marriage') return;
    const bands = (incoming.get(el.data.id) || []).map(id => band.get(id)).filter(b => b != null);
    const b = bands.length ? Math.min(...bands) : 0;
    el.data.band = b;
    band.set(el.data.id, b);
  });
  elements.forEach(el => {
    if (el.group !== 'edges' || el.data.relation === 'succession') return;
    const sb = band.get(el.data.source);
    const tb = band.get(el.data.target);
    el.data.crossBand = sb != null && tb != null && sb !== tb;
  });
  return band;
}

// Spouse order: marriage year, then birth year, then name. The payloads store
// spouses as Q-ids, with no marriage year, so the later keys decide until a
// year is present on the record.
export function compareSpouses(a, b) {
  const ma = a.marriageYear;
  const mb = b.marriageYear;
  if (ma != null && mb != null && ma !== mb) return ma - mb;
  if (ma != null && mb == null) return -1;
  if (ma == null && mb != null) return 1;
  const ya = parseYear(a.dob);
  const yb = parseYear(b.dob);
  if (ya != null && yb != null && ya !== yb) return ya - yb;
  if (ya != null && yb == null) return -1;
  if (ya == null && yb != null) return 1;
  const na = String(a.label || '').split('\n')[0];
  const nb = String(b.label || '').split('\n')[0];
  const byName = na.localeCompare(nb);
  return byName || String(a.id).localeCompare(String(b.id));
}

// Horizontal row for one couple cluster. Index 0 sits on the right of the hub
// (nearest), index 1 on the left, index 2 further right, and so on. The
// marriage mark sits halfway between that spouse and the person toward the hub.
// Offsets are relative to the row's center. Width is the row's body width.
export function coupleOffsets(hubId, orderedSpouseIds, marriageIdBySpouse) {
  const x = new Map();
  x.set(hubId, 0);
  const right = [];
  const left = [];
  orderedSpouseIds.forEach((id, i) => (i % 2 === 0 ? right : left).push(id));
  const place = (ids, sign) => {
    ids.forEach((id, i) => {
      const px = sign * (i + 1) * COUPLE_PITCH;
      x.set(id, px);
      const prev = i === 0 ? hubId : ids[i - 1];
      const mid = marriageIdBySpouse.get(id);
      if (mid) x.set(mid, (x.get(prev) + px) / 2);
    });
  };
  place(right, 1);
  place(left, -1);
  const values = [...x.values()];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const center = (min + max) / 2;
  const offsets = new Map();
  x.forEach((v, id) => offsets.set(id, v - center));
  return { offsets, width: max - min + PERSON_SIZE_STYLE.width };
}

function bodySizeOf(node) {
  if (node.data('type') === 'marriage') return MARRIAGE_SIZE_STYLE;
  if (node.data('monarch')) return MONARCH_SIZE_STYLE;
  return PERSON_SIZE_STYLE;
}

// Body box of a couple row. Offsets stay on the centres coupleOffsets chose,
// so the marriage marks stay on the line between the people they join.
function boxFromOffsets(offsets, sizeOf) {
  let minX = Infinity;
  let maxX = -Infinity;
  let height = 0;
  offsets.forEach((dx, id) => {
    const size = sizeOf(id);
    minX = Math.min(minX, dx - size.width / 2);
    maxX = Math.max(maxX, dx + size.width / 2);
    height = Math.max(height, size.height);
  });
  return {
    width: Math.max(0, maxX - minX),
    height: height || PERSON_SIZE_STYLE.height,
  };
}

function rankerFor(nodeCount, options) {
  const max = options.maxNetworkSimplexNodes ?? MAX_NETWORK_SIMPLEX_NODES;
  return nodeCount > max ? 'tight-tree' : 'network-simplex';
}

function readXY(nodes, posById) {
  const xy = new Array(nodes.length * 2);
  nodes.forEach((n, i) => {
    const p = posById ? posById.get(n.id()) : n.position();
    xy[2 * i] = p.x;
    xy[2 * i + 1] = p.y;
  });
  return xy;
}

function runDagre(comp, ranker) {
  comp.layout({ name: 'dagre', ...DAGRE_OPTIONS, ranker, animate: false, fit: false }).run();
}

function spouseRecord(node) {
  return {
    id: node.id(),
    label: node.data('label') || '',
    dob: node.data('dob'),
    marriageYear: node.data('marriageYear'),
  };
}

// Lay the component out with each couple collapsed to one supernode, then
// split the supernode into the couple row. Children stay on the next rank
// because their edge leaves the supernode.
//
// The dagre minLen 0 / edgeWeight 100 spike on spouse → marriage edges was
// measured on 2026-11-17 and did not meet couple criteria 1–3 (England height
// drop 15.6%, marriage marks stayed on the next rank). This is the fallback
// the goal specifies. ELK was not added.
function layoutSupernode(comp, ranker) {
  const cy = comp.cy();
  const spousesOf = new Map();
  comp.edges().forEach(e => {
    if (e.target().data('type') !== 'marriage') return;
    const list = spousesOf.get(e.target().id()) || [];
    if (!list.some(n => n.id() === e.source().id())) list.push(e.source());
    spousesOf.set(e.target().id(), list);
  });
  const marriagesOf = new Map();
  spousesOf.forEach((people, mid) => {
    people.forEach(p => {
      const list = marriagesOf.get(p.id()) || [];
      list.push(mid);
      marriagesOf.set(p.id(), list);
    });
  });

  const assigned = new Set();
  const clusters = [];
  const hubIds = [...marriagesOf.keys()].sort((a, b) =>
      marriagesOf.get(b).length - marriagesOf.get(a).length || a.localeCompare(b));

  hubIds.forEach(pid => {
    if (assigned.has(pid)) return;
    const hub = cy.getElementById(pid);
    const kept = [];
    const markOf = new Map();
    const members = [hub];
    const memberIds = new Set([pid]);
    marriagesOf.get(pid).forEach(mid => {
      const others = (spousesOf.get(mid) || []).filter(s => s.id() !== pid);
      if (others.some(s => assigned.has(s.id()))) return;
      kept.push(mid);
      others.forEach(s => {
        markOf.set(s.id(), mid);
        if (!memberIds.has(s.id())) {
          memberIds.add(s.id());
          members.push(s);
        }
      });
    });
    if (!kept.length) return;
    assigned.add(pid);
    members.forEach(n => { if (n.id() !== pid) assigned.add(n.id()); });
    const ordered = members.filter(n => n.id() !== pid).map(spouseRecord).sort(compareSpouses);
    const placed = coupleOffsets(pid, ordered.map(s => s.id), markOf);
    kept.forEach(mid => {
      memberIds.add(mid);
      assigned.add(mid);
    });
    // A marriage with no other spouse (a self-link) has no slot in the row.
    // Park it one pitch past the row, then recenter so nothing sits on a person.
    const missing = [...memberIds].filter(id => !placed.offsets.has(id));
    if (missing.length) {
      let edge = Math.max(...placed.offsets.values());
      missing.forEach(id => {
        edge += COUPLE_PITCH;
        placed.offsets.set(id, edge);
      });
      const values = [...placed.offsets.values()];
      const min = Math.min(...values);
      const max = Math.max(...values);
      const center = (min + max) / 2;
      placed.offsets.forEach((v, id) => placed.offsets.set(id, v - center));
      placed.width = max - min + PERSON_SIZE_STYLE.width;
    }
    const box = boxFromOffsets(placed.offsets, (id) => bodySizeOf(cy.getElementById(id)));
    clusters.push({ memberIds, offsets: placed.offsets, width: box.width, height: box.height });
  });

  if (!clusters.length) {
    runDagre(comp, ranker);
    return readXY(comp.nodes());
  }

  const clusterOf = new Map();
  clusters.forEach((c, i) => c.memberIds.forEach(id => clusterOf.set(id, i)));
  const endpoint = (id) => (clusterOf.has(id) ? `cluster:${clusterOf.get(id)}` : id);

  const elements = [];
  comp.nodes().forEach(n => {
    if (clusterOf.has(n.id())) return;
    elements.push({ group: 'nodes', data: { id: n.id(), type: n.data('type'), dob: n.data('dob') } });
  });
  clusters.forEach((c, i) => {
    elements.push({
      group: 'nodes',
      data: { id: `cluster:${i}`, type: 'super', width: c.width, height: c.height },
    });
  });
  const seen = new Set();
  comp.edges().forEach(e => {
    const source = endpoint(e.source().id());
    const target = endpoint(e.target().id());
    if (source === target) return;
    const key = source + '>' + target;
    if (seen.has(key)) return;
    seen.add(key);
    elements.push({ group: 'edges', data: { source, target } });
  });

  const style = [
    ...LAYOUT_STYLE,
    { selector: 'node[type = "super"]', style: { width: 'data(width)', height: 'data(height)' } },
  ];
  const inner = cytoscape({ headless: true, styleEnabled: true, style, elements });
  try {
    runDagre(inner, ranker);
    const pos = new Map();
    inner.nodes().forEach(n => {
      if (n.data('type') === 'super') return;
      pos.set(n.id(), { ...n.position() });
    });
    clusters.forEach((c, i) => {
      const origin = inner.getElementById(`cluster:${i}`).position();
      c.offsets.forEach((dx, id) => pos.set(id, { x: origin.x + dx, y: origin.y }));
    });
    comp.nodes().forEach(n => {
      const p = pos.get(n.id());
      if (!p) throw new Error(`couple layout left ${n.id()} unplaced`);
    });
    return readXY(comp.nodes(), pos);
  } finally {
    inner.destroy();
  }
}

// Lay out one connected component. Returns flat [x0, y0, x1, y1, ...] in the
// component's node order. `couple` is 'off' (plain dagre) or 'supernode'.
function layoutComponent(comp, ranker, couple) {
  if (couple === 'supernode') return layoutSupernode(comp, ranker);
  runDagre(comp, ranker);
  return readXY(comp.nodes());
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

function componentBand(nodes) {
  const counts = new Map();
  nodes.forEach(n => {
    const b = n.data('band');
    if (b == null) return;
    counts.set(b, (counts.get(b) || 0) + 1);
  });
  let best = null;
  let n = -1;
  counts.forEach((c, b) => {
    if (c > n) { best = b; n = c; }
  });
  return best;
}

function componentKey(comp, ranker, couple) {
  const parts = [couple, ranker];
  comp.nodes().forEach(n => parts.push(
    n.id() + (n.data('type') === 'marriage' ? '*' : '') + (n.data('monarch') ? 'M' : ''),
  ));
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
 * @param {object} [options] { maxNetworkSimplexNodes, couple: 'supernode'|'off' }
 * @returns {{components: Array<{ids: string[], xy: number[], medianYear: number|null, ranker: string, cached: boolean, band: number|null}>, ms: number}}
 */
export function layoutGraph(elements, options = {}) {
  const start = Date.now();
  const couple = options.couple || 'supernode';
  const cy = cytoscape({ headless: true, styleEnabled: true, style: LAYOUT_STYLE, elements });
  try {
    const components = cy.elements().components().map(comp => {
      const nodes = comp.nodes();
      const ranker = rankerFor(nodes.length, options);
      const key = componentKey(comp, ranker, couple);
      let xy = componentCache.get(key);
      const cached = Boolean(xy);
      if (cached) {
        componentCache.delete(key); // refresh LRU order
      } else {
        xy = layoutComponent(comp, ranker, couple);
      }
      componentCache.set(key, xy);
      if (componentCache.size > CACHE_LIMIT) {
        componentCache.delete(componentCache.keys().next().value);
      }
      return { ids: nodes.map(n => n.id()), xy, medianYear: medianYear(nodes), ranker, cached, band: componentBand(nodes) };
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
  const infos = result.components.map(({ ids, medianYear: year, band }) => {
    const nodes = cy.collection(ids.map(id => cy.getElementById(id)));
    // Cross-band edges are on the graph for the highlight. Their geometry
    // would stretch this component's box across the other monarchy.
    const comp = nodes.union(nodes.connectedEdges().filter(e =>
        e.data('relation') !== 'succession' && !e.data('crossBand')));
    return { comp, bb: comp.boundingBox(), medianYear: year, band: band ?? null };
  });

  const knownYears = infos.map(i => i.medianYear).filter(y => y != null);
  const refYear = knownYears.length ? Math.min(...knownYears) : 0;

  const bands = new Set(infos.map(i => i.band).filter(b => b != null));
  const splitBands = bands.size > 1;
  // One monarchy: chronological, as before. Several: each monarchy is one
  // contiguous x-band (selection order), chronological inside the band.
  infos.sort((a, b) => {
    if (splitBands && a.band !== b.band) return (a.band ?? 0) - (b.band ?? 0);
    return (a.medianYear ?? Infinity) - (b.medianYear ?? Infinity);
  });

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

// Laid-out width of each band: the x-extent of its nodes' bodies.
export function bandWidths(cy) {
  const acc = new Map();
  cy.nodes().forEach(n => {
    const b = n.data('band');
    if (b == null) return;
    const half = (typeof n.width === 'function' ? n.width() : 0) / 2;
    const x = n.position('x');
    const cur = acc.get(b) || { x1: Infinity, x2: -Infinity };
    cur.x1 = Math.min(cur.x1, x - half);
    cur.x2 = Math.max(cur.x2, x + half);
    acc.set(b, cur);
  });
  const out = new Map();
  acc.forEach((v, b) => out.set(b, v.x2 - v.x1));
  return out;
}

// Drop a succession edge whose endpoints were laid out in different bands,
// or whose x-distance is more than half that monarchy's band width.
export function visibleSuccession(cy, elements, widths) {
  return elements.filter(el => {
    const s = cy.getElementById(el.data.source);
    const t = cy.getElementById(el.data.target);
    if (!s || s.empty() || !t || t.empty()) return false;
    const sb = s.data('band');
    const tb = t.data('band');
    if (sb != null && tb != null && sb !== tb) return false;
    const width = widths.get(el.data.monarchyIndex);
    if (width == null || width <= 0) return true;
    return Math.abs(s.position('x') - t.position('x')) <= width / 2;
  });
}
