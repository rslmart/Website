import wdk from 'wikibase-sdk/wikidata.org'

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

export function convertToChart(data, highlightedNodes) {
  const highlightedNodeSet = new Set(highlightedNodes.map(node => node.id));
  const nodeSet = new Set();
  let edges = [];
  const nodes = []
  Object.values(data).forEach(person => {
    const node = {...person};
    node['type'] = 'circle';
    node['size'] = 80;
    node['label'] = createLabel(person);
    node['labelCfg'] = { position: "bottom" };
    node['style'] = {};
    if (person.sex) {
      node.style = {
        fill: person.sex === 'male' ? 'blue' : 'red',
        stroke: highlightedNodeSet.has(person.id) ? '#e7e312' : 'black',
        opacity: highlightedNodeSet.has(person.id) ? 1 : 0.5,
        lineWidth: 5
      }
    }
    if (person.picture) {
        node['icon'] = {
          img: process.env.PUBLIC_URL + person.id + '.jpg',
          width: 45,
          height: 70,
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

const propertyMap= {
  'P106': 'occupation',
  'P109': 'signature',
  'P119': 'place of burial',
  'P140': 'religion or worldview',
  'P1412': 'languages spoken, written or signed',
  'P1441': 'present in work',
  'P1442': 'image of grave',
  'P1543': 'monogram',
  'P172': 'ethnic group',
  'P18': 'image',
  'P19': 'place of birth',
  'P20': 'place of death',
  'P21': 'sex or gender',
  'P22': 'father',
  'P2348': 'time period',
  'P25': 'mother',
  'P2561': 'name',
  'P26': 'spouse',
  'P27': 'country of citizenship',
  'P31': 'instance of',
  'P3373': 'sibling',
  'P39': 'position held',
  'P40': 'child',
  'P411': 'canonization status',
  'P451': 'unmarried partner',
  'P509': 'cause of death',
  'P53': 'family',
  'P569': 'date of birth',
  'P570': 'date of death',
  'P580': 'start time',
  'P582': 'end time',
  'P841': 'feast day',
  'P97': 'noble title',
  'P156': 'followed by',
  'P155': 'follows',
  'P1365': 'replace',
  'P1366': 'replaced by'
};

/**
 * Fetch lists of objects from wikidata in batches of 50 (the limit).
 * @param ids
 * @returns {{}}
 */
export async function fetchIdsFromWikiData(ids) {
  console.log("Ids to fetch", ids);
  const toReturn = {};
  let start = 0;
  let end = 50;
  let idsToFetch = ids.slice(start, end);
  while (idsToFetch.length > 0) {
    const url = wdk.getEntities({
      ids: idsToFetch,
      languages: ['en']
    });
    const {entities} = await fetch(url).then(res => res.json());
    Object.entries(entities).forEach(([key, value]) => toReturn[key] = value);
    start += 50;
    end += 50;
    idsToFetch = ids.slice(start, end);
  }
  return toReturn;
}

/**
 * Transform data from id to denormalized data
 *   'noble title' to gather 'start time:P580', 'end time:P582', 'followed by:P156', 'follows:P155'
 *   'spouse' to gather 'start time:P580', 'end time:P582'
 *   'unmarried partner' to gather 'start time:P580'
 *   'position held' to gather 'start time:P580', 'end time:P582', 'replace:P1365', 'replaced by:P1366'
 * @param propertyData already transformed properties
 * @param entites just retrieved properties we need to transform
 * @param property property id ("noble title")
 * @param valueList list of ids to replace with transformed data
 */
function transformPerson(propertyData, entities, personToTransform) {
  const person = {};
  console.log("Person to transform", personToTransform);
  Object.entries(personToTransform).forEach(([property, value]) => {
    switch (property) {
      case "label": case "description":
        person[property] = value;
        break;
      case "instance of": case "sex or gender": case "place of birth": case "place of death": case "cause of death":
      case "canonization status": case "feast day":
        if (value[0] && value[0].id) {
          if (!propertyData.hasOwnProperty(value[0].id)) {
            let propertyValue = entities[value[0].id];
            propertyValue = {
              label: propertyValue.labels.en.value,
              description: propertyValue.descriptions && propertyValue.descriptions.en && propertyValue.descriptions.en.value,
              id: value[0].id
            }
            propertyData[value[0].id] = propertyValue;
          }
          person[property] = propertyData[value[0].id]
        }
        break;
      case "country of citizenship": case "place of burial": case "family":
      case "languages spoken, written or signed": case "occupation": case "ethnic group":
      case "religion or worldview": case "time period":
        value.filter(val => !!val.id).forEach(val => {
          if (!propertyData.hasOwnProperty(val.id)) {
            let entityValue = entities[val.id];
            const propertyValue = {
              label: entityValue.labels.en.value,
              description: entityValue.descriptions && entityValue.descriptions.en && entityValue.descriptions.en.value,
              id: val.id
            }
            propertyData[val.id] = propertyValue;
          }
          person.hasOwnProperty(property)
              ? person[property].push(propertyData[val.id])
              : (person[property] = [propertyData[val.id]]);
        })
        break;
      case "noble title": case "position held":
        // If we have it in propertyData we still need to deal with the qualifiers
        value.forEach(val => {
          if (!propertyData.hasOwnProperty(val.id)) {
            let entityValue = entities[val.id];
            const propertyValue = {
              label: entityValue.labels.en.value,
              description: entityValue.descriptions && entityValue.descriptions.en && entityValue.descriptions.en.value,
              id: val.id
            }
            propertyData[val.id] = propertyValue;
          }
          const propData = propertyData[val.id];
          if (val.hasOwnProperty("qualifiers")) {
            Object.entries(val.qualifiers).filter(([qKey, qVal]) => !!qVal[0].datavalue).forEach(([qKey, qVal]) => {
              propData[propertyMap[qKey]] = qVal[0].datatype === 'time' ? qVal[0].datavalue.value.time : qVal[0].datavalue.value.id;
            })
          }
          person.hasOwnProperty(property)
              ? person[property].push(propData)
              : (person[property] = [propData]);
        })
        break;
      case "date of birth": case "date of death":
        if (value.length > 0 && !!value[0]["time"]) {
          person[property] = value[0]["time"]; // javascript time object?
        }
        break;
      case "mother": case "father":
        if (value.length > 0 && !!value[0]["id"]) {
          person[property] = value[0]["id"];
        }
        break;
      case "sibling": case "spouse": case "unmarried partner": case "child":
        person[property] = value.map(val => {
          const p = { id: val.id }
          if (val.hasOwnProperty("qualifiers")) {
            Object.entries(val.qualifiers).filter(([qKey, qVal]) => !!qVal[0].datavalue).forEach(([qKey, qVal]) => {
              p[propertyMap[qKey]] = qVal[0].datatype === 'time' ? qVal[0].datavalue.value.time : qVal[0].datavalue.value.id;
            })
          }
          return p;
        });
        break;
      default:
        if (value) {
          person[property] = value;
        }
        break;
    }
  });
  return person;
}

/**
 * Take person and denormalize data.
 * @param propertyData property to id map, properties that have already been fetched, also update.
 * @param person to be transformed.
 */
export async function fetchProperties(propertyData, person) {
  // Gather ids for all, fetch ids, then replace
  const keysToRetrieve = new Set(["instance of", "sex or gender", "country of citizenship", "noble title", "place of birth", "place of death", "cause of death", "place of burial", "family", "languages spoken, written or signed", "occupation", "position held", "ethnic group", "religion or worldview", "canonization status", "feast day", "time period"])
  const ids = Object.entries(person)
      .filter(([key, value]) => keysToRetrieve.has(key))
      .flatMap(([key, value]) => value.filter(entity => entity?.id && !(entity.id in propertyData)))
      .map(entity => entity.id);
  const entities = await fetchIdsFromWikiData(ids);
  const transformedPerson = transformPerson(propertyData, entities, person);
  return transformedPerson;
}

/**
 * Wrapper around fetchPeople() to just get one person
 * @param nodes
 * @param id
 * @returns {Promise<*>} denormalized person
 */
export async function fetchPerson(nodes, id) {
  const n = await fetchPeople(nodes, [id])
  return n[id];
}

/**
 * Fetch lists of people and denormalize them to be displayed.
 * @param nodes already fetched and denormalized people
 * @param ids ids of people to fetch
 * @returns {Promise<*>} map of ids to denormalized people
 */
export async function fetchPeople(nodes, ids) {
  const propertyData = {}; // TODO: pass this in and keep its state outside
  const idsToFetch = ids.filter(id => !nodes.hasOwnProperty(id));
  const entities = await fetchIdsFromWikiData(idsToFetch);
  ids.forEach(id => {
    if (!entities[id]) {
      console.log('Data not found or there was an error.');
      return null;
    }
    const person = {
      label: entities[id].labels.en.value,
      description: entities[id].descriptions.en.value,
    };

    for (const p in propertyMap) {
      if (entities[id].claims.hasOwnProperty(p)) {
        person[propertyMap[p]] = entities[id].claims[p].filter(e =>
            e.hasOwnProperty('mainsnak') && e.mainsnak.hasOwnProperty('datavalue') && !!e.mainsnak.datavalue.value)
            .map(e => {
          try {
            const value = e.mainsnak.datavalue.value;
            if (e.hasOwnProperty("qualifiers") && typeof myVar === 'object') {
              value["qualifiers"] = e.qualifiers;
            }
            return value;
          } catch (error) {
            console.error(error);
            return null;
          }
        });
      } else {
        person[propertyMap[p]] = [];
      }
    }
    nodes[id] = fetchProperties(propertyData, person); // TODO: Change this to fetch multiple people at a time
  })
  return nodes;
}

export async function getCertainNumberOfConnections(rootId, numberOfAncestors, numberOfDescendants) {
  const nodes = {}; // TODO: pass this in and keep its memory
  // Get descendants
  let visited = new Set();
  let queue = [{ currentNodeId: rootId, level: 0 }];
  visited.add(rootId);
  console.log(`Getting ${numberOfDescendants} descendants`);
  while (queue.length > 0) {
    console.log(queue);
    const { currentNodeId, level } = queue.shift();
    console.log(`Descendant ${currentNodeId}`);
    if (level === numberOfDescendants) {
      break;
    }
    const currentNode = await fetchPerson(nodes, currentNodeId);
    console.log(currentNode);
    visited.add(currentNodeId);
    // if (currentNode.spouse) {
    //   for (const spouse of currentNode.spouse) {
    //     fetchPerson(nodes, spouse.id);
    //   }
    // }
    // if (currentNode['unmarried partner']) {
    //   for (const partner of currentNode['unmarried partner']) {
    //     fetchPerson(nodes, partner.id);
    //   }
    // }
    if (currentNode.child) {
      currentNode.child.filter(child => !visited.has(child.id)).forEach(child => {
        queue.push({ currentNodeId: child.id, level: level + 1 })
      });
    }
  }

  // Get ancestors
  visited = new Set();
  queue = [{ currentNodeId: rootId, level: 0 }];
  queue.push(rootId);
  visited.add(rootId);
  console.log(`Getting ${numberOfAncestors} ancestors`);
  while (queue.length > 0) {
    const { currentNodeId, level } = queue.shift();
    console.log(`Ancestor ${currentNodeId}`);
    if (level === numberOfAncestors) {
      break;
    }
    const currentNode = await fetchPerson(nodes, currentNodeId);
    console.log(currentNode);
    visited.add(currentNodeId);
    if (currentNode.father && !visited.has(currentNode.father)) {
      queue.push({currentNodeId: currentNode.father, level: level + 1})
    }
    if (currentNode.mother && !visited.has(currentNode.mother)) {
      queue.push({currentNodeId: currentNode.mother, level: level + 1})
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

/**
 * Try and form a connected graph of all the members of the list
 * @param data
 * @param listOfMonarchs
 */
export function getConnectedGraph(data, listOfMonarchs) {
  // We need to iterate through each monarch and find the path to the next monarch
  // It might not necessarily be the very next monarch in the list (thanks cromwells)
  // So if you come up short find the path to the next monarch (or the next)
  // At the end combine all the nodes from all the paths and return them
  const pathNodeIds = new Set();
  // Using a for loop
  for (let i = 0; i < listOfMonarchs.length - 1; i++) {
    if (data[listOfMonarchs[i]]) {
      const root = data[listOfMonarchs[i]];
      console.log("From: ", root);
      let foundPath = [];
      for (let j = i + 1; j < listOfMonarchs.length; j++) {
        if (data[listOfMonarchs[j]]) {
          const targetNode = data[listOfMonarchs[j]];
          console.log("To: ", targetNode);
          let queue = [{node: root, path: []}]; // Initialize queue with start node and an empty path
          let visited = new Set(); // Track visited nodes
          // Search relatives
          while (queue.length > 0) {
            const {node, path} = queue.shift();
            // Skip already visited nodes
            if (visited.has(node.id)) {
              continue;
            }
            // Add current node to the path
            const currentPath = [...path, node];
            // Check if the target node is found
            if (node.id === targetNode.id) {
              foundPath = currentPath; // Return the path to the target node
              break;
            }
            visited.add(node.id);
            // Add unvisited neighboring nodes to the queue with the updated path
            const issueList = node.issueList;
            if (issueList) {
              issueList.filter(childId => data[childId] && !visited.has(childId)).forEach(childId => queue.push({
                node: data[childId],
                path: currentPath
              }))
            }
            if (node.father && data[node.father] && !visited.has(node.father)) {
              queue.push({node: data[node.father], path: currentPath})
            }
            if (node.mother && data[node.mother] && !visited.has(node.mother)) {
              queue.push({node: data[node.mother], path: currentPath})
            }
          }
        } else {
          console.log("Skipping because not in dataset: ", listOfMonarchs[j]);
        }
      }
      foundPath.forEach(node => pathNodeIds.add(node.id));
    } else {
      console.log("Skipping because not in dataset: ", listOfMonarchs[i]);
    }
  }
  const newData = {};
  pathNodeIds.forEach(nodeId => {
    newData[nodeId] = data[nodeId];
    if (data[nodeId].father && !pathNodeIds.has(data[nodeId].father) && data[data[nodeId].father]) {
      newData[data[nodeId].father] = data[data[nodeId].father];
    }
    if (data[nodeId].mother && !pathNodeIds.has(data[nodeId].mother) && data[data[nodeId].mother]) {
      newData[data[nodeId].mother] = data[data[nodeId].mother];
    }
  });
  console.log(newData);
  return newData;
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