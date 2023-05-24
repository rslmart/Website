import React, {Component} from 'react';
import ROYAL_TREE from './royaltree_fixed.json';
import Graphin, { Behaviors } from '@antv/graphin';

function getFirstNEntries(obj, n) {
  const entries = Object.entries(obj).slice(0, n);
  const result = {};

  for (const [key, value] of entries) {
    result[key] = value;
  }

  return result;
}

function getMarriageName(father, mother) {
  return [father, mother].sort().join('');
}

function convertToChart(data) {
  const nodeSet = new Set();
  const edges = [];
  const nodes = []
  Object.values(data).forEach(person => {
    const node = {...person};
    node['style'] = {
      label: { value: person.name }
    };
    if (person.sex) {
      node.style['fill'] = person.sex === 'male' ? 'blue' : 'red';
      node.style['stroke'] = person.sex === 'male' ? 'blue' : 'red';
    }
    if (person.picture) {
      node.style['icon'] = {
        type: 'image',
        value: person.picture,
        size: [20, 20],
        clip: {
          r: 10,
        }
      }
    }
    nodes.push(node);
    if (person['spouseList']){
      person['spouseList'].filter(spouseId => data[spouseId] && !nodeSet.has(getMarriageName(person.id, spouseId)))
          .forEach(spouseId => {
            const marriageName = getMarriageName(person.id, spouseId);
            nodes.push({ id: marriageName, style: { label: { value: marriageName } } });
            nodeSet.add(marriageName);
          })
    }
    if (person['mother'] && data[person['mother']] && person['father'] && data[person['father']]){
      const marriageName = getMarriageName(person['mother'], person['father']);
      if (!nodeSet.has(marriageName)) {
        nodes.push({ id: marriageName, style: { label: { value: marriageName } } });
        nodeSet.add(marriageName);
      }
      edges.push({ source: person['mother'], target: marriageName })
      edges.push({ source: person['father'], target: marriageName })
      edges.push({ source: marriageName, target: person.id })
    } else if (person['mother'] && data[person['mother']]){
      edges.push({ source: person['mother'], target: person.id })
    } else if (person['father'] && data[person['father']]){
      edges.push({ source: person['father'], target: person.id })
    }
  });
  // topologicalSort(nodes, edges);
  console.log(nodes);
  return { nodes, edges };
}

function topologicalSort(nodes, edges) {
  // Create a map to store the adjacency list
  const adjacencyList = new Map();

  // Create a map to store the indegree of each node
  const indegreeMap = new Map();

  // Build the adjacency list and calculate the indegree of each node
  for (const node of nodes) {
    adjacencyList.set(node.id, []);
    indegreeMap.set(node.id, 0);
  }

  for (const edge of edges) {
    const { source, target } = edge;
    adjacencyList.get(source).push(target);
    indegreeMap.set(target, indegreeMap.get(target) + 1);
  }

  // Perform topological sort using modified Kahn's algorithm
  const sortedNodes = [];
  const queue = [];

  // Enqueue nodes with indegree 0
  for (const [node, indegree] of indegreeMap) {
    if (indegree === 0) {
      queue.push(node);
    }
  }

  // Create a map to track the parent nodes
  const parentMap = new Map();

  while (queue.length > 0) {
    const parent = queue.shift();
    const children = adjacencyList.get(parent);
    const rank = parentMap.has(parent) ? parentMap.get(parent) : 0;

    // Assign the same rank to all children of the parent
    for (const child of children) {
      const indegree = indegreeMap.get(child) - 1;
      indegreeMap.set(child, indegree);

      if (indegree === 0) {
        queue.push(child);
      }

      const childRank = rank + 1;
      const existingRank = parentMap.get(child);
      parentMap.set(child, existingRank ? Math.max(existingRank, childRank) : childRank);
    }

    sortedNodes.push(parent);
  }

  // Assign rank field to the sorted nodes
  for (let i = 0; i < sortedNodes.length; i++) {
    const nodeId = sortedNodes[i];
    const node = nodes.find(node => node.id === nodeId);
    node.rank = parentMap.get(nodeId);
  }

  // Return the sorted nodes with assigned rank
  return nodes;
}

const { DragCanvas, ZoomCanvas, DragNode, ActivateRelations } = Behaviors;

class RoyalTree extends Component {
  state = {
    data: {
      nodes: [
        {
          id: 'node-0',
          x: 100,
          y: 100,
        },
        {
          id: 'node-1',
          x: 200,
          y: 200,
        },
        {
          id: 'node-2',
          x: 100,
          y: 300,
        },
      ],
      edges: [
        {
          source: 'node-0',
          target: 'node-1',
        },
      ],
    }
  }

  componentDidMount() {
    this.setState({ data: convertToChart(getFirstNEntries(ROYAL_TREE, 1000)) });
  }

  render() {
    return (
        <div style={{ width: "100vw", height: "100vh" }}>
            <Graphin data={this.state.data} layout={{ type: 'dagre' }}>
              <ZoomCanvas disabled />
            </Graphin>
        </div>
    )
  }
};

export default RoyalTree;