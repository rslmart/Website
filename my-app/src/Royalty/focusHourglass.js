// Person focus: a compact hourglass laid out in the entitree-flex style
// (ancestors above, descendants below, spouses as side nodes) and drawn by
// Cytoscape's preset layout. Repeated ancestors are linked: one node per
// person id, with every path that reaches them kept as edges. Nothing here
// reads or writes the URL.
//
// The focused person itself is the React state key `focusedPersonId`.

export const FOCUS_STATE_KEY = 'focusedPersonId';
export const DEFAULT_FOCUS_UP = 3;
export const DEFAULT_FOCUS_DOWN = 2;
export const FOCUS_FONT = 16;
export const MIN_LABEL_PX = 10;
export const MAX_LABEL_LINES = 4;
const MONARCH_MARK = '♔';

export function focusNodeStyle() {
  return {
    // Class plus attribute, so this beats the monarch size and label rules.
    selector: 'node.focus-on[focusLabel]',
    style: {
      label: 'data(focusLabel)',
      'font-size': FOCUS_FONT,
      'min-zoomed-font-size': 0,
      'text-max-width': 'data(focusMaxWidth)',
      'text-valign': 'bottom',
      'text-wrap': 'wrap',
      'text-margin-y': 4,
      width: 'data(focusWidth)',
      height: 'data(focusHeight)',
      padding: '0px',
    },
  };
}

export function personPool(payloads) {
  const pool = {};
  for (const payload of payloads || []) {
    for (const source of [payload?.nodes, payload?.extendedNodes]) {
      if (!source) continue;
      for (const [qid, person] of Object.entries(source)) {
        if (!person || typeof person !== 'object') continue;
        const id = person.id || qid;
        if (!pool[id]) pool[id] = { ...person, id };
      }
    }
  }
  return pool;
}

function parentIds(person, pool) {
  if (!person) return [];
  const out = [];
  if (person.father && pool[person.father]) out.push(person.father);
  if (person.mother && pool[person.mother] && person.mother !== person.father) out.push(person.mother);
  return out;
}

