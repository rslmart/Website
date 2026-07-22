function getMarriageName(father, mother) {
  return [father, mother].sort().join('');
}

function getMarriageLabel(father, mother) {
  return [father, mother].sort().join(' + ');
}

function extractYear(dateStr) {
  if (!dateStr) return '?';
  // Wikidata timestamps carry a leading sign ("+1650-...", "-2600-..." for BCE),
  // so grab the signed leading integer rather than splitting on '-' (which would
  // strip a BCE year down to an empty token and yield NaN).
  const [datePart] = String(dateStr).split('T');
  const match = datePart.match(/^[+-]?\d+/);
  if (!match) return '?';
  const year = parseInt(match[0], 10);
  if (Number.isNaN(year)) return '?';
  // Astronomical year numbering: year 0 == 1 BCE, -2600 == 2601 BCE.
  return year < 1 ? `${Math.abs(year - 1)} BCE` : `${year}`;
}

function createLabel(person) {
  const birth = extractYear(person['date of birth']) ?? '?';
  const death = extractYear(person['date of death']) ?? '?';
  return `${person.label}\n${birth}-${death}`;
}

// Border color used to flag people who appear in more than one of the selected
// monarchies (i.e. the points where two dynasties connect).
const SHARED_NODE_COLOR = '#ff8c00';

// One {male, female} pair per selected monarchy so several kingdoms can be told
// apart at a glance: males stay in the blue family, females in the red family,
// and each monarchy gets a distinct shade. Indexed by selection order; wraps if
// more monarchies are selected than there are entries.
export const MONARCHY_COLORS = [
  { male: '#2563eb', female: '#dc2626' }, // blue / red
  { male: '#93c5fd', female: '#fca5a5' }, // light blue / light red
  { male: '#1e3a8a', female: '#7f1d1d' }, // navy / maroon
  { male: '#38bdf8', female: '#f472b6' }, // sky / pink
  { male: '#818cf8', female: '#fb7185' }, // indigo / rose
  { male: '#0e7490', female: '#be123c' }, // teal / crimson
];

// Fallback used for marriage-edge strokes (not tied to a specific monarchy).
const SEX_COLORS = { male: 'blue', female: 'red' };

export function monarchyColors(index) {
  return MONARCHY_COLORS[((index % MONARCHY_COLORS.length) + MONARCHY_COLORS.length) % MONARCHY_COLORS.length];
}

// Monarch portraits are pre-fetched from Wikimedia Commons and self-hosted in
// the project's S3 bucket (served via CloudFront at makoa.link), mirroring the
// Hurricane page's IR imagery. The object key is just the person's Wikidata id,
// so the client builds the URL with no manifest; buildMonarchImages.py fetches
// the Commons thumbnail and uploads it as monarchy/<Qid>.jpg. Nodes without an
// uploaded portrait simply fall back to their solid fill color.
const MONARCH_IMAGE_BASE = 'https://makoa.link/monarchy';

export function monarchImageUrl(id) {
  return `${MONARCH_IMAGE_BASE}/${id}.jpg`;
}

// Stroke for succession ("crown passed") edges - a regal gold, distinct from
// the blue/red bloodline palette.
export const SUCCESSION_EDGE_COLOR = '#d4af37';

