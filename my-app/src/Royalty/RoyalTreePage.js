import React, { Component } from 'react';
import Graphin, { GraphinContext, Behaviors } from '@antv/graphin';
import ROYAL_TREE from './trimmed_monarch_data.json';
import MONARCH_PATHS from './monarch_list_paths.json'
import MONARCH_LISTS from './monarch_list_v2_fixed.json';
import FilterPanel from "./filter-panel";
import G6 from "@antv/g6";
import NodeToolTip from "./NodeToolTip";
import {
  convertToChart,
  createLabel,
  getCertainNumberOfConnections,
  getConnectedGraph,
  getFirstNEntries, getMonarchListGraph,
  traceBackToRoot
} from './RoyalTreeUtils';
import './RoyalTreeStyle.css'

/*
TODO:
Add multiple monarchs graphs
Add Family graph option (show all members of a house/family)
Improve loading status
Add on hover/on click description text
 */

const graphTypeOptions = [
  { label: "Family Tree", value: "family_tree"},
  { label: "Monarchs", value: "monarchs"}
]

const EMPTY_NODE = { id: '' };

class RoyalTree extends Component {
  constructor(props) {
    super(props);
    this.ref = React.createRef();

    this.state = {
      data: ROYAL_TREE,
      nodes: {},
      propertyData: {},
      graphType: "monarchs",
      selectedMonarchs: "England",
      highlightedNodes: [],
      rootId: MONARCH_LISTS["England"][0],
      selectedNode: EMPTY_NODE,
      rootOptions: Object.values(ROYAL_TREE).map(node => ({ value: node.id, label: node.label })),
      numberOfAncestors: 2,
      numberOfDescendants: 2,
      filterPanelOpen: true,
      showNodeToolTip: false,
      nodeTooltipX: 0,
      nodeTooltipY: 0,
      loading: false
    };
  }

  onChange = async (evt) => {
    this.setState({ loading: true });
    const family_tree_values = ["selectedRoot", "numberOfAncestors", "numberOfDescendants"]
    const monarchs_values = ["selectedMonarchs"]
    const {name, value} = evt.target;
    let {
      graphType,
      highlightedNodes,
      rootId,
      numberOfAncestors,
      numberOfDescendants,
      selectedMonarchs
    } = this.state;
    let data =  JSON.parse(JSON.stringify(this.state.data));
    let propertyData = JSON.parse(JSON.stringify(this.state.propertyData));
    let nodes = {};

    let parsedValue = value;
    if (["numberOfAncestors", "numberOfDescendants"].includes(name)) {
      parsedValue = parseInt(value);
    }

    if (name === "selectedRoot") {
      rootId = value.value;
    } else if (name === "numberOfAncestors") {
      numberOfAncestors = parsedValue;
    } else if (name === "numberOfDescendants") {
      numberOfDescendants = parsedValue;
    } else if (name === "graphType") {
      graphType = value;
    }
    if (family_tree_values.includes(name)) {
      nodes = await getCertainNumberOfConnections(data, propertyData, rootId, numberOfAncestors, numberOfDescendants);
    }
    if (name === "graphType" || name === "selectedMonarchs") {
      if (graphType === "family_tree") {
        rootId = "Q3044";
        nodes = await getCertainNumberOfConnections(data, propertyData, rootId, numberOfAncestors, numberOfDescendants);
        highlightedNodes = highlightedNodes;
      } else if (graphType === "monarchs") {
        if (name === "selectedMonarchs") {
          selectedMonarchs = value;
        }
        nodes = await getMonarchListGraph(data, propertyData, MONARCH_PATHS[selectedMonarchs]);
        highlightedNodes = MONARCH_LISTS[selectedMonarchs].filter(monarchId => ROYAL_TREE[monarchId]).map(monarchId => ROYAL_TREE[monarchId]);
        rootId = MONARCH_LISTS[selectedMonarchs][0];
      }
    }
    this.setState({
      data,
      propertyData,
      graphType,
      highlightedNodes,
      rootId,
      numberOfAncestors,
      numberOfDescendants,
      selectedMonarchs
    });
    this.createGraph(nodes, highlightedNodes, rootId);
    this.setState({ loading: false });
  };

  bindEvents = (graf) => {
    graf.on('node:mouseenter', evt => {
      const { item } = evt;
      const model = item.getModel();
      const { x, y } = model;
      const point = graf.getCanvasByPoint(x, y);

      this.setState({
        showNodeToolTip: true,
        nodeTooltipX: point.x - 75,
        nodeTooltipY: point.y + 15
      });
    });

    graf.on('node:mouseleave', () => {
      this.setState({ showNodeToolTip: false });
    });

    graf.on('node:click', (evt) => {
      console.log(evt);
      let { selectedNode, highlightedNodes } = this.state;
      if (evt.item._cfg.model.id === selectedNode.id) {
        selectedNode = EMPTY_NODE;
        highlightedNodes = [];
      } else {
        selectedNode = evt.item._cfg.model;
        highlightedNodes = traceBackToRoot(selectedNode, this.state.data[this.state.rootId], this.state.data);
      }
      this.setState({ selectedNode, highlightedNodes });
      this.createGraph(this.state.nodes, highlightedNodes, this.state.rootId);
    });
  };

  componentDidMount() {
    this.onChange({ target: { name: "graphType", value: "monarchs" } });
  }

  createGraph(nodes, highlightedNodes, rootId) {
    console.log("Change Data: ", Object.keys(nodes).length);
    this.setState({ nodes, highlightedNodes, rootId });
    const newConvertedData = convertToChart(nodes, highlightedNodes);
    if (!this.state.graph) {
      const graf = new G6.Graph({
        container: this.ref.current,
        fitView: true,
        modes: {
          default: ["drag-canvas", "zoom-canvas"],
        },
        layout: {
          type: "dagre"
        }
      });
      graf.data(newConvertedData);
      graf.layout();
      graf.render();
      // this.bindEvents(graf); TODO: Reimplement
      this.setState({ graph: graf });
    } else {
      this.state.graph.changeData(newConvertedData);
    }
  }

  render() {
    const { graphType, selectedMonarchs, rootOptions, rootId, numberOfAncestors, numberOfDescendants, filterPanelOpen, showNodeToolTip, nodeTooltipX, nodeTooltipY, loading } = this.state;

    return (
        <div style={{ width: "100vw", height: "100vh" }} ref={this.ref}>
          {showNodeToolTip && <NodeToolTip x={nodeTooltipX} y={nodeTooltipY} />}
          <FilterPanel
              filterPanelOpen={filterPanelOpen}
              graphType={graphType}
              graphTypeOptions={graphTypeOptions}
              selectedMonarchs={selectedMonarchs}
              monarchyOptions={Object.keys(MONARCH_LISTS)}
              selectedRoot={this.state.data.hasOwnProperty(rootId) ? { label: this.state.data[rootId].label, value: rootId } : {}}
              rootOptions={rootOptions}
              selectRoot={evt => this.onChange({ target: { name: "selectedRoot", value: evt } })}
              numberOfAncestors={numberOfAncestors}
              numberOfDescendants={numberOfDescendants}
              onChange={this.onChange}
              toggleFilterPanel={() => this.setState(prevState => ({ filterPanelOpen: !prevState.filterPanelOpen }))}
              loading={loading}
          />
        </div>
    );
  }
}

export default RoyalTree;