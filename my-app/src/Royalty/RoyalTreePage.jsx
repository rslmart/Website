import React, { Component } from 'react';
import cytoscape from 'cytoscape';
import FilterPanel from "./filter-panel";
import SearchPanel from "./SearchPanel";
import NodeToolTip from "./NodeToolTip";
import HelpPanel from "./help-panel";
import CapWarningDialog from "./CapWarningDialog";
import HomeButton from "../components/HomeButton";
import ControlsFab from "../components/ControlsFab";
import MobileDrawer from "../components/MobileDrawer";
import { withViewport } from "../hooks/useViewport";
import { convertToChart, mergeMonarchies, DEFAULT_BRIDGE_OPTIONS, DEFAULT_VISIBLE_RANKS } from './RoyalTreeUtils';
import SuccessionRail from './SuccessionRail';
import { buildReignLanes, railCollapsedForWidth, sharedDomain } from './reignBars';
import {
  DEFAULT_FOCUS_DOWN,
  DEFAULT_FOCUS_UP,
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
import { PERSON_SIZE_STYLE, MARRIAGE_SIZE_STYLE, MONARCH_SIZE_STYLE, toLayoutElements, packComponents, positionsById, assignLayoutBands, bandWidths, visibleSuccession } from './royalTreeLayout';
import { requestLayout, terminateLayoutWorker } from './layoutClient';
import {
  DEFAULT_MIN_ZOOM,
  EDGE_LABEL_FONT,
  MONARCH_LABEL_FONT,
  NON_MONARCH_FONT,
  ZOOM_STEP,
  defaultZoomLevel,
  monarchShortLabel,
  zoomTier,
} from './zoomTier';
import './RoyalTreeStyle.css';

// Constants
const EMPTY_NODE = { id: '' };
const DEFAULT_MONARCHY = "England";
const HELP_SEEN_KEY = "royaltyHelpSeen";
// Views with more people than this ask before laying out: the layout takes a
// few seconds and panning gets heavier. 9 monarchies at the default look-back
// (2 generations) are 1,627 people; at 5 generations 2,709.
export const NODE_CAP = 2000;
// Performance marks (royaltree:<phase>) for profiling in DevTools/Playwright.
let lastMark = null;
function mark(phase) {
  if (typeof performance === 'undefined' || !performance.mark) return;
  const now = performance.now();
  if (lastMark) performance.measure('royaltree:' + lastMark.phase, { start: lastMark.t, end: now });
  lastMark = phase ? { phase, t: now } : null;
}
// Run fn over consecutive slices of items (an array or Cytoscape collection),
// yielding to the event loop whenever a task has run for SLICE_BUDGET_MS.
// Resolves false if stale() turned true (superseded).
const SLICE_SIZE = 150;
const SLICE_BUDGET_MS = 40;
const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));
async function inSlices(items, fn, stale) {
  let taskStart = performance.now();
  for (let i = 0; i < items.length; i += SLICE_SIZE) {
    fn(items.slice(i, i + SLICE_SIZE));
    if (performance.now() - taskStart > SLICE_BUDGET_MS) {
      await nextTask();
      if (stale()) return false;
      taskStart = performance.now();
    }
  }
  return true;
}

// Viewport that fits a layoutGraph result's raw node positions (before
// packing; labels approximated by a margin) into a w x h canvas.
function roughFit(layout, w, h) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  layout.components.forEach(({ xy }) => {
    for (let i = 0; i < xy.length; i += 2) {
      x1 = Math.min(x1, xy[i]); x2 = Math.max(x2, xy[i]);
      y1 = Math.min(y1, xy[i + 1]); y2 = Math.max(y2, xy[i + 1]);
    }
  });
  const margin = 100;
  const bw = x2 - x1 + 2 * margin;
  const bh = y2 - y1 + 2 * margin;
  const zoom = Math.max(1e-3, Math.min((w - 80) / bw, (h - 80) / bh));
  return {
    zoom,
    pan: { x: w / 2 - zoom * (x1 + x2) / 2, y: h / 2 - zoom * (y1 + y2) / 2 },
  };
}

const SUCCESSION_SELECTOR = 'edge[relation = "succession"]';

// Per-monarchy data is baked into gzipped JSON under public/royalty/ by
// src/Royalty/Data/SplitDataForFrontend.py and fetched on demand, so the
// multi-megabyte combined dataset never enters the JS bundle. Mirrors the
// Hurricane component's approach to large data.
const royaltyUrl = (path) => process.env.PUBLIC_URL + '/royalty/' + path;

const loadGzipJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url} (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Decompress ourselves unless the server already did (Content-Encoding).
  // Gzip magic bytes are 0x1f 0x8b.
  const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  let text;
  if (isGzip && typeof DecompressionStream !== "undefined") {
    const stream = new Response(buffer).body.pipeThrough(new DecompressionStream("gzip"));
    text = await new Response(stream).text();
  } else {
    text = new TextDecoder().decode(bytes);
  }
  return JSON.parse(text);
};

class RoyalTree extends Component {
  constructor(props) {
    super(props);
    this.containerRef = React.createRef();
    this.cy = null;
    this.loadToken = 0;
    // Cached fetched payloads + selection so the bridging knobs can re-merge
    // without re-downloading anything.
    this.loadedPayloads = [];
    this.loadedSelected = [];
    // What the graph currently shows, so a declined node-cap warning can put
    // the controls back. capAccepted: largest view the user agreed to show.
    this.rendered = null;
    this.capAccepted = 0;
    this.renderToken = 0;
    this.shownToken = 0; // renderToken of the view currently drawn
    // Succession overlay edges for the current view, added or removed on toggle
    // without touching the layout.
    this.successionElements = [];
    // Current zoom tier. applyZoomTier is the only place that changes it.
    this.zoomTierName = 'overview';
    this.tierSwitches = [];
    // Zoom and pan to restore when Back leaves focus. The focused person
    // itself lives in state.focusedPersonId, not in the URL.
    this.focusBackStack = [];
    this.treeSnapshot = null;
    this.badgeLayerRef = React.createRef();

    this.state = {
      selectedMonarchs: [DEFAULT_MONARCHY],
      monarchyOptions: [],
      houseOptions: [],
      bridgeOptions: DEFAULT_BRIDGE_OPTIONS,
      rankOptions: { visibleRanks: DEFAULT_VISIBLE_RANKS },
      showSuccession: true,
      data: {},
      highlightedNodes: [],
      sharedNodes: new Set(),
      memberFlag: new Set(),
      memberCounts: [],
      sharedCount: 0,
      peopleList: [],
      sharedList: [],
      monarchOrder: [],
      successionEdges: [],
      membership: {},
      sharedInfo: null,
      rootId: '',
      selectedNode: EMPTY_NODE,
      showNodeToolTip: false,
      tooltipPinned: false,
      focusedPersonId: null,
      focusUp: DEFAULT_FOCUS_UP,
      focusDown: DEFAULT_FOCUS_DOWN,
      focusExpandedUp: {},
      focusExpandedDown: {},
      focusBadges: [],
      controlsDrawerOpen: false,
      helpOpen: (() => {
        try {
          return !window.localStorage.getItem(HELP_SEEN_KEY);
        } catch (e) {
          return true;
        }
      })(),
      loading: true,
      layingOut: 0,
      capWarning: null,
      error: null,
      viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1440,
      railManualCollapsed: null,
      railHighlightId: null,
    };
  }

