import React, { useState, useEffect, EffectCallback, DependencyList, useRef } from 'react';
import ROYAL_TREE from './royaltree_fixed.json';
import MONARCH_LISTS from './monarch_list.json';
import Graphin, { GraphinContext, Behaviors } from '@antv/graphin';
import {
  convertToChart,
  createLabel,
  getCertainNumberOfConnections, getConnectedGraph,
  getFirstNEntries,
  traceBackToRoot
} from './RoyalTreeUtils';
import FilterPanel from "./filter-panel";
import G6 from "@antv/g6";
import NodeToolTip from "./NodeToolTip";

/**
 * TODO:
 * Data:
 *    Generate definitive data from wikipedia
 *    Fix Titles
 *    Fix Families
 *    Fix Dynasties
 * Graph:
 *    Root Mode:
 *      Pick start node
 *      Pick number of nodes to display
 *        # of ancestors from root
 *        # of descendants from root
 *      On selecting node it traces path to root node
 *   Highlight a dynasty
 *   Highlight a house
 *   Highlight a title (Kings of England)
 * Map Mode:
 *    Create map mode
 *    Show place of birth/death
 *    Show marriages between countries
 * Timeline Mode:
 *    Show graph but on a timeline
 *    Show peoples lives (birth/death/marriages/children birth dates)
 */

const useNonInitialEffect = (effect, deps) => {
  const initialRender = useRef(true);

  useEffect(() => {
    let effectReturns = () => {};

    if (initialRender.current) {
      initialRender.current = false;
    } else {
      effectReturns = effect();
    }

    if (effectReturns && typeof effectReturns === 'function') {
      return effectReturns;
    }
  }, deps);
};


const RoyalTree = () => {
  const ref = React.useRef(null);
  const initialRender = useRef(true);
  const graphTypeOptions = [
      { label: "Family Tree", value: "family_tree"},
      { label: "Monarchs", value: "monarchs"}
  ]

  const [graphType, setGraphType] = useState("monarchs");
  const [selectedMonarchs, setSelectedMonarchs] = useState("England");
  const [graphData, setGraphData] = useState({ data: ROYAL_TREE, highlightedNodes: [], rootId: MONARCH_LISTS["England"][0] });
  const [graph, setGraph] = useState();
  const [selectedNode, setSelectedNode] = useState(null);
  const [rootOptions, setRootOptions] = useState(Object.values(ROYAL_TREE).map(node => ({ value: node.id, label: createLabel(node) })));
  const [numberOfAncestors, setNumberOfAncestors] = useState(10);
  const [numberOfDescendants, setNumberOfDescendants] = useState(10);
  const [filterPanelOpen, setFilterPanelOpen] = useState(true);
  // The coordinate of node tooltip
  const [showNodeToolTip, setShowNodeToolTip] = useState(false);
  const [nodeTooltipX, setNodeToolTipX] = useState(0);
  const [nodeTooltipY, setNodeToolTipY] = useState(0);

  const bindEvents = (graf) => {
    // Listen to the mouse event on node
    graf.on('node:mouseenter', evt => {
      const {item} = evt;
      const model = item.getModel();
      const {x, y} = model;
      const point = graf.getCanvasByPoint(x, y);

      setNodeToolTipX(point.x - 75);
      setNodeToolTipY(point.y + 15);
      setShowNodeToolTip(true);
    });

    // Hide the tooltip and the contextMenu when the mouseleave event is activated on the node
    graf.on('node:mouseleave', () => {
      setShowNodeToolTip(false);
    });

    graf.on('node:click', (evt) => {
      setSelectedNode(evt.item._cfg.model);
    });

    graf.on('canvas:click', (evt) => {
      setSelectedNode(null);
    });
  }

  useEffect(() => {
    if (graphType === "family_tree") {
      setGraphData({
        data: getCertainNumberOfConnections(ROYAL_TREE, graphData.rootId, numberOfAncestors, numberOfDescendants),
        highlightedNodes: graphData.highlightedNodes,
        rootId: "/wiki/Charlemagne"
      });
    } else if (graphType === "monarchs") {
      setGraphData({
        data: getConnectedGraph(ROYAL_TREE, MONARCH_LISTS[selectedMonarchs]),
        highlightedNodes: MONARCH_LISTS[selectedMonarchs].filter(monarchId => ROYAL_TREE[monarchId]).map(monarchId => ROYAL_TREE[monarchId]),
        rootId: MONARCH_LISTS[selectedMonarchs][0]
      });
    }
  }, [graphType, selectedMonarchs, graphData.rootId, numberOfAncestors, numberOfDescendants]);

  useNonInitialEffect(() => {
    setSelectedNode(null);
    console.log("Change Data: ", Object.keys(graphData.data).length);
    const newConvertedData = convertToChart(graphData.data, graphData.highlightedNodes);
    if (!graph) {
      const graf = new G6.Graph({
        container: ref.current,
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
      bindEvents(graf);
      setGraph(graf);
    } else {
      graph.changeData(newConvertedData);
    }
  }, [graphData]);

  useNonInitialEffect(() => {
    if (selectedNode) {
       setGraphData({
         data: graphData.data,
         highlightedNodes: traceBackToRoot(selectedNode, graphData.data[graphData.rootId], graphData.data),
         rootId: graphData.rootId
       });
    } else {
      setGraphData({
         data: graphData.data,
         highlightedNodes: [],
         rootId: graphData.rootId
       });
    }
  }, [selectedNode]);

  const onChange = (evt) => {
    const { name, value } = evt.target;
    console.log(name, value);

    let parsedValue = value;
    if (["numberOfAncestors", "numberOfDescendants"].includes(name)) {
      parsedValue = parseInt(value);
    }

    if (name === "selectedRoot") {
      setGraphData({
         data: getCertainNumberOfConnections(ROYAL_TREE, value, numberOfAncestors, numberOfDescendants),
         highlightedNodes: [],
         rootId: value
       });
    } else if (name === "numberOfAncestors") {
      setNumberOfAncestors(parsedValue);
    } else if (name === "numberOfDescendants") {
      setNumberOfDescendants(parsedValue);
    } else if (name === "graphType") {
      setGraphType(value);
    } else if (name === "selectedMonarchs") {
      setSelectedMonarchs(value);
    }
  };

  return (
      <div style={{ width: "100vw", height: "100vh" }} ref={ref}>
        {showNodeToolTip && <NodeToolTip x={nodeTooltipX} y={nodeTooltipY} />}
        <FilterPanel
            filterPanelOpen={filterPanelOpen}
            graphType={graphType}
            graphTypeOptions={graphTypeOptions}
            selectedMonarchs={selectedMonarchs}
            monarchyOptions={Object.keys(MONARCH_LISTS)}
            selectedRoot={{ label: "", value: "" }}
            rootOptions={rootOptions}
            selectRoot={evt => onChange({ target: { name: "selectedRoot", value: evt } })}
            numberOfAncestors={numberOfAncestors}
            numberOfDescendants={numberOfDescendants}
            onChange={onChange}
            toggleFilterPanel={() => setFilterPanelOpen(prevState => !prevState)}
        />
      </div>
  );
};

export default RoyalTree;