export function convertToChart(
    data,
    highlightedNodes,
    sharedNodes = new Set(),
    nodeMonarchyIndex = {},
    successionEdges = [],
    showSuccession = false,
) {
  const highlightedNodeSet = new Set(highlightedNodes);
  const nodeSet = new Set();
  const edges = [];
  const nodes = [];

  Object.values(data).forEach(person => {
    // Shared nodes (in 2+ selected monarchies) take precedence so the
    // connection points stand out; then succession members, then everyone else.
    const isShared = sharedNodes.has(person.id);
    const isHighlighted = highlightedNodeSet.has(person.id);
    const sex = person["sex or gender"];
    const palette = monarchyColors(nodeMonarchyIndex[person.id] || 0);
    // Create person node
    const node = {
      ...person,
      type: 'circle',
      size: 80,
      label: createLabel(person),
      labelCfg: { position: "bottom" },
      style: {
        fill: sex ? palette[sex] : undefined,
        stroke: isShared ? SHARED_NODE_COLOR : (isHighlighted ? '#e7e312' : 'black'),
        opacity: (isShared || isHighlighted) ? 1 : 0.9,
        lineWidth: 5
      }
    };

    if (Array.isArray(person.image) && person.image.length > 0) {
      node.icon = {
        img: monarchImageUrl(person.id),
        width: 45,
        height: 70,
        show: true
      };
    }

    nodes.push(node);
    nodeSet.add(node.id); // Track all nodes immediately

    // Process spouses
    if (Array.isArray(person.spouse)) {
      person.spouse.forEach(spouseId => {
        if (!data[spouseId]) return;

        const marriageName = getMarriageName(person.id, spouseId);
        if (!nodeSet.has(marriageName)) {
          const spouse = data[spouseId];
          nodes.push({
            id: marriageName,
            label: getMarriageLabel(person.label, spouse.label),
            type: 'marriage',
          });
          nodeSet.add(marriageName);

          // Add edges once when creating marriage node
          edges.push({
            source: person.id,
            target: marriageName,
            style: { stroke: SEX_COLORS[person["sex or gender"]] }
          });
          edges.push({
            source: spouseId,
            target: marriageName,
            style: { stroke: SEX_COLORS[spouse["sex or gender"]] }
          });
        }
      });
    }

    // Process parents
    const motherId = person.mother;
    const fatherId = person.father;
    const hasMother = motherId && data[motherId];
    const hasFather = fatherId && data[fatherId];

    if (hasMother && hasFather) {
      const marriageName = getMarriageName(motherId, fatherId);
      if (!nodeSet.has(marriageName)) {
        nodes.push({
          id: marriageName,
          label: getMarriageLabel(data[motherId].label, data[fatherId].label),
          type: 'marriage',
        });
        nodeSet.add(marriageName);

        // Add parent edges only once
        edges.push({
          source: motherId,
          target: marriageName,
          style: { stroke: SEX_COLORS.female }
        });
        edges.push({
          source: fatherId,
          target: marriageName,
          style: { stroke: SEX_COLORS.male }
        });
      }
      // Add child edge always
      edges.push({
        source: marriageName,
        target: person.id,
        style: { stroke: 'black' }
      });
    } else if (hasMother) {
      edges.push({
        source: motherId,
        target: person.id,
        style: { stroke: SEX_COLORS.female }
      });
    } else if (hasFather) {
      edges.push({
        source: fatherId,
        target: person.id,
        style: { stroke: SEX_COLORS.male }
      });
    }
  });

  // Sibling links. Only drawn when the pair doesn't already share a displayed
  // parent (otherwise the parent-child edges already connect them); this is what
  // makes sibling-mediated bridges visible when the common parent is missing.
  const siblingSeen = new Set();
  Object.values(data).forEach(person => {
    if (!Array.isArray(person.sibling)) return;
    person.sibling.forEach(sibId => {
      const sib = data[sibId];
      if (!sib) return;
      const key = [person.id, sibId].sort().join('|');
      if (siblingSeen.has(key)) return;
      siblingSeen.add(key);
      const sharesShownParent =
          (person.father && person.father === sib.father && data[person.father]) ||
          (person.mother && person.mother === sib.mother && data[person.mother]);
      if (sharesShownParent) return;
      edges.push({ source: person.id, target: sibId, relation: 'sibling', color: '#aaa' });
    });
  });

  // Final edge validation
  const validEdges = edges.filter(edge =>
      nodeSet.has(edge.source) && nodeSet.has(edge.target)
  );

  let colors = ['#e6194B', '#3cb44b', '#4363d8', '#f58231', '#42d4f4', '#f032e6', '#fabed4', '#469990', '#dcbeff', '#9A6324', '#fffac8', '#800000', '#aaffc3', '#000075', '#a9a9a9', '#000000']
  let familyColors = {}
  edges.forEach(edge => {
    var family = ""
    if (edge.source in data && 'family' in data[edge.source]) {
      family = data[edge.source]['family']
    }
    else if (edge.target in data && 'family' in data[edge.target]) {
      family = data[edge.target]['family']
    }
    if (family) {
      edge['family'] = family
      if (family in familyColors){
        edge['color'] = familyColors[family]
      }
      else {
        let color = colors[Object.keys(familyColors).length % colors.length];
        familyColors[family] = color
        edge['color'] = color
      }
    }
  })

  // Succession overlay: the crown passing from each monarch to the next. Added
  // after the family-color pass so they keep their gold stroke, and tagged so
  // the layout can ignore them (they connect monarchs across bloodlines and
  // would otherwise distort the genealogical ranking).
  if (showSuccession) {
    successionEdges.forEach(edge => {
      if (!nodeSet.has(edge.source) || !nodeSet.has(edge.target)) return;
      validEdges.push({
        source: edge.source,
        target: edge.target,
        relation: 'succession',
        monarchyIndex: edge.monarchyIndex,
        color: SUCCESSION_EDGE_COLOR,
      });
    });
  }

  return { nodes, edges: validEdges };
}

