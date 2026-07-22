import React, { Component } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import FilterPanel from "./filter-panel";
import SearchPanel from "./SearchPanel";
import NodeToolTip from "./NodeToolTip";
import HelpPanel from "./help-panel";
import { convertToChart, mergeMonarchies, DEFAULT_BRIDGE_OPTIONS, DEFAULT_VISIBLE_RANKS } from './RoyalTreeUtils';
import './RoyalTreeStyle.css';

cytoscape.use(dagre);

// Constants
const EMPTY_NODE = { id: '' };
const DEFAULT_MONARCHY = "England";
const HELP_SEEN_KEY = "royaltyHelpSeen";

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
      helpOpen: (() => {
        try {
          return !window.localStorage.getItem(HELP_SEEN_KEY);
        } catch (e) {
          return true;
        }
      })(),
      loading: true,
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
            'shape': 'rectangle',
            'width': 80,
            'height': 100,
            'label': 'data(label)',
            'text-valign': 'bottom',
            'text-wrap': 'wrap',
            'text-max-width': 120,
            'text-margin-y': 5,
            'background-color': 'data(color)',
            'border-color': 'data(borderColor)',
            'border-width': 5,
            'background-image': 'data(image)',
            'background-fit': 'cover',
            'opacity': 'data(opacity)',
            'padding': '10px'
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
            'font-size': '14'
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
            'width': 5,
            'height': 5,
            'shape': 'circle',
            'background-color': '#888',
            'border-color': '#666',
            'border-width': 2,
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

    // Force initial resize
    setTimeout(() => {
      cy.resize();
      cy.fit();
    }, 0);

    return cy;
  };

  updateGraph = (data, highlightedNodes, sharedNodes = new Set(), nodeMonarchyIndex = {}) => {
    try {
      const successionEdges = this.state.showSuccession ? this.state.successionEdges : [];
      const convertedData = this.convertToCytoscapeFormat(
          convertToChart(
              data, highlightedNodes, sharedNodes, nodeMonarchyIndex,
              successionEdges, this.state.showSuccession, this.state.memberFlag,
          )
      );

      if (!this.cy) {
        this.cy = this.initializeGraph(this.containerRef.current);
      }

      this.cy.elements().remove();
      if (convertedData.length === 0) {
        // Blank selection: nothing to lay out or fit.
        return;
      }
      this.cy.add(convertedData);
      this.layoutByComponents();

    } catch (error) {
      console.error('Graph rendering error:', error);
    }
  };

  // Parse a Wikidata date string ("+1650-...", "-0069-...") to a signed year.
  parseYear = (dateStr) => {
    if (!dateStr) return null;
    const digits = String(dateStr).replace(/^[+-]/, '').split('-')[0];
    const year = parseInt(digits, 10);
    if (Number.isNaN(year)) return null;
    return String(dateStr).startsWith('-') ? -year : year;
  };

  // dagre ranks the y-axis by generation depth, not time, and interleaves
  // disconnected components so unrelated dynasties overlap. Instead we lay out
  // each connected component on its own, tile them left-to-right so they can't
  // collide, and shift each onto a shared birth-year axis so people from
  // different eras don't end up sharing a row.
  layoutByComponents = () => {
    const cy = this.cy;
    // Lay out on the bloodline graph only. Succession edges connect monarchs
    // across dynasties/eras and would otherwise merge unrelated components and
    // distort dagre's generational ranking; they just ride on top afterward.
    const layoutEles = cy.elements().filter(el => el.isNode() || el.data('relation') !== 'succession');
    const components = layoutEles.components();
    if (!components.length) return;

    // ~ dagre's rank spacing (200px/generation) over a ~25yr generation.
    const PX_PER_YEAR = 8;
    const COMPONENT_GAP = 140;

    try {
      const infos = components.map(comp => {
        comp.layout({ name: 'dagre', nodeSep: 50, rankSep: 100, animate: false }).run();
        const years = comp.nodes()
            .map(n => this.parseYear(n.data('date of birth')))
            .filter(y => y != null)
            .sort((a, b) => a - b);
        const medianYear = years.length ? years[Math.floor(years.length / 2)] : null;
        return { comp, bb: comp.boundingBox(), medianYear };
      });

      const knownYears = infos.map(i => i.medianYear).filter(y => y != null);
      const refYear = knownYears.length ? Math.min(...knownYears) : 0;

      // Read left-to-right in chronological order, like a timeline.
      infos.sort((a, b) => (a.medianYear ?? Infinity) - (b.medianYear ?? Infinity));

      let xOffset = 0;
      infos.forEach(({ comp, bb, medianYear }) => {
        const dx = xOffset - bb.x1;
        const dy = medianYear != null
            ? (medianYear - refYear) * PX_PER_YEAR - (bb.y1 + bb.y2) / 2
            : -bb.y1;
        comp.shift({ x: dx, y: dy });
        xOffset += bb.w + COMPONENT_GAP;
      });

      cy.fit(undefined, 40);
    } catch (error) {
      // Fall back to a single whole-graph layout if component packing fails.
      console.error('Component layout failed, falling back to dagre:', error);
      cy.layout({ name: 'dagre', nodeSep: 50, rankSep: 100, animate: false }).run();
      cy.fit(undefined, 40);
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
    window.removeEventListener('resize', this.handleResize);
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
            error: null,
          },
          () => this.updateGraph({}, [])
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
  renderMerged = (payloads, selected, bridgeOptions, rankOptions) => {
    const {
      data,
      highlightedNodes,
      sharedNodes,
      nodeMonarchyIndex,
      memberCounts,
      sharedCount,
      monarchOrder,
      successionEdges,
      membership,
      memberFlag,
      peopleList,
      sharedList,
    } = mergeMonarchies(payloads, selected, bridgeOptions, rankOptions);

    this.setState(
        {
          data,
          highlightedNodes,
          sharedNodes,
          nodeMonarchyIndex,
          memberCounts,
          sharedCount,
          monarchOrder,
          successionEdges,
          membership,
          memberFlag,
          sharedInfo: null,
          peopleList,
          sharedList,
          rootId: highlightedNodes[0] || '',
          loading: false,
        },
        () => this.updateGraph(data, highlightedNodes, sharedNodes, nodeMonarchyIndex)
    );
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

  handleToggleSuccession = (showSuccession) => {
    this.setState({ showSuccession }, () => {
      this.updateGraph(
          this.state.data,
          this.state.highlightedNodes,
          this.state.sharedNodes,
          this.state.nodeMonarchyIndex,
      );
    });
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
    return (
        <div className="royal-tree-container" style={{ position: 'relative' }}>
          <div
              ref={this.containerRef}
              className="cytoscape-container"
          >
          </div>

          {this.state.loading && (
              <div className="royal-tree-status">Loading…</div>
          )}
          {this.state.error && !this.state.loading && (
              <div className="royal-tree-status royal-tree-error">
                Failed to load data: {this.state.error}
              </div>
          )}

          {this.state.showNodeToolTip && (
              <div className="node-tooltips">
                <NodeToolTip
                  data={this.state.tooltipData}
                />
              </div>
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

          <div className="search-panel-container">
            <SearchPanel
                people={this.state.peopleList}
                sharedPeople={this.state.sharedList}
                monarchOrder={this.state.monarchOrder}
                onZoomTo={this.zoomToNode}
            />
          </div>

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

          <HelpPanel
              open={this.state.helpOpen}
              onOpen={() => this.setState({ helpOpen: true })}
              onClose={this.closeHelp}
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

export default RoyalTree;
