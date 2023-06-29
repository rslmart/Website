import React, { useState, useEffect, useContext } from 'react';
import ROYAL_TREE from './royaltree_fixed.json';
import Graphin, { GraphinContext, Behaviors } from '@antv/graphin';
import { convertToChart, createLabel, getCertainNumberOfConnections, getFirstNEntries } from './RoyalTreeUtils';
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
 *    Pick start node
 *    Pick number of nodes to display
 *      # of ancestors from root
 *      # of descendants from root
 *   Highlight ancestors
 *   Highlight descendants
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

const RoyalTree = () => {
  const ref = React.useRef(null);

  const [graph, setGraph] = useState();
  const [selectedRoot, setSelectedRoot] = useState({
    "value": "/wiki/Charlemagne",
    "label": "Charlemagne\n/wiki/Holy_Roman_Emperor"
  });
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
  }

  useEffect(() => {
    setNumberOfDescendants(10); // trigger changeData
  }, []);

  useEffect(() => {
    changeData(getCertainNumberOfConnections(ROYAL_TREE, selectedRoot.value, numberOfAncestors, numberOfDescendants));
  }, [selectedRoot, numberOfAncestors, numberOfDescendants]);

  const changeData = (data) => {
    console.log("Change Data");
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
      graf.data(data);
      graf.layout();
      graf.render();
      bindEvents(graf);
      setGraph(graf);
    } else {
      graph.changeData(data);
    }
  };

  const onChange = (evt) => {
    const { name, value } = evt.target;

    if (["selectedRoot", "numberOfAncestors", "numberOfDescendants"].includes(name)) {
      let parsedValue = value;
      if (["numberOfAncestors", "numberOfDescendants"].includes(name)) {
        parsedValue = parseInt(value);
      }

      if (name === "selectedRoot") {
        setSelectedRoot(parsedValue);
      } else if (name === "numberOfAncestors") {
        setNumberOfAncestors(parsedValue);
      } else if (name === "numberOfDescendants") {
        setNumberOfDescendants(parsedValue);
      }
    }
  };

  return (
      <div style={{ width: "100vw", height: "100vh" }} ref={ref}>
        {showNodeToolTip && <NodeToolTip x={nodeTooltipX} y={nodeTooltipY} />}
        <FilterPanel
            filterPanelOpen={filterPanelOpen}
            selectedRoot={selectedRoot}
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