// ---------------------------------------------------------------------------
// Multi-monarchy merge with common-ancestor bridging.
//
// Each monarchy payload carries a compact `nodes` set (succession members +
// their parents) for the single-monarchy view, and optionally a richer
// `extendedNodes` set (the ancestors of its monarchs plus those ancestors'
// siblings, European monarchies only) used purely to reveal where dynasties
// connect when several are viewed together.
//
// When several monarchies are shown together we keep every monarchy's compact
// tree, then splice in ONLY the father/mother/sibling chains that connect those
// trees up to their shared relatives — not the whole neighborhoods — so the
// picture stays compact while the shared ancestry becomes visible.
// ---------------------------------------------------------------------------

// Default bridging knobs. European dynasties share a vast common pedigree, so
// pulling in every shared ancestor floods the view; instead we look only a few
// generations up (maxDepth) and, by default, along blood lines only. The user
// can widen both via the Connections controls.
export const DEFAULT_BRIDGE_OPTIONS = { includeSiblings: false, maxDepth: 2 };

// The relatives of a person we follow when bridging: parents always, and
// siblings only when asked (siblings add lateral links but explode the shared
// set, so they're opt-in).
function relativesOf(person, includeSiblings) {
  const out = [];
  if (person.father) out.push(person.father);
  if (person.mother) out.push(person.mother);
  if (includeSiblings && Array.isArray(person.sibling)) out.push(...person.sibling);
  return out;
}

// Upward closure from the start nodes, capped at maxDepth generations.
function relativeClosure(startIds, pool, includeSiblings, maxDepth) {
  const seen = new Set();
  let frontier = [];
  startIds.forEach(id => {
    if (pool[id] && !seen.has(id)) {
      seen.add(id);
      frontier.push(id);
    }
  });
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next = [];
    frontier.forEach(id => {
      const person = pool[id];
      if (!person) return;
      relativesOf(person, includeSiblings).forEach(rid => {
        if (rid && pool[rid] && !seen.has(rid)) {
          seen.add(rid);
          next.push(rid);
        }
      });
    });
    frontier = next;
  }
  return seen;
}

// Most-recent common ancestors: the first common node met walking up from the
// start nodes (we stop rather than climb the whole shared pedigree above it).
function frontierCommon(startIds, pool, includeSiblings, maxDepth, common) {
  const frontier = new Set();
  const seen = new Set();
  let level = [];
  startIds.forEach(id => {
    if (pool[id] && !seen.has(id)) {
      seen.add(id);
      level.push(id);
    }
  });
  for (let depth = 0; depth < maxDepth && level.length; depth++) {
    const next = [];
    level.forEach(id => {
      const person = pool[id];
      if (!person) return;
      relativesOf(person, includeSiblings).forEach(rid => {
        if (!rid || !pool[rid]) return;
        if (common.has(rid)) {
          frontier.add(rid); // stop: don't climb past a common ancestor
        } else if (!seen.has(rid)) {
          seen.add(rid);
          next.push(rid);
        }
      });
    });
    level = next;
  }
  return frontier;
}

// The chain nodes connecting a monarchy's members up to a frontier ancestor:
// start from the frontier and propagate down through the closure, keeping only
// nodes that actually lie on a member->frontier path (dead-end twigs dropped).
function usefulChainNodes(closure, pool, frontier, includeSiblings) {
  const useful = new Set();
  closure.forEach(id => {
    if (frontier.has(id)) useful.add(id);
  });
  let changed = true;
  while (changed) {
    changed = false;
    closure.forEach(id => {
      if (useful.has(id)) return;
      const person = pool[id];
      if (!person) return;
      if (relativesOf(person, includeSiblings).some(rid => useful.has(rid))) {
        useful.add(id);
        changed = true;
      }
    });
  }
  return useful;
}

function personListFrom(entries) {
  return entries
      .filter(([, person]) => person && person.label)
      .map(([qid, person]) => ({ id: person.id || qid, label: person.label }))
      .sort((a, b) => a.label.localeCompare(b.label));
}

