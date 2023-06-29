export function getFirstNEntries(obj, n) {
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

export function createLabel(person) {
  return person.title ? person.name + '\n' + person.title : person.name
}

export function convertToChart(data) {
  const nodeSet = new Set();
  let edges = [];
  const nodes = []
  Object.values(data).forEach(person => {
    const node = {...person};
    node['type'] = 'circle';
    node['size'] = 50;
    node['label'] = createLabel(person);
    node['labelCfg'] = { position: "bottom" };
    node['style'] = {};
    if (person.sex) {
      node.style = {
        fill: person.sex === 'male' ? 'blue' : 'red',
        stroke: person.sex === 'male' ? 'blue' : 'red',
        opacity: 0.5,
        lineWidth: 2
      }
    }
    if (person.picture) {
        node['icon'] = {
          img: process.env.PUBLIC_URL + person.id + '.jpg',
          width: 30,
          height: 40,
          show: true
        };
    }
    nodes.push(node);
    if (person['spouseList']){
      person['spouseList'].filter(spouseId => data[spouseId] && !nodeSet.has(getMarriageName(person.id, spouseId)))
          .forEach(spouseId => {
            const marriageName = getMarriageName(person.id, spouseId);
            nodes.push({ id: marriageName, label: getMarriageLabel(person.name, data[spouseId]['name']) });
            nodeSet.add(marriageName);
            edges.push({ source: person.id, target: marriageName, style: { stroke: person.sex === 'male' ? 'blue' : 'red' } })
            edges.push({ source: spouseId, target: marriageName, style: { stroke: data[spouseId].sex === 'male' ? 'blue' : 'red' }  })
          })
    }
    if (person['mother'] && data[person['mother']] && person['father'] && data[person['father']]){
      const marriageName = getMarriageName(person['mother'], person['father']);
      if (!nodeSet.has(marriageName)) {
        nodes.push({ id: marriageName, label: getMarriageLabel(data[person['mother']]['name'], data[person['father']]['name']) });
        nodeSet.add(marriageName);
      }
      edges.push({ source: person['mother'], target: marriageName, style: { stroke: 'red' } })
      edges.push({ source: person['father'], target: marriageName, style: { stroke: 'blue' } })
      edges.push({ source: marriageName, target: person.id, style: { stroke: 'black' } })
    } else if (person['mother'] && data[person['mother']]){
      edges.push({ source: person['mother'], target: person.id, style: { stroke: 'red' } })
    } else if (person['father'] && data[person['father']]){
      edges.push({ source: person['father'], target: person.id, style: { stroke: 'blue' } })
    }
  });
  // Need to filter out edges to missing nodes
  nodes.forEach(node => nodeSet.add(node.id));
  edges = edges.filter(edge => nodeSet.has(edge.target) && nodeSet.has(edge.source));
  return { nodes, edges };
}

export function getCertainNumberOfConnections(data, rootId, numberOfAncestors, numberOfDescendants) {
  const nodes = {};
  // Get descendants
  let visited = new Set();
  let queue = [{ currentNodeId: rootId, level: 0 }];
  queue.push(rootId);
  visited.add(rootId);
  while (queue.length > 0) {
    const { currentNodeId, level } = queue.shift();
    if (level === numberOfDescendants) {
      break;
    }
    if (data[currentNodeId]) {
      const currentNode = data[currentNodeId];
      nodes[currentNodeId] = currentNode;
      if (currentNode.issueList) {
        currentNode.issueList.filter(childId => !visited.has(childId)).forEach(childId => {
          visited.add(childId);
          queue.push({ currentNodeId: childId, level: level + 1 })
        });
      }
    }
  }

  // Get ancestors
  visited = new Set();
  queue = [{ currentNodeId: rootId, level: 0 }];
  queue.push(rootId);
  visited.add(rootId);
  while (queue.length > 0) {
    const { currentNodeId, level } = queue.shift();
    if (level === numberOfAncestors) {
      break;
    }
    if (data[currentNodeId]) {
      const currentNode = data[currentNodeId];
      nodes[currentNodeId] = currentNode;
      if (currentNode.father) {
        visited.add(currentNode.father);
        queue.push({currentNodeId: currentNode.father, level: level + 1})
      }
      if (currentNode.mother) {
        visited.add(currentNode.mother);
        queue.push({currentNodeId: currentNode.mother, level: level + 1})
      }
    }
  }
  return convertToChart(nodes);
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