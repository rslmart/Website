import React, { Component } from 'react';
import ROYAL_TREE from './Data/data/England_labelled.json';
import MONARCH_LISTS from './Data/data/monarch_list.json';
import FilterPanel from "./filter-panel";
import G6 from "@antv/g6";
import NodeToolTip from "./NodeToolTip";
import {
  convertToChart,
  createLabel,
  getCertainNumberOfConnections,
  getFirstNEntries,
  traceBackToRoot
} from './RoyalTreeUtils';
import {
  getConnectedGraph,
} from './Data/get-data';

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
      graphType: "monarchs",
      selectedMonarchs: "England",
      data: ROYAL_TREE,
      highlightedNodes: [],
      rootId: MONARCH_LISTS["England"][0],
      selectedNode: EMPTY_NODE,
      rootOptions: Object.values(ROYAL_TREE).map(node => ({ value: node.id, label: node.label })),
      numberOfAncestors: 10,
      numberOfDescendants: 10,
      filterPanelOpen: true,
      showNodeToolTip: false,
      nodeTooltipX: 0,
      nodeTooltipY: 0,
    };
  }

  onChange = (evt) => {
    const family_tree_values = ["selectedRoot", "numberOfAncestors", "numberOfDescendants"]
    const monarchs_values = ["selectedMonarchs"]
    const { name, value } = evt.target;
    let { data, graphType, highlightedNodes, rootId, numberOfAncestors, numberOfDescendants, selectedMonarchs } = this.state;

    let parsedValue = value;
    if (["numberOfAncestors", "numberOfDescendants"].includes(name)) {
      parsedValue = parseInt(value);
    }

    if (name === "selectedRoot") {
      rootId =  value.value;
    } else if (name === "numberOfAncestors") {
      numberOfAncestors = parsedValue;
    } else if (name === "numberOfDescendants") {
      numberOfDescendants = parsedValue;
    } else if (name === "graphType") {
      graphType = value;
    }
    if (family_tree_values.includes(name)) {
      data = getCertainNumberOfConnections(ROYAL_TREE, rootId, numberOfAncestors, numberOfDescendants);
    }
    if (name === "graphType" || name === "selectedMonarchs") {
      if (graphType === "family_tree") {
        rootId = "/wiki/Charlemagne";
        data = getCertainNumberOfConnections(ROYAL_TREE, rootId, numberOfAncestors, numberOfDescendants);
        highlightedNodes = highlightedNodes;
      } else if (graphType === "monarchs") {
        if (name === "selectedMonarchs") {
          selectedMonarchs = value;
        }
        data = getConnectedGraph(ROYAL_TREE, MONARCH_LISTS[selectedMonarchs]);
        highlightedNodes = MONARCH_LISTS[selectedMonarchs].filter(monarchId => ROYAL_TREE[monarchId]).map(monarchId => ROYAL_TREE[monarchId]);
        rootId = MONARCH_LISTS[selectedMonarchs][0];
      }
    }
    this.setState({ data, graphType, highlightedNodes, rootId, numberOfAncestors, numberOfDescendants, selectedMonarchs });
    this.createGraph(data, highlightedNodes, rootId);
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
        highlightedNodes = traceBackToRoot(selectedNode, ROYAL_TREE[this.state.rootId], this.state.data);
      }
      this.setState({ selectedNode, highlightedNodes });
      this.createGraph(this.state.data, highlightedNodes, this.state.rootId);
    });
  };

  componentDidMount() {
    this.onChange({ target: { name: "graphType", value: "family_tree" } });
  }

  createGraph(data, highlightedNodes, rootId) {
    console.log("Change Data: ", Object.keys(data).length);
    this.setState({ data, highlightedNodes, rootId });
    const newConvertedData = convertToChart(data, highlightedNodes);
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
      this.bindEvents(graf);
      this.setState({ graph: graf });
    } else {
      this.state.graph.changeData(newConvertedData);
    }
  }

  render() {
    const { graphType, selectedMonarchs, rootOptions, rootId, numberOfAncestors, numberOfDescendants, filterPanelOpen, showNodeToolTip, nodeTooltipX, nodeTooltipY } = this.state;

    return (
        <div style={{ width: "100vw", height: "100vh" }} ref={this.ref}>
          {showNodeToolTip && <NodeToolTip x={nodeTooltipX} y={nodeTooltipY} />}
          <FilterPanel
              filterPanelOpen={filterPanelOpen}
              graphType={graphType}
              graphTypeOptions={graphTypeOptions}
              selectedMonarchs={selectedMonarchs}
              monarchyOptions={Object.keys(MONARCH_LISTS)}
              selectedRoot={{ label: ROYAL_TREE[rootId].label, value: rootId }}
              rootOptions={rootOptions}
              selectRoot={evt => this.onChange({ target: { name: "selectedRoot", value: evt } })}
              numberOfAncestors={numberOfAncestors}
              numberOfDescendants={numberOfDescendants}
              onChange={this.onChange}
              toggleFilterPanel={() => this.setState(prevState => ({ filterPanelOpen: !prevState.filterPanelOpen }))}
          />
        </div>
    );
  }
}

export default RoyalTree;