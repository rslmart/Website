import React, { Component } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import ROYAL_TREE from './Data/data/monarchy_data.json';
import SUCCESSION_TREE from './Data/data/monarchy_family_trees.json';
import MONARCH_LISTS from './Data/data/monarch_list.json';
import FilterPanel from "./filter-panel";
import NodeToolTip from "./NodeToolTip";
import {
  convertToChart,
  extractImportantNodes,
  getCertainNumberOfConnections,
  traceBackToRoot
} from './RoyalTreeUtils';
import './RoyalTreeStyle.css';

cytoscape.use(dagre);

// Constants
const EMPTY_NODE = { id: '' };

class RoyalTree extends Component {
  constructor(props) {
    super(props);
    this.containerRef = React.createRef();
    this.cy = null;

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
      showNodeToolTip: false,
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

    // Add these to handle zoom/pan interactions
    cyInstance.on('tapstart', (evt) => {
      if (evt.target === cyInstance) {
        this.setState({ showNodeToolTip: false });
      }
    });

    cyInstance.on('drag', 'node', () => {
      this.setState({ showNodeToolTip: false });
    });
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

  updateGraph = (data, highlightedNodes) => {
    try {
      const convertedData = this.convertToCytoscapeFormat(
          convertToChart(data, highlightedNodes)
      );

      if (!this.cy) {
        this.cy = this.initializeGraph(this.containerRef.current);
      }

      this.cy.elements().remove();
      this.cy.add(convertedData);

      this.cy.layout({
        name: 'dagre',
        nodeSep: 50,
        rankSep: 100,
        animate: true
      }).run();

      this.cy.fit();

    } catch (error) {
      console.error('Graph rendering error:', error);
    }
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

  componentDidMount() {
    this.handleFilterChange("selectedMonarchs", "England");
    window.addEventListener('resize', this.handleResize);
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

  handleFilterChange = (name, value) => {
    if (name === "selectedMonarchs") {
      const selectedMonarchs = value;
      let newData, newHighlightedNodes, newRootId;

      const monarchList = MONARCH_LISTS[selectedMonarchs] || [];
      const successionList = SUCCESSION_TREE[selectedMonarchs] || [];
      newData = extractImportantNodes(ROYAL_TREE, successionList);
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
    return (
        <div className="royal-tree-container" style={{ position: 'relative' }}>
          <div
              ref={this.containerRef}
              className="cytoscape-container"
          >
          </div>

          {(
              <div className="node-tooltips">
                <NodeToolTip
                  data={this.state.tooltipData}
                />
              </div>
          )}

          <div className="filter-panel-container">
            <FilterPanel
                selectedMonarchs={this.state.selectedMonarchs}
                monarchyOptions={Object.keys(MONARCH_LISTS).sort()}
                selectedRoot={{
                  label: this.state.data[this.state.rootId]?.label || '',
                  value: this.state.rootId
                }}
                rootOptions={this.state.rootOptions}
                onChange={(name, value) => this.handleFilterChange(name, value)}
            />
          </div>
        </div>
    );
  }
}

export default RoyalTree;