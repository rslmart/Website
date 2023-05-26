import React, {Component, useContext, useEffect} from 'react';
import ROYAL_TREE from './royaltree_fixed.json';
import Graphin, { IG6GraphEvent, Utils, GraphinData, GraphinContext, Behaviors } from '@antv/graphin';

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

function getMarriageLabel(father, mother) {
  return [father, mother].sort().join(' + ');
}

function convertToChart(data) {
  console.log(import.meta.url);
  const nodeSet = new Set();
  const edges = [];
  const nodes = []
  Object.values(data).forEach(person => {
    const node = {...person};
    node['style'] = {
      label: { value: person.title ? person.name + '\n' + person.title : person.name }
    };
    if (person.sex) {
      node.style['keyshape'] = {
        fill: person.sex === 'male' ? 'blue' : 'red',
        stroke: person.sex === 'male' ? 'blue' : 'red'
      }
    }
    if (person.picture) {
        node.style['icon'] = {
          type: 'image',
          value: process.env.PUBLIC_URL + person.id + '.jpg',
          size: [20, 20],
          clip: {
            r: 10,
          },
        };
    }
    nodes.push(node);
    if (person['spouseList']){
      person['spouseList'].filter(spouseId => data[spouseId] && !nodeSet.has(getMarriageName(person.id, spouseId)))
          .forEach(spouseId => {
            const marriageName = getMarriageName(person.id, spouseId);
            nodes.push({ id: marriageName, style: { label: { value: getMarriageLabel(person.name, data[spouseId]['name']) } } });
            nodeSet.add(marriageName);
            edges.push({ source: person.id, target: marriageName, style: { keyshape: { stroke: person.sex === 'male' ? 'blue' : 'red' }} })
            edges.push({ source: spouseId, target: marriageName, style: { keyshape: { stroke: data[spouseId].sex === 'male' ? 'blue' : 'red' }}  })
          })
    }
    if (person['mother'] && data[person['mother']] && person['father'] && data[person['father']]){
      const marriageName = getMarriageName(person['mother'], person['father']);
      if (!nodeSet.has(marriageName)) {
        nodes.push({ id: marriageName, style: { label: { value: getMarriageLabel(data[person['mother']]['name'], data[person['father']]['name']) } } });
        nodeSet.add(marriageName);
      }
      edges.push({ source: person['mother'], target: marriageName, style: { keyshape: { stroke: 'red' }} })
      edges.push({ source: person['father'], target: marriageName, style: { keyshape: { stroke: 'blue' }}  })
      edges.push({ source: marriageName, target: person.id, style: { keyshape: { stroke: 'black' }}  })
    } else if (person['mother'] && data[person['mother']]){
      edges.push({ source: person['mother'], target: person.id, style: { keyshape: { stroke: 'red' }}  })
    } else if (person['father'] && data[person['father']]){
      edges.push({ source: person['father'], target: person.id, style: { keyshape: { stroke: 'blue' }}  })
    }
  });
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

function findLargestTree(people) {
  let largestTreeNodes = {};
  let visited = new Set();

  // Visit each node, try and explore all nodes from it and form a list
  // If you visit a node, add it to visited
  // When done exploring move to next node, skipping it if already explored
  Object.values(people).forEach(person => {
    if (!visited.has(person.id)) {
      const curNodes = {}
      const queue = [person.id];
      while (queue.length > 0) {
        const curPerson = people[queue.pop()]
        if (!visited.has(curPerson.id)) {
          curNodes[curPerson.id] = curPerson;
          visited.add(curPerson.id)
          if (curPerson.mother && people[curPerson.mother] && !visited.has(curPerson.mother)) {
            queue.push(curPerson.mother);
          }
          if (curPerson.father && people[curPerson.father] && !visited.has(curPerson.father)) {
            queue.push(curPerson.father);
          }
          if (curPerson.spouseList) {
            curPerson.spouseList.filter(spouseId => people[spouseId] && !visited.has(spouseId)).forEach(spouseId => queue.push(spouseId));
          }
          if (curPerson.issueList) {
            curPerson.issueList.filter(childId => people[childId] && !visited.has(childId)).forEach(childId => queue.push(childId));
          }
        }
      }
      if (Object.keys(curNodes).length > Object.keys(largestTreeNodes).length) {
        largestTreeNodes = curNodes;
      }
    }
  });

  return largestTreeNodes;
}

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
    selectedNode: null
  }

  updateSelectedNode = (selectedNode) => this.setState({ selectedNode });

  componentDidMount() {
    this.setState({ data: convertToChart(getFirstNEntries(ROYAL_TREE, 100)) });
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
                <span>{this.state.selectedNode.name}</span>
              </div>
              )}
            </Graphin>
        </div>
    )
  }
};

export default RoyalTree;