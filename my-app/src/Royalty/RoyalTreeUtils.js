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

export function extractImportantNodes(data, successionList) {
  let importantNodes = successionList.flat();
  importantNodes.forEach(nodeId => {
    if (nodeId in data) {
      if ("father" in data[nodeId]) {
        importantNodes.push(data[nodeId].father);
      }
      if ("mother" in data[nodeId]) {
        importantNodes.push(data[nodeId].mother);
      }
    } else {
      console.log(nodeId);
    }
  });
  let nodeSet = new Set(importantNodes);
  const newData = {};
  Object.keys(data).forEach(nodeId => {
    if (nodeSet.has(nodeId)) {
      newData[nodeId] = data[nodeId];
  }});
  return newData;
}

function extractYear(dateString) {
  const cleanDateString = dateString.replace("+", "");
  const month = cleanDateString.substring(5, 7);
  const day = cleanDateString.substring(8, 10);

  if (month === "00" || day === "00") {
    return parseInt(cleanDateString.substring(0, 4));
  }

  const date = new Date(cleanDateString);
  if (isNaN(date)) {
    return "Invalid Date";
  }
  return date.getUTCFullYear();
}

function createLabel(person) {
  let label = person.label;
  if ('date of birth' in person) {
    label = label + '\n' + extractYear(person['date of birth'])
  } else {
    label = label + '\n Unknown'
  }
  if ('date of death' in person) {
    label = label + '-' + extractYear(person['date of death'])
  } else {
    label = label + '-Unknown'
  }
  return label
}

export function convertToChart(data, highlightedNodes) {
  const SEX_COLORS = {
    male: 'blue',
    female: 'red'
  };

  const highlightedNodeSet = new Set(highlightedNodes);
  const nodeSet = new Set();
  const edges = [];
  const nodes = [];

  Object.values(data).forEach(person => {
    // Create person node
    const node = {
      ...person,
      type: 'circle',
      size: 80,
      label: createLabel(person),
      labelCfg: { position: "bottom" },
      style: {
        fill: person["sex or gender"] ? SEX_COLORS[person["sex or gender"]] : undefined,
        stroke: highlightedNodeSet.has(person.id) ? '#e7e312' : 'black',
        opacity: highlightedNodeSet.has(person.id) ? 1 : 0.5,
        lineWidth: 5
      }
    };

    if ('image' in person && person.image.length > 0) {
      node.icon = {
        img: process.env.PUBLIC_URL + '/monarchy/' + person.id + '.jpg',
        width: 45,
        height: 70,
        show: true
      };
    }

    nodes.push(node);
    nodeSet.add(node.id); // Track all nodes immediately

    // Process spouses
    if (Array.isArray(person.spouse)) {
      person.spouse.forEach(spouseId => {
        if (!data[spouseId]) return;

        const marriageName = getMarriageName(person.id, spouseId);
        if (!nodeSet.has(marriageName)) {
          const spouse = data[spouseId];
          nodes.push({
            id: marriageName,
            label: getMarriageLabel(person.label, spouse.label)
          });
          nodeSet.add(marriageName);

          // Add edges once when creating marriage node
          edges.push({
            source: person.id,
            target: marriageName,
            style: { stroke: SEX_COLORS[person["sex or gender"]] }
          });
          edges.push({
            source: spouseId,
            target: marriageName,
            style: { stroke: SEX_COLORS[spouse["sex or gender"]] }
          });
        }
      });
    }

    // Process parents
    const motherId = person.mother;
    const fatherId = person.father;
    const hasMother = motherId && data[motherId];
    const hasFather = fatherId && data[fatherId];

    if (hasMother && hasFather) {
      const marriageName = getMarriageName(motherId, fatherId);
      if (!nodeSet.has(marriageName)) {
        nodes.push({
          id: marriageName,
          label: getMarriageLabel(data[motherId].label, data[fatherId].label)
        });
        nodeSet.add(marriageName);

        // Add parent edges only once
        edges.push({
          source: motherId,
          target: marriageName,
          style: { stroke: SEX_COLORS.female }
        });
        edges.push({
          source: fatherId,
          target: marriageName,
          style: { stroke: SEX_COLORS.male }
        });
      }
      // Add child edge always
      edges.push({
        source: marriageName,
        target: person.id,
        style: { stroke: 'black' }
      });
    } else if (hasMother) {
      edges.push({
        source: motherId,
        target: person.id,
        style: { stroke: SEX_COLORS.female }
      });
    } else if (hasFather) {
      edges.push({
        source: fatherId,
        target: person.id,
        style: { stroke: SEX_COLORS.male }
      });
    }
  });

  // Final edge validation
  const validEdges = edges.filter(edge =>
      nodeSet.has(edge.source) && nodeSet.has(edge.target)
  );

  return { nodes, edges: validEdges };
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
      if (currentNode.spouse) {
        currentNode.spouse.filter(spouseId => data[spouseId]).forEach(spouseId => nodes[spouseId] = data[spouseId])
      }
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
  return nodes;
}

/**
 * Trace from node back to root, return list of node/edges that make up the path
 * @param targetNode
 * @param root
 * @param data
 */
export function traceBackToRoot(targetNode, root, data) {
  let queue = [{ node: root, path: [] }]; // Initialize queue with start node and an empty path
  let visited = new Set(); // Track visited nodes

  // Search descendants
  while (queue.length > 0) {
    const { node, path } = queue.shift();
    // Skip already visited nodes
    if (visited.has(node.id)) {
      continue;
    }
    // Add current node to the path
    const currentPath = [...path, node];
    // Check if the target node is found
    if (node.id === targetNode.id) {
      return currentPath; // Return the path to the target node
    }
    visited.add(node.id);
    // Add unvisited neighboring nodes to the queue with the updated path
    const issueList = node.issueList;
    if (issueList) {
      issueList.filter(childId => data[childId]).forEach(childId => queue.push({ node: data[childId], path: currentPath }))
    }
  }
  queue = [{ node: root, path: [] }]; // Initialize queue with start node and an empty path
  visited = new Set(); // Track visited nodes
  //Search ancestors
  while (queue.length > 0) {
    const { node, path } = queue.shift();
    // Skip already visited nodes
    if (visited.has(node.id)) {
      continue;
    }
    // Add current node to the path
    const currentPath = [...path, node];
    // Check if the target node is found
    if (node.id === targetNode.id) {
      return currentPath; // Return the path to the target node
    }
    visited.add(node.id);
    // Add unvisited neighboring nodes to the queue with the updated path
    if (node.father && data[node.father]) {
      queue.push({ node: data[node.father], path: currentPath })
    }
    if (node.mother && data[node.mother]) {
      queue.push({ node: data[node.mother], path: currentPath })
    }
  }
  return []; // Return an empty array if the target node is not found
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
          if (curPerson.spouse) {
            curPerson.spouse.filter(spouseId => people[spouseId] && !visited.has(spouseId)).forEach(spouseId => queue.push(spouseId));
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