function childIds(person, pool) {
  if (!person || !Array.isArray(person.child)) return [];
  const out = [];
  const seen = new Set();
  for (const id of person.child) {
    if (!id || seen.has(id) || !pool[id]) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function spouseIds(person, pool) {
  if (!person || !Array.isArray(person.spouse)) return [];
  const out = [];
  const seen = new Set();
  for (const id of person.spouse) {
    if (!id || seen.has(id) || !pool[id]) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function emptyModel(focusId, up, down) {
  return {
    focusId,
    up,
    down,
    people: [],
    generations: {},
    side: [],
    badges: [],
    repeatedIds: [],
    linked: true,
  };
}

// Direct ancestors `up` generations, direct descendants `down` generations,
// plus spouses of those people. `expandedUp` / `expandedDown` add one more
// generation from that person only (the +k control). Off-path siblings stay
// out until a badge or the stepper asks for them.
export function buildHourglass(pool, focusId, options = {}) {
  const up = options.up ?? DEFAULT_FOCUS_UP;
  const down = options.down ?? DEFAULT_FOCUS_DOWN;
  const expandedUp = options.expandedUp || {};
  const expandedDown = options.expandedDown || {};
  if (!pool?.[focusId]) return emptyModel(focusId, up, down);

  const gen = new Map();
  const repeated = new Set();
  gen.set(focusId, 0);

  const add = (id, g) => {
    if (!id || !pool[id]) return false;
    if (gen.has(id)) {
      if (id !== focusId) repeated.add(id);
      return false;
    }
    gen.set(id, g);
    return true;
  };

  let frontier = [focusId];
  for (let depth = 1; depth <= up; depth += 1) {
    const next = [];
    for (const id of frontier) {
      for (const pid of parentIds(pool[id], pool)) {
        if (add(pid, -depth)) next.push(pid);
      }
    }
    frontier = next;
  }

  frontier = [focusId];
  for (let depth = 1; depth <= down; depth += 1) {
    const next = [];
    for (const id of frontier) {
      for (const cid of childIds(pool[id], pool)) {
        if (add(cid, depth)) next.push(cid);
      }
    }
    frontier = next;
  }

  const bloodBeforeExpand = [...gen.keys()];
  for (const id of bloodBeforeExpand) {
    const g = gen.get(id);
    if (expandedUp[id]) {
      for (const pid of parentIds(pool[id], pool)) add(pid, g - 1);
    }
    if (expandedDown[id]) {
      for (const cid of childIds(pool[id], pool)) add(cid, g + 1);
    }
  }

  const side = new Set();
  for (const id of [...gen.keys()]) {
    const g = gen.get(id);
    for (const sid of spouseIds(pool[id], pool)) {
      if (gen.has(sid)) continue;
      gen.set(sid, g);
      side.add(sid);
    }
  }

  let minGen = Infinity;
  let maxGen = -Infinity;
  for (const [id, g] of gen) {
    if (side.has(id)) continue;
    minGen = Math.min(minGen, g);
    maxGen = Math.max(maxGen, g);
  }

  const badges = [];
  for (const [id, g] of gen) {
    if (side.has(id)) continue;
    const person = pool[id];
    if (g === minGen) {
      const hidden = parentIds(person, pool).filter((pid) => !gen.has(pid));
      if (hidden.length) {
        badges.push({ id, direction: 'up', count: hidden.length, hiddenIds: hidden.sort() });
      }
    }
    if (g === maxGen) {
      const hidden = childIds(person, pool).filter((cid) => !gen.has(cid));
      if (hidden.length) {
        badges.push({ id, direction: 'down', count: hidden.length, hiddenIds: hidden.sort() });
      }
    }
  }
  badges.sort((a, b) => a.id.localeCompare(b.id) || a.direction.localeCompare(b.direction));

  return {
    focusId,
    up,
    down,
    people: [...gen.keys()],
    generations: Object.fromEntries(gen),
    side: [...side],
    badges,
    repeatedIds: [...repeated],
    linked: true,
  };
}

export function wrapLabel(text, charsPerLine, maxLines) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const width = Math.max(1, charsPerLine);
  const limit = Math.max(1, maxLines);
  if (!clean) return '';
  const words = [];
  for (const word of clean.split(' ')) {
    if (word.length <= width) words.push(word);
    else {
      for (let i = 0; i < word.length; i += width) words.push(word.slice(i, i + width));
    }
  }
  const lines = [];
  let cur = '';
  let index = 0;
  while (index < words.length && lines.length < limit) {
    const word = words[index];
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= width) {
      cur = next;
      index += 1;
      continue;
    }
    if (cur) {
      lines.push(cur);
      cur = '';
      continue;
    }
    lines.push(word.slice(0, width));
    index += 1;
  }
  if (cur && lines.length < limit) lines.push(cur);
  const truncated = index < words.length;
  if (truncated && lines.length) {
    const room = Math.max(1, width - 1);
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, room)}…`;
  }
  return lines.slice(0, limit).join('\n');
}

export function personFocusLabel(person, { monarch = false, charsPerLine = 12, maxLines = MAX_LABEL_LINES } = {}) {
  const name = String(person?.label || person?.id || '').split('\n')[0];
  const text = monarch ? `${MONARCH_MARK} ${name}` : name;
  return wrapLabel(text, charsPerLine, maxLines);
}

export function applyFocusFields(data, person, layout, monarch) {
  data.focusLabel = personFocusLabel(person, {
    monarch,
    charsPerLine: layout.charsPerLine,
    maxLines: layout.maxLines,
  });
  data.focusMaxWidth = layout.labelWidth;
  data.focusWidth = layout.nodeW;
  data.focusHeight = layout.nodeH;
}

function modelBudget(usable) {
  const minZoom = MIN_LABEL_PX / FOCUS_FONT;
  const badgeBand = 40;
  return {
    minZoom,
    maxW: (usable.w * 0.96) / minZoom,
    maxH: (Math.max(1, usable.h - badgeBand) * 0.96) / minZoom,
  };
}

// Slot layout, then a scale that keeps the default hourglass inside `usable`
// at a zoom where FOCUS_FONT is still at least MIN_LABEL_PX on screen.
export function layoutHourglass(pool, model, usable) {
  const generations = model.generations || {};
  const side = new Set(model.side || []);
  const genOf = (id) => generations[id];
  const positions = new Map();
  const empty = {
    positions,
    nodeW: 36,
    nodeH: 40,
    labelWidth: 48,
    charsPerLine: 8,
    maxLines: MAX_LABEL_LINES,
    font: FOCUS_FONT,
    pitchX: 48,
    pitchY: 80,
  };
  if (!pool?.[model.focusId] || !model.people?.length) return empty;

  const unitIds = (id) => {
    const spouses = spouseIds(pool[id], pool)
      .filter((sid) => side.has(sid) && genOf(sid) === genOf(id))
      .sort((a, b) => String(pool[a].label || a).localeCompare(String(pool[b].label || b)));
    const leftCount = Math.floor(spouses.length / 2);
    return [...spouses.slice(0, leftCount), id, ...spouses.slice(leftCount)];
  };
  const bloodParents = (id) => {
    const g = genOf(id);
    return parentIds(pool[id], pool).filter((pid) => genOf(pid) === g - 1 && !side.has(pid));
  };
  const bloodKids = (id) => {
    const g = genOf(id);
    return childIds(pool[id], pool)
      .filter((cid) => genOf(cid) === g + 1 && !side.has(cid))
      .sort((a, b) => String(pool[a].label || a).localeCompare(String(pool[b].label || b)));
  };

  const descW = new Map();
  const computeDesc = (id) => {
    if (descW.has(id)) return 0;
    descW.set(id, unitIds(id).length);
    let childW = 0;
    for (const kid of bloodKids(id)) childW += computeDesc(kid);
    const w = Math.max(unitIds(id).length, childW);
    descW.set(id, w);
    return w;
  };
  const ancW = new Map();
  const computeAnc = (id) => {
    if (ancW.has(id)) return 0;
    ancW.set(id, unitIds(id).length);
    let parentW = 0;
    for (const pid of bloodParents(id)) parentW += computeAnc(pid);
    const w = Math.max(unitIds(id).length, parentW);
    ancW.set(id, w);
    return w;
  };

  computeDesc(model.focusId);
  computeAnc(model.focusId);

  const placeUnit = (id, centerX, y) => {
    const ids = unitIds(id);
    const mid = (ids.length - 1) / 2;
    ids.forEach((uid, i) => {
      positions.set(uid, { x: centerX + (i - mid), y });
    });
  };

  const placedD = new Set();
  const placeDesc = (id, left) => {
    if (placedD.has(id)) return;
    placedD.add(id);
    const w = descW.get(id) || 1;
    placeUnit(id, left + w / 2, genOf(id));
    const kids = bloodKids(id).filter((kid) => !placedD.has(kid));
    let kidsW = 0;
    for (const kid of kids) kidsW += descW.get(kid) || 0;
    let x = left + (w - kidsW) / 2;
    for (const kid of kids) {
      placeDesc(kid, x);
      x += descW.get(kid) || 0;
    }
  };
  placeDesc(model.focusId, -((descW.get(model.focusId) || 1) / 2));

  const placedA = new Set([model.focusId]);
  const placeAnc = (id, left) => {
    if (placedA.has(id)) return;
    placedA.add(id);
    const w = ancW.get(id) || 1;
    const center = left + w / 2;
    placeUnit(id, center, genOf(id));
    const pars = bloodParents(id).filter((pid) => !placedA.has(pid));
    let parsW = 0;
    for (const pid of pars) parsW += ancW.get(pid) || 0;
    const px = positions.get(id)?.x ?? center;
    let x = px - parsW / 2;
    for (const pid of pars) {
      placeAnc(pid, x);
      x += ancW.get(pid) || 0;
    }
  };
  {
    const pars = bloodParents(model.focusId).filter((pid) => !placedA.has(pid));
    let parsW = 0;
    for (const pid of pars) parsW += ancW.get(pid) || 0;
    const px = positions.get(model.focusId)?.x ?? 0;
    let x = px - parsW / 2;
    for (const pid of pars) {
      placeAnc(pid, x);
      x += ancW.get(pid) || 0;
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of positions.values()) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 0;
    minY = 0;
    maxY = 0;
  }

  const budget = modelBudget(usable || { x: 0, y: 0, w: 360, h: 640 });
  const gaps = Math.max(0, maxX - minX);
  const pitchX = Math.min(88, budget.maxW / Math.max(gaps + 1, 1));
  const nodeW = Math.min(48, Math.max(24, pitchX - 18));
  const nodeH = Math.min(52, Math.max(28, Math.round(nodeW * 1.05)));
  // 16px "Henry" is about 43px wide, so a column just under the pitch keeps
  // that word on one line. The 9px estimate matches that measurement.
  const labelWidth = Math.max(28, pitchX - 2);
  const charsPerLine = Math.max(3, Math.floor(labelWidth / 9));
  const maxLines = MAX_LABEL_LINES;
  let lines = 1;
  for (const id of positions.keys()) {
    const text = personFocusLabel(pool[id], { monarch: true, charsPerLine, maxLines });
    lines = Math.max(lines, text.split('\n').length);
  }
  const labelH = lines * FOCUS_FONT * 1.35 + 10;
  const rowGaps = Math.max(0, maxY - minY);
  const naturalPitch = nodeH + labelH + 8;
  const maxPitch = rowGaps === 0 ? naturalPitch : (budget.maxH - nodeH - labelH) / rowGaps;
  const pitchY = Math.max(nodeH * 0.75, Math.min(naturalPitch, Math.max(nodeH * 0.75, maxPitch)));

  const scaled = new Map();
  for (const [id, point] of positions) {
    scaled.set(id, { x: point.x * pitchX, y: point.y * pitchY });
  }
  return {
    positions: scaled,
    nodeW,
    nodeH,
    labelWidth,
    charsPerLine,
    maxLines,
    font: FOCUS_FONT,
    pitchX,
    pitchY,
  };
}

// Marriage dots sit on the same row as the couple, halfway between them.
export function placeMarriageNodes(positions, nodes, edges) {
  const marriages = new Set((nodes || []).filter((node) => node.type === 'marriage').map((node) => node.id));
  const incoming = new Map();
  for (const edge of edges || []) {
    if (!marriages.has(edge.target) || !positions.has(edge.source)) continue;
    const list = incoming.get(edge.target) || [];
    list.push(edge.source);
    incoming.set(edge.target, list);
  }
  for (const [id, sources] of incoming) {
    const pts = sources.map((source) => positions.get(source)).filter(Boolean);
    if (!pts.length) continue;
    positions.set(id, {
      x: pts.reduce((sum, point) => sum + point.x, 0) / pts.length,
      y: pts.reduce((sum, point) => sum + point.y, 0) / pts.length,
    });
  }
  return positions;
}

// Room for the title, the depth stepper and the zoom bar. The hourglass is
// fitted into this rect so it stays inside the viewport.
export function usableFocusViewport(width, height, { mobile = false } = {}) {
  const top = mobile ? 136 : 108;
  const bottom = mobile ? 92 : 76;
  const side = 10;
  return {
    x: side,
    y: top,
    w: Math.max(80, width - side * 2),
    h: Math.max(80, height - top - bottom),
  };
}

// Leaves a band above the nodes for the +k badges, which sit on the canvas
// just over the top row and are not part of the Cytoscape bounding box.
export function fitHourglassViewport(bounds, usable) {
  const padX = 10;
  const padY = 8;
  const badgeBand = 40;
  const bw = Math.max(bounds.w || 0, 1) + padX * 2;
  const bh = Math.max(bounds.h || 0, 1) + padY * 2;
  const viewH = Math.max(1, usable.h - badgeBand);
  const zoom = Math.min(usable.w / bw, viewH / bh);
  const cx = ((bounds.x1 ?? 0) + (bounds.x2 ?? 0)) / 2;
  const cy = ((bounds.y1 ?? 0) + (bounds.y2 ?? 0)) / 2;
  return {
    zoom,
    pan: {
      x: usable.x + usable.w / 2 - zoom * cx,
      y: usable.y + badgeBand + viewH / 2 - zoom * cy,
    },
  };
}

export function rememberView(stack, view) {
  return [...(stack || []), {
    zoom: view.zoom,
    pan: { x: view.pan.x, y: view.pan.y },
  }];
}

export function restoreView(stack) {
  const current = stack || [];
  if (!current.length) return { stack: [], view: null };
  const view = current[current.length - 1];
  return {
    stack: current.slice(0, -1),
    view: { zoom: view.zoom, pan: { x: view.pan.x, y: view.pan.y } },
  };
}