  isRailCollapsed(state = this.state) {
    return railCollapsedForWidth(state.viewportWidth, state.railManualCollapsed);
  }

  toggleRail = () => {
    this.setState((state) => ({ railManualCollapsed: !this.isRailCollapsed(state) }));
  };

  bindGraphEvents = (cyInstance) => {
    cyInstance.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      if (node.data('type') === 'marriage') return;
      // A click pins the details so the Focus button can be reached. Hover
      // still previews, and does not replace a pinned person.
      if (this.state.tooltipPinned) return;
      this.setState({
        showNodeToolTip: true,
        tooltipData: node.data(),
      });
    });

    cyInstance.on('mouseout', 'node', () => {
      // A tap on a phone also emits mouseout as the finger lifts. Keep the
      // sheet up; desktop hover still dismisses when the pointer leaves.
      if (this.props.viewport && this.props.viewport.isMobile) return;
      if (this.state.tooltipPinned) return;
      this.setState({showNodeToolTip: false});
    });

    // Tap (and click) opens the person's details. It does not focus them.
    // A shared person also highlights the bloodline, which is what a tap did before.
    cyInstance.on('tap', 'node', (evt) => {
      const node = evt.target;
      if (node.data('type') !== 'marriage') {
        this.setState(
          { showNodeToolTip: true, tooltipData: node.data(), tooltipPinned: true, railHighlightId: node.id() },
          () => this.panNodeAboveSheet(node),
        );
      }
      this.highlightSharedLineage(node);
    });

    cyInstance.on('mouseover', 'edge', (evt) => {
      evt.target.addClass('hover');
    });
    cyInstance.on('mouseout', 'edge', (evt) => {
      evt.target.removeClass('hover');
    });

    cyInstance.on('zoom', this.applyZoomTier);
    cyInstance.on('pan', this.onPan);

    // Tapping the background clears zoom/pan tooltip and any lineage highlight.
    cyInstance.on('tapstart', (evt) => {
      if (evt.target === cyInstance) {
        this.setState({ showNodeToolTip: false, tooltipPinned: false });
        this.clearLineage();
      }
    });

    cyInstance.on('drag', 'node', () => {
      this.setState({ showNodeToolTip: false, tooltipPinned: false });
    });
  };

  // When a shared node is clicked, dim the graph and light up the shortest
  // bloodline path from that person down to the nearest monarch of each
  // monarchy they connect - i.e. exactly how the dynasties are linked through
  // them. Non-shared clicks just clear the highlight.
  highlightSharedLineage = (node) => {
    const cy = this.cy;
    if (!cy) return;
    const id = node.id();
    const membership = this.state.membership || {};
    const monarchyList = membership[id] || [];
    const isShared = this.state.sharedNodes.has(id) || monarchyList.length > 1;

    this.clearLineage();
    if (!isShared) return;

    // Shortest paths over bloodline edges only (ignore the succession overlay).
    const genealogy = cy.elements().filter(el => el.isNode() || el.data('relation') !== 'succession');
    const dijkstra = genealogy.dijkstra({ root: node, directed: false });

    let highlight = cy.collection().union(node);
    const connected = [];
    this.state.monarchOrder.forEach(({ monarchy, monarchs }) => {
      let best = null;
      let bestDist = Infinity;
      monarchs.forEach(({ id: memberId }) => {
        if (memberId === id) { best = node; bestDist = 0; return; }
        const memberNode = cy.getElementById(memberId);
        if (!memberNode || memberNode.empty()) return;
        const dist = dijkstra.distanceTo(memberNode);
        if (dist < bestDist) { bestDist = dist; best = memberNode; }
      });
      if (best && bestDist !== Infinity) {
        connected.push(monarchy);
        highlight = highlight.union(dijkstra.pathTo(best));
      }
    });

    if (connected.length < 2) return; // Nothing meaningful to show.

    cy.elements().addClass('faded');
    highlight.removeClass('faded').addClass('lineage');
    this.setState({
      sharedInfo: { label: node.data('label'), monarchies: connected },
    });
  };

  clearLineage = () => {
    if (this.cy) {
      this.cy.elements().removeClass('faded lineage');
    }
    if (this.state.sharedInfo) {
      this.setState({ sharedInfo: null });
    }
  };

  initializeGraph = (containerEl) => {
    const cy = cytoscape({
      container: containerEl,
      style: [
        {
          selector: 'node',
          style: {
            // Size properties are shared with the layout worker (dagre lays out
            // each node's outer box), so keep them in royalTreeLayout.js.
            ...PERSON_SIZE_STYLE,
            'shape': 'rectangle',
            // Empty until the detail tier adds lod-detail. A zoom threshold
            // would also see the device pixel ratio, so a retina phone could
            // show relative names at the overview zoom.
            'label': '',
            'font-size': NON_MONARCH_FONT,
            'min-zoomed-font-size': 0,
            'text-valign': 'bottom',
            'text-wrap': 'wrap',
            'text-max-width': 120,
            'text-margin-y': 5,
            'background-color': 'data(color)',
            'border-color': 'data(borderColor)',
            'border-width': 5,
            'opacity': 'data(opacity)',
          }
        },
        {
          // Larger ellipse plus a short reign label. Fills, border colours
          // and opacities are untouched; the crown glyph is part of the label.
          selector: 'node[?monarch]',
          style: {
            ...MONARCH_SIZE_STYLE,
            'shape': 'ellipse',
            'label': 'data(shortLabel)',
            'font-size': MONARCH_LABEL_FONT,
            'min-zoomed-font-size': 1,
            'text-max-width': 150,
          }
        },
        {
          // Mid: monarchs use the full birth-death label. Detail: every person does.
          selector: 'node[?monarch].lod-mid, node.lod-detail',
          style: {
            'label': 'data(label)',
          }
        },
        {
          // Portraits appear at mid for monarchs and at detail for everyone
          // who has one. The selector requires `image`, so nodes without a
          // portrait are not given an empty image mapping.
          selector: 'node[image].lod-mid, node[image].lod-detail',
          style: {
            'background-image': 'data(image)',
            'background-fit': 'none',
            'background-width': '85%',
            'background-height': '85%',
            'background-position-x': '50%',
            'background-position-y': '50%',
            // Portraits are served from makoa.link without CORS headers. Cytoscape
            // draws node images to a canvas and, by default, requests them with
            // crossorigin="anonymous", which makes non-CORS images fail to render.
            // Loading without the crossorigin attribute lets them draw (the canvas
            // is tainted, but we never read its pixels back).
            'background-image-crossorigin': 'null',
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'label': '',
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'text-rotation': 'autorotate',
            'text-max-width': '5',
            'text-wrap': 'wrap',
            'font-size': EDGE_LABEL_FONT,
            'min-zoomed-font-size': 0,
          }
        },
        {
          // House names: the detail tier, or the one edge under the pointer.
          selector: 'edge.lod-detail, edge.hover',
          style: { 'label': 'data(family)' }
        },
        {
          // Sibling links: dashed, no arrowhead, so they read as lateral ties
          // rather than parent/child descent.
          selector: 'edge[relation = "sibling"]',
          style: {
            'width': 1,
            'line-color': '#aaa',
            'line-style': 'dashed',
            'target-arrow-shape': 'none',
            'label': '',
          }
        },
        {
          selector: 'node[type = "marriage"]',
          style: {
            ...MARRIAGE_SIZE_STYLE,
            'shape': 'circle',
            'background-color': '#888',
            'border-color': '#666',
            'label': ''  // Ensure no label
          }
        },
        {
          // Applied transiently when a person is found via search or the shared
          // stepper, so the zoom target is unmistakable. Opacity 1 wins over
          // .faded (higher specificity), so a search result stays visible.
          selector: 'node.searched',
          style: {
            'border-color': '#00e5ff',
            'border-width': 12,
            'opacity': 1,
            'z-index': 9,
          }
        },
        {
          // Succession ("crown passed") edges: gold, bowed out so they read as a
          // separate overlay from the genealogy edges they run alongside.
          selector: 'edge[relation = "succession"]',
          style: {
            'width': 3,
            'line-color': 'data(color)',
            'line-style': 'dashed',
            'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'unbundled-bezier',
            'control-point-distances': [40],
            'control-point-weights': [0.5],
            'label': '',
            'opacity': 0.9,
            'z-index': 2,
          }
        },
        {
          // Genealogy edges that join two monarchy bands stay on the graph so
          // the shared-person highlight can walk them, but they are not drawn
          // until that path is selected.
          selector: 'edge.cross-band',
          style: { 'display': 'none' }
        },
        {
          // Dim everything except the lineage highlighted when a shared node is
          // clicked (see highlightSharedLineage).
          selector: '.faded',
          style: { 'opacity': 0.1 }
        },
        {
          selector: 'node.lineage',
          style: { 'opacity': 1, 'border-color': '#00b894', 'border-width': 10 }
        },
        {
          selector: 'edge.lineage',
          style: {
            'opacity': 1,
            'width': 4,
            'line-color': '#00b894',
            'target-arrow-color': '#00b894',
            'z-index': 4,
          }
        },
        {
          // The cross-band rule hides the edge; the highlight draws only the
          // path dijkstra already returned.
          selector: 'edge.cross-band.lineage',
          style: {
            'display': 'element',
            'opacity': 1,
            'width': 4,
            'line-color': '#00b894',
            'target-arrow-color': '#00b894',
            'z-index': 4,
          }
        },
        focusNodeStyle(),
      ],
      textureOnViewport: false,
      hideEdgesOnViewport: false,
      hideLabelsOnViewport: false
    });

    this.bindGraphEvents(cy);

    return cy;
  };

  // Put a laid-out view on the canvas: replace the elements, place them from
  // the layout result, pack components and fit. Succession edges go on top
  // last, only when shown.
  //
  // Cytoscape computes style, label sizes and edge geometry lazily, which for
  // a few thousand elements is most of a second of main-thread work. It is
  // forced here in time slices so no single task blocks input for long.
  //
  // From removing the old elements until the new view is complete and fitted,
  // the canvas is hidden (and ignores the pointer), so no partial view is
  // ever shown; the "Laying out" status stays up meanwhile. Frames Cytoscape
  // draws between slices are invisible but still build its element textures
  // a few at a time, which keeps the first visible frame short.
  //
  // A superseded apply stops and leaves the canvas hidden for the newer
  // render, which reveals it when it finishes or fails (revealCanvas).
  applyGraph = async (elements, successionElements, layout, token, config) => {
    if (!this.cy) {
      this.cy = this.initializeGraph(this.containerRef.current);
    }
    const cy = this.cy;
    this.successionElements = successionElements;
    const stale = () => token !== this.renderToken || this.unmounted;
    let complete = false;
    this.applying = true;
    this.containerRef.current?.classList.add('is-swapping');
    try {
      const positions = positionsById(layout);
      elements.forEach(el => {
        if (el.group === 'nodes') el.position = positions.get(el.data.id);
        if (el.data.crossBand) el.classes = 'cross-band';
      });

      mark('cy-add');
      cy.elements().remove();
      // Point the hidden canvas roughly where the final fit will be, so the
      // frames drawn between slices warm textures at about the final zoom
      // for every element (Cytoscape caches them per zoom level).
      if (elements.length) cy.viewport(roughFit(layout, cy.width(), cy.height()));
      if (!(await inSlices(elements, slice => cy.add(slice).boundingBox(), stale))) return;
      // Packing moves everything, so label and edge geometry is recomputed,
      // again in slices. This runs inside a batch: Cytoscape's render loop
      // skips batched ticks, which stops its frames from recomputing every
      // moved element in one task. (Adding happens outside the batch, because
      // endBatch re-dirties the style of elements added during it.)
      mark('pack');
      cy.startBatch();
      let done;
      try {
        packComponents(cy, layout);
        mark('geometry');
        done = await inSlices(cy.elements(), slice => slice.boundingBox(), stale);
      } finally {
        cy.endBatch();
      }
      if (!done) return;
      const widths = bandWidths(cy);
      this.bandWidths = widths;
      const successionDrawn = visibleSuccession(cy, successionElements, widths);
      this.successionElements = successionDrawn;
      if (this.state.showSuccession) cy.add(successionDrawn);
      complete = true;
    } catch (error) {
      console.error('Graph rendering error:', error);
    } finally {
      if (!stale()) {
        mark('fit');
        if (complete && elements.length) this.fitView();
        this.revealCanvas();
        mark(null);
        this.applying = false;
        if (complete) {
          this.shownToken = token;
          this.rendered = config;
        }
        this.setState(complete
            ? { layingOut: 0 }
            : { layingOut: 0, error: 'Could not draw this view.' });
      }
    }
  };

  // Show the canvas again after applyGraph hid it.
  revealCanvas = () => {
    this.containerRef.current?.classList.remove('is-swapping');
  };

  // Fit, then clamp with defaultZoomLevel. That clamp is the default zoom
  // criteria 5–7 measure at (DEFAULT_MIN_ZOOM in zoomTier.js).
  fitView = () => {
    const cy = this.cy;
    if (!cy) return;
    cy.resize();
    cy.fit(undefined, 40);
    const level = defaultZoomLevel(cy.zoom());
    if (cy.zoom() !== level) {
      cy.zoom({
        level,
        renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
      });
    }
    this.applyZoomTier();
    if (this.state.showNodeToolTip && this.state.tooltipData?.id) {
      const node = cy.getElementById(this.state.tooltipData.id);
      this.panNodeAboveSheet(node);
    }
  };

  zoomBy = (factor) => {
    const cy = this.cy;
    if (!cy) return;
    const level = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor));
    cy.zoom({
      level,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  };

  // One handler for overview / mid / detail. It toggles classes only. It does
  // not run a layout. Detail and mid classes go on elements in the viewport,
  // so a tier change does not restyle the whole 9-monarchy graph.
  applyZoomTier = () => {
    const cy = this.cy;
    if (!cy) return;
    const tier = zoomTier(cy.zoom());
    if (tier === this.zoomTierName && this.zoomTierReady) {
      if (tier !== 'overview') this.scheduleViewportSync();
      this.scheduleBadgeSync();
      return;
    }
    const from = this.zoomTierName;
    const started = performance.now();
    this.zoomTierName = tier;
    this.syncVisibleClasses();
    const ms = performance.now() - started;
    this.zoomTierReady = true;
    this.scheduleBadgeSync();
    if (from !== tier) {
      this.tierSwitches.push({ from, to: tier, ms: Math.round(ms * 10) / 10 });
      try {
        performance.measure('royaltree:zoom-tier', { start: started, duration: ms });
      } catch (e) {
        // Older browsers take mark names, not an options object.
      }
    }
  };

  setClass = (ele, name, on) => {
    const has = ele.hasClass(name);
    if (on && !has) ele.addClass(name);
    else if (!on && has) ele.removeClass(name);
  };

  // Labels and portraits for the current tier, limited to the viewport so the
  // switch does not restyle every element on a large graph.
  syncVisibleClasses = () => {
    const cy = this.cy;
    if (!cy) return;
    const tier = this.zoomTierName;
    const ext = cy.extent();
    const pad = 160;
    const x1 = ext.x1 - pad;
    const x2 = ext.x2 + pad;
    const y1 = ext.y1 - pad;
    const y2 = ext.y2 + pad;
    const inside = (x, y) => x >= x1 && x <= x2 && y >= y1 && y <= y2;
    const mid = tier === 'mid';
    const detail = tier === 'detail';
    cy.batch(() => {
      if (!mid && !detail) {
        const marked = cy.elements('.lod-mid, .lod-detail');
        if (marked.nonempty()) marked.removeClass('lod-mid lod-detail');
        return;
      }
      cy.nodes('[type != "marriage"]').forEach((node) => {
        const p = node.position();
        const show = inside(p.x, p.y);
        this.setClass(node, 'lod-mid', mid && show && !!node.data('monarch'));
        this.setClass(node, 'lod-detail', detail && show);
      });
      cy.edges().forEach((edge) => {
        if (!detail) {
          this.setClass(edge, 'lod-detail', false);
          return;
        }
        const s = edge.source().position();
        const t = edge.target().position();
        this.setClass(edge, 'lod-detail', inside(s.x, s.y) || inside(t.x, t.y));
      });
    });
  };

  scheduleViewportSync = () => {
    if (this.panSync || !this.cy || this.zoomTierName === 'overview') return;
    this.panSync = requestAnimationFrame(() => {
      this.panSync = 0;
      this.syncVisibleClasses();
    });
  };

  onPan = () => {
    this.scheduleViewportSync();
    this.scheduleBadgeSync();
  };

  scheduleBadgeSync = () => {
    if (!this.state.focusedPersonId || this.badgeSync) return;
    this.badgeSync = requestAnimationFrame(() => {
      this.badgeSync = 0;
      this.positionFocusBadges();
    });
  };

  positionFocusBadges = () => {
    const root = this.badgeLayerRef.current;
    const cy = this.cy;
    if (!root || !cy) return;
    root.querySelectorAll('[data-badge-id]').forEach((button) => {
      const id = button.getAttribute('data-badge-id');
      const node = cy.getElementById(id);
      if (!node || node.empty()) {
        button.style.display = 'none';
        return;
      }
      const point = node.renderedPosition();
      const stack = button.getAttribute('data-direction') === 'down' ? 28 : 0;
      button.style.display = '';
      button.style.left = `${point.x}px`;
      button.style.top = `${point.y - node.renderedHeight() / 2 - 6 - stack}px`;
    });
  };

  handleFocus = (personId) => {
    if (!personId || !this.cy || this.applying) return;
    if (!this.state.focusedPersonId) {
      const view = { zoom: this.cy.zoom(), pan: { ...this.cy.pan() } };
      this.treeSnapshot = { elements: this.cy.elements().jsons(), ...view };
      this.focusBackStack = rememberView([], view);
    }
    this.setState({
      focusedPersonId: personId,
      focusUp: DEFAULT_FOCUS_UP,
      focusDown: DEFAULT_FOCUS_DOWN,
      focusExpandedUp: {},
      focusExpandedDown: {},
      showNodeToolTip: false,
      tooltipPinned: false,
    }, () => this.drawFocus());
  };

  stepFocus = (dir, delta) => {
    const key = dir === 'up' ? 'focusUp' : 'focusDown';
    const max = dir === 'up' ? 8 : 6;
    const next = Math.max(0, Math.min(max, this.state[key] + delta));
    if (next === this.state[key]) return;
    this.setState({
      [key]: next,
      focusExpandedUp: {},
      focusExpandedDown: {},
    }, () => this.drawFocus());
  };

  expandFocus = (badge) => {
    const key = badge.direction === 'up' ? 'focusExpandedUp' : 'focusExpandedDown';
    if (this.state[key][badge.id]) return;
    this.setState({
      [key]: { ...this.state[key], [badge.id]: true },
    }, () => this.drawFocus());
  };

  backFocus = () => {
    const restored = restoreView(this.focusBackStack);
    this.focusBackStack = restored.stack;
    const snap = this.treeSnapshot;
    this.treeSnapshot = null;
    const cy = this.cy;
    this.setState({
      focusedPersonId: null,
      focusBadges: [],
      focusExpandedUp: {},
      focusExpandedDown: {},
    });
    if (!cy || !snap) return;
    cy.elements().remove();
    if (snap.elements?.length) cy.add(snap.elements);
    const zoom = restored.view ? restored.view.zoom : snap.zoom;
    const pan = restored.view ? restored.view.pan : snap.pan;
    cy.viewport({ zoom, pan });
    this.zoomTierReady = false;
    this.applyZoomTier();
  };

  drawFocus = () => {
    const cy = this.cy;
    const focusId = this.state.focusedPersonId;
    if (!cy || !focusId) return;
    const pool = personPool(this.loadedPayloads);
    const model = buildHourglass(pool, focusId, {
      up: this.state.focusUp,
      down: this.state.focusDown,
      expandedUp: this.state.focusExpandedUp,
      expandedDown: this.state.focusExpandedDown,
    });
    const mobile = !!(this.props.viewport && this.props.viewport.isMobile);
    const usable = usableFocusViewport(cy.width() || 390, cy.height() || 844, { mobile });
    const layout = layoutHourglass(pool, model, usable);
    const data = {};
    model.people.forEach((id) => { data[id] = pool[id]; });
    const chart = convertToChart(
      data,
      this.state.highlightedNodes,
      this.state.sharedNodes,
      this.state.nodeMonarchyIndex || {},
      [],
      false,
      this.state.memberFlag,
    );
    placeMarriageNodes(layout.positions, chart.nodes, chart.edges);
    const elements = this.convertToCytoscapeFormat(chart);
    const placed = [];
    elements.forEach((el) => {
      if (el.group !== 'nodes') {
        placed.push(el);
        return;
      }
      const point = layout.positions.get(el.data.id);
      if (!point) return;
      el.position = { x: point.x, y: point.y };
      if (el.data.type !== 'marriage') {
        el.classes = 'focus-on';
        applyFocusFields(el.data, pool[el.data.id] || el.data, layout, !!el.data.monarch);
      }
      placed.push(el);
    });
    cy.elements().remove();
    cy.add(placed);
    cy.layout({ name: 'preset', fit: false, animate: false }).run();
    const bounds = cy.elements().boundingBox({ includeLabels: true });
    const fit = fitHourglassViewport(bounds, usable);
    cy.viewport(fit);
    this.zoomTierReady = false;
    this.applyZoomTier();
    this.setState({
      focusBadges: model.badges.map((badge) => ({
        id: badge.id,
        direction: badge.direction,
        count: badge.count,
        label: pool[badge.id]?.label || badge.id,
      })),
    }, () => this.positionFocusBadges());
  };

  // Keep the selected person in the band between the reign rail and the phone
  // sheet. The rail is outside the canvas, so the top of the canvas is already
  // below it. The sheet covers the bottom of the viewport.
  panNodeAboveSheet = (node) => {
    const cy = this.cy;
    if (!cy || !node || node.empty()) return;
    if (!(this.props.viewport && this.props.viewport.isMobile)) return;
    const stage = cy.container().getBoundingClientRect();
    const sheet = document.querySelector('.royal-tree-container .mobile-sheet');
    const sheetTop = sheet ? sheet.getBoundingClientRect().top : stage.bottom;
    const bandTop = 4;
    const bandBottom = Math.min(cy.height() - 4, sheetTop - stage.top - 4);
    if (bandBottom - bandTop < 40) return;
    let box = node.renderedBoundingBox({ includeLabels: true });
    const bandHeight = bandBottom - bandTop;
    const nodeHeight = box.y2 - box.y1;
    if (nodeHeight > bandHeight - 8) {
      const level = Math.max(cy.zoom() * ((bandHeight - 8) / nodeHeight), 0.2);
      cy.zoom({
        level,
        renderedPosition: { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 },
      });
      box = node.renderedBoundingBox({ includeLabels: true });
    }
    const midX = (box.x1 + box.x2) / 2;
    let dy = (bandTop + bandBottom) / 2 - (box.y1 + box.y2) / 2;
    if (box.y1 + dy < bandTop) dy += bandTop - (box.y1 + dy);
    if (box.y2 + dy > bandBottom) dy -= (box.y2 + dy) - bandBottom;
    cy.panBy({ x: cy.width() / 2 - midX, y: dy });
  };

  onGraphKeyDown = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable) return;
    if (event.key === 'Escape') {
      if (this.state.helpOpen || this.state.capWarning) return;
      if (this.state.showNodeToolTip) {
        this.setState({ showNodeToolTip: false, tooltipPinned: false });
        event.preventDefault();
      }
      return;
    }
    if (event.key === '+' || event.key === '=') {
      this.zoomBy(ZOOM_STEP);
      event.preventDefault();
    } else if (event.key === '-' || event.key === '_') {
      this.zoomBy(1 / ZOOM_STEP);
      event.preventDefault();
    } else if (event.key === 'f' || event.key === 'F' || event.key === '0') {
      this.fitView();
      event.preventDefault();
    }
  };

  installMeasureHook = () => {
    try {
      if (!new URLSearchParams(window.location.search).has('measure')) return;
    } catch (e) {
      return;
    }
    window.__royalTreeMeasure = {
      switches: () => this.tierSwitches.slice(),
      cy: () => this.cy,
      zoom: () => this.cy && this.cy.zoom(),
      tier: () => this.zoomTierName,
      defaultMinZoom: DEFAULT_MIN_ZOOM,
      fit: () => this.fitView(),
      setZoom: (level) => {
        if (!this.cy) return;
        this.cy.zoom({
          level,
          renderedPosition: { x: this.cy.width() / 2, y: this.cy.height() / 2 },
        });
        this.applyZoomTier();
      },
      labelReport: () => this.labelReport(),
      edgeReport: () => this.edgeReport(),
      panelCoverage: () => this.panelCoverage(),
    };
  };

  labelReport = () => {
    const cy = this.cy;
    if (!cy) return null;
    const z = cy.zoom();
    const w = cy.width();
    const h = cy.height();
    const monarchs = [];
    let nonMonarchShown = 0;
    cy.nodes('[type != "marriage"]').forEach((node) => {
      const pos = node.renderedPosition();
      const bw = node.renderedWidth();
      const bh = node.renderedHeight();
      const inView = pos.x + bw / 2 > 0 && pos.x - bw / 2 < w && pos.y + bh / 2 > 0 && pos.y - bh / 2 < h;
      if (!inView) return;
      const font = parseFloat(node.style('font-size'));
      const min = parseFloat(node.style('min-zoomed-font-size'));
      const shown = font * z >= min && String(node.style('label') || '') !== '';
      if (node.data('monarch')) {
        monarchs.push({ id: node.id(), px: font * z, shown, label: node.style('label') });
      } else if (shown) {
        nonMonarchShown += 1;
      }
    });
    const px = monarchs.map((row) => row.px);
    return {
      zoom: z,
      tier: this.zoomTierName,
      viewport: { w, h },
      monarchs: monarchs.length,
      monarchMinPx: px.length ? Math.min(...px) : null,
      hiddenMonarchLabels: monarchs.filter((row) => !row.shown).length,
      nonMonarchLabelsShown: nonMonarchShown,
      sample: monarchs.slice(0, 5),
    };
  };

  edgeReport = () => {
    const cy = this.cy;
    if (!cy) return null;
    const z = cy.zoom();
    let familyEdges = 0;
    let shown = 0;
    cy.edges().forEach((edge) => {
      if (edge.data('relation') === 'sibling' || edge.data('relation') === 'succession') return;
      if (!edge.data('family')) return;
      if (edge.style('display') === 'none') return;
      familyEdges += 1;
      const font = parseFloat(edge.style('font-size'));
      const min = parseFloat(edge.style('min-zoomed-font-size'));
      if (font * z >= min && edge.style('label')) shown += 1;
    });
    return { zoom: z, tier: this.zoomTierName, familyEdges, shown };
  };

  panelCoverage = () => {
    const root = document.querySelector('.royal-tree-container');
    if (!root) return null;
    const panels = [...root.querySelectorAll('.control-panel, .royal-tree-zoom, .royal-tree-title')];
    const boxes = panels.map((el) => {
      const rect = el.getBoundingClientRect();
      return { cls: el.className, w: rect.width, h: rect.height, area: rect.width * rect.height };
    });
    const area = boxes.reduce((sum, box) => sum + box.area, 0);
    const rw = root.clientWidth;
    const rh = root.clientHeight;
    return { rw, rh, area, fraction: rw && rh ? area / (rw * rh) : null, boxes };
  };

  zoomToNode = (id) => {
    if (!this.cy) {
      this.setState({ railHighlightId: id });
      return;
    }
    const node = this.cy.getElementById(id);
    if (!node || node.empty()) {
      this.setState({ railHighlightId: id });
      return;
    }

    this.cy.nodes().removeClass('searched');
    node.removeClass('faded').addClass('searched');

    this.cy.animate(
        { center: { eles: node }, zoom: 1.3 },
        {
          duration: 500,
          complete: () => this.panNodeAboveSheet(node),
        }
    );

    // Surface the person's details so the zoom target is confirmed.
    this.setState({ showNodeToolTip: true, tooltipPinned: true, tooltipData: node.data(), railHighlightId: id });
  };

  convertToCytoscapeFormat = (chartData) => {
    const elements = [];

    chartData.nodes.forEach(node => {
      elements.push({
        group: 'nodes',
        data: {
          ...node,
          color: node.style?.fill,
          borderColor: node.style?.stroke,
          opacity: node.style?.opacity,
          image: node.icon?.img,
          ...(node.monarch ? { shortLabel: monarchShortLabel(node) } : {}),
        }
      });
    });

    chartData.edges.forEach(edge => {
      elements.push({
        group: 'edges',
        data: {
          ...edge,
          source: edge.source,
          target: edge.target,
          color: edge.color
        }
      });
    });

    return elements;
  };

  async componentDidMount() {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.onGraphKeyDown);
    this.installMeasureHook();
    try {
      const monarchyOptions = await loadGzipJson(royaltyUrl('index.json'));
      // Houses are optional (only present once BuildHouses has run).
      let houseOptions = [];
      try {
        const response = await fetch(royaltyUrl('houses.json'));
        if (response.ok) houseOptions = await response.json();
      } catch (e) {
        houseOptions = [];
      }
      const initial = monarchyOptions.includes(DEFAULT_MONARCHY)
          ? DEFAULT_MONARCHY
          : monarchyOptions[0];
      this.setState({ monarchyOptions, houseOptions });
      await this.loadMonarchies([initial]);
    } catch (error) {
      console.error('Failed to load monarchy index:', error);
      this.setState({ loading: false, error: error.message });
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.isRailCollapsed(prevState) === this.isRailCollapsed()) return;
    const cy = this.cy;
    if (!cy) return;
    const zoom = cy.zoom();
    const pan = { ...cy.pan() };
    cy.resize();
    if (this.state.focusedPersonId) {
      this.drawFocus();
      return;
    }
    cy.viewport({ zoom, pan });
    if (this.state.showNodeToolTip && this.state.tooltipData?.id) {
      const node = cy.getElementById(this.state.tooltipData.id);
      this.panNodeAboveSheet(node);
    }
  }

  componentWillUnmount() {
    this.unmounted = true;
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.onGraphKeyDown);
    terminateLayoutWorker();
    if (this.cy) {
      this.cy.destroy();
    }
  }

  // Resize the canvas and keep the zoom. A phone rotation used to call
  // cy.fit(), which threw away the visitor's zoom.
  handleResize = () => {
    const width = window.innerWidth;
    if (width !== this.state.viewportWidth) this.setState({ viewportWidth: width });
    const cy = this.cy;
    if (!cy) return;
    const zoom = cy.zoom();
    const pan = { ...cy.pan() };
    cy.resize();
    if (this.state.focusedPersonId) {
      this.drawFocus();
      return;
    }
    cy.viewport({ zoom, pan });
    if (this.state.showNodeToolTip && this.state.tooltipData?.id) {
      const node = cy.getElementById(this.state.tooltipData.id);
      this.panNodeAboveSheet(node);
    }
  };

  loadMonarchies = async (monarchies) => {
    const token = ++this.loadToken;
    const selected = monarchies;

    // Nothing selected: clear the chart and leave it blank rather than snapping
    // back to a default monarchy.
    if (selected.length === 0) {
      this.loadedPayloads = [];
      this.loadedSelected = [];
      const token = ++this.renderToken; // drop any render still in flight
      const config = { payloads: [], selected: [], bridgeOptions: this.state.bridgeOptions, rankOptions: this.state.rankOptions };
      this.setState(
          {
            selectedMonarchs: [],
            data: {},
            highlightedNodes: [],
            sharedNodes: new Set(),
            memberFlag: new Set(),
            nodeMonarchyIndex: {},
            memberCounts: [],
            sharedCount: 0,
            monarchOrder: [],
            successionEdges: [],
            membership: {},
            sharedInfo: null,
            peopleList: [],
            sharedList: [],
            rootId: '',
            showNodeToolTip: false,
            loading: false,
            layingOut: 0,
            capWarning: null,
            error: null,
          },
          () => this.applyGraph([], [], { components: [] }, token, config)
      );
      return;
    }

    this.setState({ selectedMonarchs: selected, loading: true, error: null });
    try {
      const payloads = await Promise.all(
          selected.map(m => loadGzipJson(royaltyUrl(m + '.json.gz')))
      );
      // A newer selection superseded this request while it was in flight.
      if (token !== this.loadToken) return;

      // Cache so the bridging/rank knobs can re-merge without re-fetching.
      this.loadedPayloads = payloads;
      this.loadedSelected = selected;
      this.renderMerged(payloads, selected, this.state.bridgeOptions, this.state.rankOptions);
    } catch (error) {
      if (token !== this.loadToken) return;
      console.error(`Failed to load monarchies "${selected.join(', ')}":`, error);
      this.setState({ loading: false, error: error.message });
    }
  };

  // Merge cached payloads with the given bridging knobs and render. People are
  // keyed by Wikidata ID, so shared royals collapse to one node; multi-monarchy
  // views also splice in the chains connecting dynasties up to their most-recent
  // common ancestors (see mergeMonarchies).
  renderMerged = async (payloads, selected, bridgeOptions, rankOptions, force = false) => {
    mark('merge');
    const merged = mergeMonarchies(payloads, selected, bridgeOptions, rankOptions);
    const peopleCount = Object.keys(merged.data).length;

    // Large views ask first (see NODE_CAP). Anything already in flight
    // finishes, and the current graph stays up behind the dialog.
    if (peopleCount > NODE_CAP && peopleCount > this.capAccepted && !force) {
      this.setState({
        loading: false,
        layingOut: 0,
        capWarning: { count: peopleCount, payloads, selected, bridgeOptions, rankOptions },
      });
      return;
    }
    if (force) this.capAccepted = Math.max(this.capAccepted, peopleCount);
    const token = ++this.renderToken;
    mark('convert');

    const chart = convertToChart(
        merged.data, merged.highlightedNodes, merged.sharedNodes, merged.nodeMonarchyIndex,
        merged.successionEdges, true, merged.memberFlag,
    );
    const all = this.convertToCytoscapeFormat(chart);
    assignLayoutBands(all);
    const elements = all.filter(el => el.data.relation !== 'succession');
    const successionElements = all.filter(el => el.data.relation === 'succession');
    mark('setState-layingOut');

    // Lay out off the main thread; the previous view stays interactive meanwhile.
    this.setState({ loading: false, layingOut: peopleCount, capWarning: null });
    let layout;
    try {
      const layoutInput = toLayoutElements(elements);
      mark('worker');
      layout = await requestLayout(layoutInput);
      mark('setState-merged');
    } catch (error) {
      if (token !== this.renderToken || this.unmounted) return;
      console.error('Layout failed:', error);
      this.revealCanvas(); // in case a superseded apply left it hidden
      this.setState({ layingOut: 0, error: error.message });
      return;
    }
    // A newer selection or knob change superseded this one.
    if (token !== this.renderToken || this.unmounted) return;

    this.treeSnapshot = null;
    this.focusBackStack = [];
    const config = { payloads, selected, bridgeOptions, rankOptions };
    this.setState(
        {
          data: merged.data,
          highlightedNodes: merged.highlightedNodes,
          sharedNodes: merged.sharedNodes,
          nodeMonarchyIndex: merged.nodeMonarchyIndex,
          memberCounts: merged.memberCounts,
          sharedCount: merged.sharedCount,
          monarchOrder: merged.monarchOrder,
          successionEdges: merged.successionEdges,
          membership: merged.membership,
          memberFlag: merged.memberFlag,
          sharedInfo: null,
          peopleList: merged.peopleList,
          sharedList: merged.sharedList,
          rootId: merged.highlightedNodes[0] || '',
          error: null,
          focusedPersonId: null,
          focusBadges: [],
          focusExpandedUp: {},
          focusExpandedDown: {},
        },
        () => this.applyGraph(elements, successionElements, layout, token, config)
    );
  };

  // Node-cap warning: show the large view anyway, or put the controls back to
  // what the graph still shows.
  acceptCapWarning = () => {
    const pending = this.state.capWarning;
    if (!pending) return;
    this.renderMerged(pending.payloads, pending.selected, pending.bridgeOptions, pending.rankOptions, true);
  };

  //
  // Declining also cancels anything still in flight (a fetch, layout or apply
  // started before the dialog opened), so nothing lands that doesn't match
  // the reverted controls. If the graph had already been cleared for such a
  // render, the last completed view is drawn again (its layout is cached).
  declineCapWarning = () => {
    const rendered = this.rendered;
    const inFlight = this.renderToken !== this.shownToken;
    this.loadToken++;
    this.renderToken++;
    if (!rendered) {
      this.setState({ capWarning: null, layingOut: 0, loading: false });
      this.revealCanvas();
      return;
    }
    this.loadedPayloads = rendered.payloads;
    this.loadedSelected = rendered.selected;
    this.setState({
      capWarning: null,
      loading: false,
      layingOut: 0,
      selectedMonarchs: rendered.selected,
      bridgeOptions: rendered.bridgeOptions,
      rankOptions: rendered.rankOptions,
    });
    if (inFlight) {
      this.renderMerged(rendered.payloads, rendered.selected, rendered.bridgeOptions, rendered.rankOptions, true);
    }
  };

  // Re-run the merge with new bridging knobs against the already-fetched
  // payloads (no network). No-op unless 2+ monarchies are shown.
  handleBridgeChange = (bridgeOptions) => {
    this.setState({ bridgeOptions });
    if (this.loadedSelected.length > 1) {
      this.renderMerged(this.loadedPayloads, this.loadedSelected, bridgeOptions, this.state.rankOptions);
    }
  };

  // Re-run the merge with a new rank filter against the already-fetched payloads
  // (no network). Only affects houses, so no-op when none are loaded.
  handleRankChange = (rankOptions) => {
    this.setState({ rankOptions });
    if (this.loadedPayloads.some(p => p.type === 'house')) {
      this.renderMerged(this.loadedPayloads, this.loadedSelected, this.state.bridgeOptions, rankOptions);
    }
  };

  // Succession edges don't take part in layout, so toggling them just adds or
  // removes the overlay; positions and the viewport stay put.
  handleToggleSuccession = (showSuccession) => {
    this.setState({ showSuccession });
    const cy = this.cy;
    // Mid-apply, applyGraph adds the overlay at the end if it's still wanted.
    if (!cy || this.applying) return;
    if (showSuccession) {
      if (cy.$(SUCCESSION_SELECTOR).empty() && this.successionElements.length) {
        const added = cy.add(this.successionElements);
        if (this.state.sharedInfo) added.addClass('faded');
      }
    } else {
      cy.remove(SUCCESSION_SELECTOR);
    }
  };

  handleFilterChange = (name, value) => {
    if (name === "selectedMonarchs") {
      this.loadMonarchies(value);
    }
  };

  closeHelp = () => {
    try {
      window.localStorage.setItem(HELP_SEEN_KEY, "1");
    } catch (e) {
      // ignore storage failures (private mode, etc.)
    }
    this.setState({ helpOpen: false });
  };

  treeTitle() {
    const names = this.state.selectedMonarchs.map((name) => name.replace(/_/g, ' '));
    return names.length ? names.join(', ') : 'No tree selected';
  }

  render() {
    const isMobile = this.props.viewport && this.props.viewport.isMobile;
    const lanes = buildReignLanes(this.loadedPayloads, this.loadedSelected);
    const domain = sharedDomain(lanes, new Date().getFullYear());
    const railCollapsed = this.isRailCollapsed();
    return (
        <div className="royal-tree-container" style={{ position: 'relative' }}>
          <HomeButton />
          {lanes.length > 0 && (
            <SuccessionRail
              lanes={lanes}
              domain={domain}
              collapsed={railCollapsed}
              highlightId={this.state.railHighlightId}
              onToggle={this.toggleRail}
              onSelect={this.zoomToNode}
            />
          )}
          <div className="royal-tree-stage">
          <div
              ref={this.containerRef}
              className="cytoscape-container"
          >
          </div>
          <div className="royal-tree-focus-layer" ref={this.badgeLayerRef}>
            {this.state.focusedPersonId && (
              <div className="royal-tree-focus-bar" role="group" aria-label="Focus depth">
                <span>Up</span>
                <button type="button" aria-label="Fewer ancestor generations" onClick={() => this.stepFocus('up', -1)} disabled={this.state.focusUp <= 0}>−</button>
                <span>{this.state.focusUp}</span>
                <button type="button" aria-label="More ancestor generations" onClick={() => this.stepFocus('up', 1)} disabled={this.state.focusUp >= 8}>+</button>
                <span>Down</span>
                <button type="button" aria-label="Fewer descendant generations" onClick={() => this.stepFocus('down', -1)} disabled={this.state.focusDown <= 0}>−</button>
                <span>{this.state.focusDown}</span>
                <button type="button" aria-label="More descendant generations" onClick={() => this.stepFocus('down', 1)} disabled={this.state.focusDown >= 6}>+</button>
                <button type="button" onClick={this.backFocus}>Back</button>
              </div>
            )}
            {this.state.focusBadges.map((badge) => (
              <button
                key={`${badge.id}-${badge.direction}`}
                type="button"
                className="royal-tree-focus-badge"
                data-badge-id={badge.id}
                data-direction={badge.direction}
                aria-label={`Show ${badge.count} hidden ${badge.direction === 'up' ? 'ancestors' : 'descendants'} of ${badge.label}`}
                onClick={() => this.expandFocus(badge)}
              >
                +{badge.count}
              </button>
            ))}
          </div>
          <div className="royal-tree-title">{this.treeTitle()}</div>
          <div className="royal-tree-zoom" role="group" aria-label="Zoom">
            <button type="button" onClick={() => this.zoomBy(ZOOM_STEP)} aria-label="Zoom in" title="Zoom in (+)">+</button>
            <button type="button" onClick={() => this.zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out" title="Zoom out (−)">−</button>
            <button type="button" onClick={this.fitView} aria-label="Fit at the default zoom" title="Fit (F)">Fit</button>
          </div>

          {this.state.loading && (
              <div className="royal-tree-status">Loading…</div>
          )}
          {!this.state.loading && this.state.layingOut > 0 && (
              <div className="royal-tree-status" role="status">
                Laying out {this.state.layingOut.toLocaleString()} people…
              </div>
          )}
          {this.state.capWarning && (
              <CapWarningDialog
                  count={this.state.capWarning.count}
                  cap={NODE_CAP}
                  onCancel={this.declineCapWarning}
                  onContinue={this.acceptCapWarning}
              />
          )}
          {this.state.error && !this.state.loading && (
              <div className="royal-tree-status royal-tree-error">
                Failed to load data: {this.state.error}
              </div>
          )}

          {this.state.showNodeToolTip && (
              isMobile ? (
                  <div className="mobile-sheet royal-tree-sheet">
                    <div className="mobile-sheet-header">
                      <button
                          type="button"
                          className="mobile-sheet-close"
                          onClick={() => this.setState({ showNodeToolTip: false, tooltipPinned: false })}
                          aria-label="Close"
                      >
                        &times;
                      </button>
                    </div>
                    <NodeToolTip data={this.state.tooltipData} onFocus={this.handleFocus} />
                  </div>
              ) : (
                  <div className="node-tooltips">
                    <NodeToolTip
                      data={this.state.tooltipData}
                      onFocus={this.handleFocus}
                    />
                  </div>
              )
          )}

          {this.state.sharedInfo && (
              <div className="royal-tree-shared-info">
                <button
                    type="button"
                    className="royal-tree-shared-info-close"
                    onClick={this.clearLineage}
                    aria-label="Clear highlight"
                >
                  ×
                </button>
                <strong>{this.state.sharedInfo.label}</strong>
                {' '}connects{' '}
                {this.state.sharedInfo.monarchies.map(m => m.replace(/_/g, ' ')).join(' & ')}
              </div>
          )}

          {!isMobile && (
              <div className="search-panel-container">
                <SearchPanel
                    people={this.state.peopleList}
                    sharedPeople={this.state.sharedList}
                    monarchOrder={this.state.monarchOrder}
                    onZoomTo={this.zoomToNode}
                    activeId={this.state.railHighlightId}
                />
              </div>
          )}

          {!isMobile && (
              <div className="filter-panel-container">
                <FilterPanel
                    selectedMonarchs={this.state.selectedMonarchs}
                    monarchyOptions={this.state.monarchyOptions}
                    houseOptions={this.state.houseOptions}
                    memberCounts={this.state.memberCounts}
                    sharedCount={this.state.sharedCount}
                    bridgeOptions={this.state.bridgeOptions}
                    onBridgeChange={this.handleBridgeChange}
                    rankOptions={this.state.rankOptions}
                    onRankChange={this.handleRankChange}
                    showSuccession={this.state.showSuccession}
                    onToggleSuccession={this.handleToggleSuccession}
                    onChange={(name, value) => this.handleFilterChange(name, value)}
                />
              </div>
          )}

          {isMobile && (
              <ControlsFab onClick={() => this.setState({ controlsDrawerOpen: true })} />
          )}
          {isMobile && (
              <MobileDrawer
                  open={this.state.controlsDrawerOpen}
                  onClose={() => this.setState({ controlsDrawerOpen: false })}
                  title="Controls"
              >
                <div className="mobile-drawer-section">Find a person</div>
                <SearchPanel
                    embedded
                    people={this.state.peopleList}
                    sharedPeople={this.state.sharedList}
                    monarchOrder={this.state.monarchOrder}
                    onZoomTo={(id) => { this.setState({ controlsDrawerOpen: false }); this.zoomToNode(id); }}
                    activeId={this.state.railHighlightId}
                />
                <div className="mobile-drawer-section">Monarchies</div>
                <FilterPanel
                    embedded
                    selectedMonarchs={this.state.selectedMonarchs}
                    monarchyOptions={this.state.monarchyOptions}
                    houseOptions={this.state.houseOptions}
                    memberCounts={this.state.memberCounts}
                    sharedCount={this.state.sharedCount}
                    bridgeOptions={this.state.bridgeOptions}
                    onBridgeChange={this.handleBridgeChange}
                    rankOptions={this.state.rankOptions}
                    onRankChange={this.handleRankChange}
                    showSuccession={this.state.showSuccession}
                    onToggleSuccession={this.handleToggleSuccession}
                    onChange={(name, value) => this.handleFilterChange(name, value)}
                />
              </MobileDrawer>
          )}

          <HelpPanel
              open={this.state.helpOpen}
              onOpen={() => this.setState({ helpOpen: true })}
              onClose={this.closeHelp}
              fabPosition={isMobile ? { top: 12, right: 12 } : { bottom: 20, left: 20 }}
          />

          <div className="royal-tree-attribution">
            Data from{' '}
            <a href="https://www.wikidata.org" target="_blank" rel="noopener noreferrer">Wikidata</a>
            {' '}&{' '}
            <a href="https://www.wikipedia.org" target="_blank" rel="noopener noreferrer">Wikipedia</a>
            {' '}· Images from{' '}
            <a href="https://commons.wikimedia.org" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a>
          </div>
          </div>
        </div>
    );
  }
}

export default withViewport(RoyalTree);
