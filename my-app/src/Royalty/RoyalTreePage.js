import React, {Component} from 'react';
import ROYAL_DATA from "./royaltree.json"
import Graph from "react-graph-vis";

class RoyalTree extends Component {
  state = {
    graph: this.convertToGraph(ROYAL_DATA, "/wiki/Charlemagne"),
    options: {
      layout: {
        hierarchical: true
      },
      edges: {
        color: "#000000"
      },
      height: "500px"
    }
  }

  events = {
    select: function(event) {
      var { nodes, edges } = event;
    }
  };

  convertToGraph(data, personId) {
    console.log("Loading ")
    // nodes: [
    //   { id: 1, label: "Node 1", title: "node 1 tootip text" },
    //   { id: 2, label: "Node 2", title: "node 2 tootip text" }
    // ],
    //     edges: [
    //   { from: 1, to: 2 }
    // ]
    const graph = { nodes: [], edges: []};
    graph.nodes = Object.values(data).map(person =>
      { return { id: person.id, label: person.name, title: person.name} }
    )
    Object.values(data).forEach((person, i) => {
      console.log(i)
      if (person.spouseList) {
        person.spouseList.forEach(spouseId => graph.edges.push({ from: person.id, to: spouseId }))
      }
      if (person.issueList) {
        person.issueList.forEach(childId => graph.edges.push({ from: person.id, to: childId }))
      }
      if (person.father) {
        graph.edges.push({ from: person.father, to: person.id })
      }
      if (person.mother) {
        graph.edges.push({ from: person.mother, to: person.id })
      }
    })
    return graph;
  }

  render() {
    return (
        <div id="treeWrapper" style={{width: "100vw", height: "100vh"}}>
          <Graph
              graph={this.state.graph}
              options={this.state.options}
              events={this.events}
          />
        </div>
    )
  }
}

export default RoyalTree