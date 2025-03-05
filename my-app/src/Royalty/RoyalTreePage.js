import React, { Component } from 'react';
import ROYAL_TREE from './Data/data/monarchy_data.json';
import SUCCESSION_TREE from './Data/data/monarchy_family_trees.json';
import MONARCH_LISTS from './Data/data/monarch_list.json';
import FilterPanel from "./filter-panel";
import G6 from "@antv/g6";
import NodeToolTip from "./NodeToolTip";
import {
  convertToChart, extractImportantNodes,
  getCertainNumberOfConnections,
  traceBackToRoot
} from './RoyalTreeUtils';
import { getConnectedGraph } from './Data/get-data';

// Constants
const TOOLTIP_OFFSET_X = -75;
const TOOLTIP_OFFSET_Y = 15;
const EMPTY_NODE = { id: '' };
const DEFAULT_LAYOUT_CONFIG = {
  type: "dagre",
  // rankdir: "LR",
  nodesep: 50,
  ranksep: 100
};

class RoyalTree extends Component {
  constructor(props) {
    super(props);
    this.containerRef = React.createRef();
    this.graph = null;

    this.state = {
      selectedMonarchs: "England",
      data: ROYAL_TREE,
      highlightedNodes: [],
      rootId: MONARCH_LISTS["England"][0],
      selectedNode: EMPTY_NODE,
      rootOptions: Object.values(ROYAL_TREE).map(node => ({
        value: node.id,
        label: node.label
      })),
      numberOfAncestors: 10,
      numberOfDescendants: 10,
      filterPanelOpen: true,
      showNodeToolTip: false,
      nodeTooltipX: 0,
      nodeTooltipY: 0,
    };
  }

  handleNodeClick = (nodeModel) => {
    const { rootId, data } = this.state;
    const currentRootNode = data[rootId];

    let newSelectedNode = EMPTY_NODE;
    let newHighlightedNodes = [];

    if (nodeModel.id !== this.state.selectedNode.id) {
      newSelectedNode = nodeModel;
      newHighlightedNodes = currentRootNode
          ? traceBackToRoot(newSelectedNode, currentRootNode, data)
          : [];
    }

    this.setState(
        { selectedNode: newSelectedNode, highlightedNodes: newHighlightedNodes },
        () => this.updateGraph(data, newHighlightedNodes)
    );
  };

  bindGraphEvents = (graphInstance) => {
    graphInstance.on('node:mouseenter', (evt) => {
      const model = evt.item.getModel();
      const point = graphInstance.getCanvasByPoint(model.x, model.y);

      this.setState({
        showNodeToolTip: true,
        nodeTooltipX: point.x + TOOLTIP_OFFSET_X,
        nodeTooltipY: point.y + TOOLTIP_OFFSET_Y
      });
    });

    graphInstance.on('node:mouseleave', () => {
      this.setState({ showNodeToolTip: false });
    });

    graphInstance.on('node:click', (evt) => {
      this.handleNodeClick(evt.item.getModel());
    });
  };

  initializeGraph = (containerEl) => {
    const graphInstance = new G6.Graph({
      container: containerEl,
      width: window.innerWidth,
      height: window.innerHeight,
      modes: {
        default: ["drag-canvas", "zoom-canvas"]
      },
      layout: {
        ...DEFAULT_LAYOUT_CONFIG,
        controlPoints: true
      },
      defaultNode: {
        type: 'circle',
        size: 30,
      },
      defaultEdge: {
        type: 'polyline',
        style: {
          stroke: '#A3B1BF',
          lineWidth: 1.5,
          endArrow: {
            path: G6.Arrow.triangle(8, 6, 12),
            fill: '#A3B1BF'
          }
        }
      }
    });

    this.bindGraphEvents(graphInstance);
    return graphInstance;
  };

  updateGraph = (data, highlightedNodes) => {
    try {
      const convertedData = convertToChart(data, highlightedNodes);

      if (!this.graph) {
        this.graph = this.initializeGraph(this.containerRef.current);
      }

      this.graph.data(convertedData);

      // Use the 'afterlayout' event to ensure fitView runs after layout completion
      this.graph.once('afterlayout', () => {
        this.graph.fitView([20, 20, 20, 20]); // Add padding to ensure visibility
      });

      this.graph.render();

    } catch (error) {
      console.error('Graph rendering error:', error);
    }
  };

  // Add resize handler
  componentDidMount() {
    this.handleFilterChange("selectedMonarchs", "England");
    window.addEventListener('resize', this.handleResize);
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.handleResize);
    if (this.graph) {
      this.graph.destroy();
    }
  }

  handleResize = () => {
    if (this.graph) {
      this.graph.changeSize(window.innerWidth, window.innerHeight);
      this.graph.fitView();
    }
  };

  handleFilterChange = (name, value) => {
    if (name === "selectedMonarchs") {
        const selectedMonarchs = value;
        let newData, newHighlightedNodes, newRootId;

        const monarchList = MONARCH_LISTS[selectedMonarchs] || [];
        const successionList = SUCCESSION_TREE[selectedMonarchs] || [];
        newData = extractImportantNodes(ROYAL_TREE, successionList)
        console.log(newData)
        newHighlightedNodes = monarchList;
        newRootId = monarchList[0] || '';

        this.setState(
            {
              data: newData,
              highlightedNodes: newHighlightedNodes,
              rootId: newRootId,
              selectedMonarchs
            },
            () => this.updateGraph(newData, newHighlightedNodes)
        );
    }
  };

  render() {
    const {
      data,
      rootId,
      selectedMonarchs,
      numberOfAncestors,
      numberOfDescendants,
      filterPanelOpen,
      showNodeToolTip,
      nodeTooltipX,
      nodeTooltipY
    } = this.state;

    return (
        <div style={{ width: "100vw", height: "100vh" }} ref={this.containerRef}>
          {showNodeToolTip && <NodeToolTip x={nodeTooltipX} y={nodeTooltipY} />}

          <FilterPanel
              filterPanelOpen={filterPanelOpen}
              selectedMonarchs={selectedMonarchs}
              monarchyOptions={Object.keys(MONARCH_LISTS)}
              selectedRoot={{
                label: data[rootId]?.label || '',
                value: rootId
              }}
              rootOptions={this.state.rootOptions}
              numberOfAncestors={numberOfAncestors}
              numberOfDescendants={numberOfDescendants}
              onChange={(name, value) => this.handleFilterChange(name, value)}
              toggleFilterPanel={() => this.setState(prev => ({
                filterPanelOpen: !prev.filterPanelOpen
              }))}
          />
        </div>
    );
  }
}

export default RoyalTree;