// Merge several monarchy payloads into a single displayable graph. Returns the
// display `data`, highlight/shared sets, per-node monarchy index (for shading),
// counts, and search lists. Single-monarchy input reduces to the original
// compact behavior.
export function mergeMonarchies(payloads, selected, bridgeOptions = DEFAULT_BRIDGE_OPTIONS) {
  const includeSiblings = bridgeOptions.includeSiblings ?? DEFAULT_BRIDGE_OPTIONS.includeSiblings;
  const maxDepth = bridgeOptions.maxDepth ?? DEFAULT_BRIDGE_OPTIONS.maxDepth;
  const data = {};
  const membership = {};
  const nodeMonarchyIndex = {};
  const highlightedNodes = [];
  const highlightSet = new Set();

  // 1) Base: each monarchy's compact node set (unchanged behavior).
  payloads.forEach((payload, idx) => {
    const monarchy = selected[idx];
    Object.entries(payload.nodes || {}).forEach(([qid, person]) => {
      data[qid] = person;
      (membership[qid] = membership[qid] || new Set()).add(monarchy);
      if (!(qid in nodeMonarchyIndex)) nodeMonarchyIndex[qid] = idx;
    });
    (payload.monarchList || []).forEach(qid => {
      if (!highlightSet.has(qid)) {
        highlightSet.add(qid);
        highlightedNodes.push(qid);
      }
    });
  });

  const memberCounts = payloads.map(p => Object.keys(p.nodes || {}).length);
  const sharedNodes = new Set(
      Object.keys(membership).filter(qid => membership[qid].size > 1)
  );

  // 2) Multi-monarchy: bridge the trees through their most-recent common
  // ancestors only. We look up to `maxDepth` generations (optionally along
  // siblings), find the shared ancestors, then keep just the chains connecting
  // each monarchy's members up to the *first* shared ancestor reached - not the
  // entire shared pedigree above it, which would swamp the view.
  if (selected.length > 1) {
    const pools = payloads.map(p => ({ ...(p.nodes || {}), ...(p.extendedNodes || {}) }));
    const allPool = {};
    pools.forEach(pool => Object.assign(allPool, pool));

    const closures = payloads.map((p, idx) =>
        relativeClosure(Object.keys(p.nodes || {}), pools[idx], includeSiblings, maxDepth));

    const closureCount = {};
    closures.forEach(set => set.forEach(qid => {
      closureCount[qid] = (closureCount[qid] || 0) + 1;
    }));
    const commonNodes = new Set(
        Object.keys(closureCount).filter(qid => closureCount[qid] >= 2)
    );

    if (commonNodes.size > 0) {
      const frontier = new Set();
      payloads.forEach((p, idx) => {
        frontierCommon(Object.keys(p.nodes || {}), pools[idx], includeSiblings, maxDepth, commonNodes)
            .forEach(qid => frontier.add(qid));
      });

      closures.forEach((closure, idx) => {
        usefulChainNodes(closure, allPool, frontier, includeSiblings).forEach(qid => {
          const person = allPool[qid];
          if (!person) return;
          if (!(qid in data)) data[qid] = person;
          if (!(qid in nodeMonarchyIndex)) nodeMonarchyIndex[qid] = idx;
        });
      });
      frontier.forEach(qid => {
        if (qid in data) sharedNodes.add(qid);
      });
    }
  }

  // Succession: monarchList is already in succession order (built by walking
  // Wikidata predecessor/successor chains). For each monarchy we keep the
  // monarchs present in the display and emit an edge between each consecutive
  // pair - the "crown passed from X to Y" transfer, independent of bloodline.
  const monarchOrder = [];
  const successionEdges = [];
  payloads.forEach((payload, idx) => {
    const ordered = (payload.monarchList || [])
        .filter(qid => qid in data)
        .map(qid => ({ id: qid, label: data[qid].label }));
    monarchOrder.push({ monarchy: selected[idx], index: idx, monarchs: ordered });
    for (let i = 0; i + 1 < ordered.length; i++) {
      successionEdges.push({
        source: ordered[i].id,
        target: ordered[i + 1].id,
        monarchyIndex: idx,
        monarchy: selected[idx],
      });
    }
  });

  // Which monarchies each displayed person belongs to. Used to explain a shared
  // node (member of several) when it's clicked.
  const membershipOut = {};
  Object.keys(membership).forEach(qid => {
    membershipOut[qid] = Array.from(membership[qid]);
  });

  return {
    data,
    highlightedNodes,
    sharedNodes,
    nodeMonarchyIndex,
    memberCounts,
    sharedCount: sharedNodes.size,
    monarchOrder,
    successionEdges,
    membership: membershipOut,
    peopleList: personListFrom(Object.entries(data)),
    sharedList: personListFrom(Array.from(sharedNodes).map(qid => [qid, data[qid]])),
  };
}
