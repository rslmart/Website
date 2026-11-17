import React, { Component } from 'react';
import cytoscape from 'cytoscape';
import FilterPanel from "./filter-panel";
import SearchPanel from "./SearchPanel";
import NodeToolTip from "./NodeToolTip";
import HelpPanel from "./help-panel";
import HomeButton from "../components/HomeButton";
import ControlsFab from "../components/ControlsFab";
import MobileDrawer from "../components/MobileDrawer";
import { withViewport } from "../hooks/useViewport";
import { convertToChart, mergeMonarchies, DEFAULT_BRIDGE_OPTIONS, DEFAULT_VISIBLE_RANKS } from './RoyalTreeUtils';
import { PERSON_SIZE_STYLE, MARRIAGE_SIZE_STYLE, toLayoutElements, packComponents, positionsById } from './royalTreeLayout';
import { requestLayout, terminateLayoutWorker } from './layoutClient';
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
// Renderer notifications are off inside each slice, so nothing is drawn until
// the caller notifies. Resolves false if stale() turned true (superseded).
const SLICE_SIZE = 150;
const SLICE_BUDGET_MS = 40;
const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));
async function inSlices(items, fn, cy, stale) {
  let taskStart = performance.now();
  for (let i = 0; i < items.length; i += SLICE_SIZE) {
    const slice = items.slice(i, i + SLICE_SIZE);
    cy.notifications(false);
    try {
      fn(slice);
    } finally {
      cy.notifications(true);
    }
    if (performance.now() - taskStart > SLICE_BUDGET_MS) {
      await nextTask();
      if (stale()) return false;
      taskStart = performance.now();
    }
  }
  return true;
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
    // Succession overlay edges for the current view, added or removed on toggle
    // without touching the layout.
    this.successionElements = [];

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
    };
  }

  bindGraphEvents = (cyInstance) => {
    cyInstance.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      this.setState({
        showNodeToolTip: true,
        tooltipData: node.data()
      });
    });

    cyInstance.on('mouseout', 'node', () => {
      this.setState({showNodeToolTip: false});
    });

    // Clicking a node: if it's shared between monarchies, reveal how the
    // dynasties connect through it; otherwise clear any prior highlight.
    cyInstance.on('tap', 'node', (evt) => {
      this.highlightSharedLineage(evt.target);
    });

    // Tapping the background clears zoom/pan tooltip and any lineage highlight.
    cyInstance.on('tapstart', (evt) => {
      if (evt.target === cyInstance) {
        this.setState({ showNodeToolTip: false });
        this.clearLineage();
      }
    });

    cyInstance.on('drag', 'node', () => {
      this.setState({ showNodeToolTip: false });
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
            'label': 'data(label)',
            'text-valign': 'bottom',
            'text-wrap': 'wrap',
            'text-max-width': 120,
            // Skip labels smaller than ~6px on screen (unreadable anyway): at
            // overview zoom they are thousands of sub-pixel smudges that cost
            // most of a frame on large views.
            'min-zoomed-font-size': 6,
            'text-margin-y': 5,
            'background-color': 'data(color)',
            'border-color': 'data(borderColor)',
            'border-width': 5,
            'background-image': 'data(image)',
            // Draw the portrait smaller than the node and centered so the node's
            // fill (gender/monarchy color) stays visible as a ring around it.
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
            'opacity': 'data(opacity)',
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'label': 'data(family)',
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'text-rotation': 'autorotate',
            'text-max-width': '5',
            'text-wrap': 'wrap',
            'font-size': '14',
            'min-zoomed-font-size': 6,
          }
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
          // stepper, so the zoom target is unmistakable.
          selector: 'node.searched',
          style: {
            'border-color': '#00e5ff',
            'border-width': 12,
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
  // forced here in time slices (with renderer notifications off, so no partial
  // frames are drawn) so no single task blocks input for long.
  applyGraph = async (elements, successionElements, layout, token) => {
    if (!this.cy) {
      this.cy = this.initializeGraph(this.containerRef.current);
    }
    const cy = this.cy;
    this.successionElements = successionElements;
    const stale = () => token !== this.renderToken || this.unmounted;
    this.applying = true;
    try {
      cy.elements().remove();
      if (elements.length === 0) return; // Blank selection: nothing to fit.

      const positions = positionsById(layout);
      elements.forEach(el => {
        if (el.group === 'nodes') el.position = positions.get(el.data.id);
      });

      mark('cy-add');
      if (!(await inSlices(elements, slice => cy.add(slice).boundingBox(), cy, stale))) return;
      mark('pack');
      packComponents(cy, layout);
      // Packing moved everything: recompute label and edge geometry, again in slices.
      mark('geometry');
      if (!(await inSlices(cy.elements(), slice => slice.boundingBox(), cy, stale))) return;
      mark('fit');
      if (this.state.showSuccession) cy.add(successionElements);
      cy.notify('add', cy.elements()); // renderer: refresh its element list and draw
      if (this.firstFitDone) {
        cy.fit(undefined, 40);
      } else {
        // The first view has always been sized to the container and fitted
        // without padding (formerly a setTimeout in initializeGraph).
        this.firstFitDone = true;
        cy.resize();
        cy.fit();
      }
      mark(null);
    } catch (error) {
      console.error('Graph rendering error:', error);
    } finally {
      if (!stale()) {
        this.applying = false;
        this.setState({ layingOut: 0 });
      }
    }
  };

  zoomToNode = (id) => {
    if (!this.cy) return;
    const node = this.cy.getElementById(id);
    if (!node || node.empty()) return;

    this.cy.nodes().removeClass('searched');
    node.addClass('searched');

    this.cy.animate(
        { center: { eles: node }, zoom: 1.3 },
        { duration: 500 }
    );

    // Surface the person's details so the zoom target is confirmed.
    this.setState({ showNodeToolTip: true, tooltipData: node.data() });
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
          image: node.icon?.img
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

  componentWillUnmount() {
    this.unmounted = true;
    window.removeEventListener('resize', this.handleResize);
    terminateLayoutWorker();
    if (this.cy) {
      this.cy.destroy();
    }
  }

  handleResize = () => {
    if (this.cy) {
      this.cy.resize();
      this.cy.fit();
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
          () => this.applyGraph([], [], { components: [] }, this.renderToken)
      );
      this.renderToken++; // drop any layout still in flight
      this.rendered = { payloads: [], selected: [], bridgeOptions: this.state.bridgeOptions, rankOptions: this.state.rankOptions };
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
      this.setState({ layingOut: 0, error: error.message });
      return;
    }
    // A newer selection or knob change superseded this one.
    if (token !== this.renderToken || this.unmounted) return;

    this.rendered = { payloads, selected, bridgeOptions, rankOptions };
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
        },
        () => this.applyGraph(elements, successionElements, layout, token)
    );
  };

  // Node-cap warning: show the large view anyway, or put the controls back to
  // what the graph still shows.
  acceptCapWarning = () => {
    const pending = this.state.capWarning;
    if (!pending) return;
    this.renderMerged(pending.payloads, pending.selected, pending.bridgeOptions, pending.rankOptions, true);
  };

  declineCapWarning = () => {
    const rendered = this.rendered;
    if (!rendered) {
      this.setState({ capWarning: null });
      return;
    }
    this.loadedPayloads = rendered.payloads;
    this.loadedSelected = rendered.selected;
    this.setState({
      capWarning: null,
      selectedMonarchs: rendered.selected,
      bridgeOptions: rendered.bridgeOptions,
      rankOptions: rendered.rankOptions,
    });
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

  render() {
    const isMobile = this.props.viewport && this.props.viewport.isMobile;
    return (
        <div className="royal-tree-container" style={{ position: 'relative' }}>
          <HomeButton />
          <div
              ref={this.containerRef}
              className="cytoscape-container"
          >
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
              <div
                  className="royal-tree-cap-warning"
                  role="alertdialog"
                  aria-labelledby="royal-tree-cap-title"
                  aria-describedby="royal-tree-cap-body"
              >
                <strong id="royal-tree-cap-title">
                  Show {this.state.capWarning.count.toLocaleString()} people?
                </strong>
                <p id="royal-tree-cap-body">
                  This view is larger than {NODE_CAP.toLocaleString()} people. It can take a few
                  seconds to lay out and pans more slowly. Fewer monarchies or a shorter
                  look-back keeps it light.
                </p>
                <div className="royal-tree-cap-actions">
                  <button type="button" className="royal-tree-cap-cancel" onClick={this.declineCapWarning}>
                    Cancel
                  </button>
                  <button type="button" className="royal-tree-cap-continue" onClick={this.acceptCapWarning} autoFocus>
                    Show all
                  </button>
                </div>
              </div>
          )}
          {this.state.error && !this.state.loading && (
              <div className="royal-tree-status royal-tree-error">
                Failed to load data: {this.state.error}
              </div>
          )}

          {this.state.showNodeToolTip && (
              isMobile ? (
                  <div className="mobile-sheet">
                    <div className="mobile-sheet-header">
                      <button
                          type="button"
                          className="mobile-sheet-close"
                          onClick={() => this.setState({ showNodeToolTip: false })}
                          aria-label="Close"
                      >
                        &times;
                      </button>
                    </div>
                    <NodeToolTip data={this.state.tooltipData} />
                  </div>
              ) : (
                  <div className="node-tooltips">
                    <NodeToolTip
                      data={this.state.tooltipData}
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
    );
  }
}

export default withViewport(RoyalTree);
