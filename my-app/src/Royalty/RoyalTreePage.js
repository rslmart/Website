import React, {Component, useContext, useEffect} from 'react';
import ROYAL_TREE from './royaltree_fixed.json';
import Graphin, { IG6GraphEvent, Utils, GraphinData, GraphinContext, Behaviors } from '@antv/graphin';
import { convertToChart, getFirstNEntries } from './RoyalTreeUtils';
import FilterPanel from "./filter-panel";
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

const SampleBehavior = ({ updateSelectedNode }) => {
  const { graph, apis } = useContext(GraphinContext);

  useEffect(() => {
    const handleClick = (evt) => {
      const node = evt.item;
      const model = node.getModel();
      updateSelectedNode(model);
    };
    graph.on('node:click', handleClick);
    return () => {
      graph.off('node:click', handleClick);
    };
  }, []);
  return null;
};

const { ClickSelect, ZoomCanvas, ActivateRelations } = Behaviors;

class RoyalTree extends Component {
  state = {
    data: {
      nodes: [],
      edges: [],
    },
    selectedRoot: null,
    rootOptions: [],
    selectedNode: null,
    numberOfAncestors: 100,
    numberOfDescendants: 100,
    filterPanelOpen: true
  }

  updateSelectedNode = (selectedNode) => this.setState({ selectedNode });

  componentDidMount() {
    const data = convertToChart(getFirstNEntries(ROYAL_TREE, 100));
    // const data = convertToChart(ROYAL_TREE);
    const rootOptions = data.nodes.map(node => { return { value: node.id, label: node.style.label.value }});
    this.setState({
      selectedRoot: rootOptions.find(option => option.value === "/wiki/Charlemagne"),
      rootOptions,
      data
    });
  }

  selectRoot(evt) {

  }

  onChange(evt) {
    if (evt.target.name === "numberOfAncestors" || evt.target.name === "numberOfDescendants") {
      this.setState({ [evt.target.name]: evt.target.value });

    }
  }

  render() {
    return (
        <div style={{ width: "100vw", height: "100vh" }}>
            <Graphin data={this.state.data} layout={{ type: 'dagre' }} fitView={true}>
              <ZoomCanvas enableOptimize />
              <ActivateRelations trigger="click" resetSelected={true} />
              <SampleBehavior updateSelectedNode={this.updateSelectedNode}/>
              {this.state.selectedNode && (
              <div className="storm-info">
                <dl>
                  <dt>Name</dt>
                  <dd>{this.state.selectedNode.name}</dd>
                </dl>
              </div>
              )}
            </Graphin>
            <FilterPanel
                filterPanelOpen={this.state.filterPanelOpen}
                selectedRoot={this.state.selectedRoot}
                rootOptions={this.state.rootOptions}
                selectRoot={evt => this.selectRoot(evt)}
                numberOfAncestors={this.state.numberOfAncestors}
                numberOfDescendants={this.state.numberOfDescendants}
                onChange={evt => this.onChange(evt)}
                toggleFilterPanel={evt => {this.setState(prevState => ({ filterPanelOpen: !prevState.filterPanelOpen}))}}
            />
        </div>
    )
  }
};

export default RoyalTree;