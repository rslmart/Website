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
  let label = person.label;
  if (person.hasOwnProperty("date of birth") && person.hasOwnProperty("date of death")) {
    label = label + ` (${new Date(person["date of birth"]).getUTCFullYear()} - ${new Date(person["date of death"]).getUTCFullYear()})`
  }
  if (person.hasOwnProperty("position held") && person["position held"].length > 0) {
    const monarchPositions = person["position held"]
        .filter(position =>  position.label.toLowerCase().includes("tsar".toLowerCase()) || position.label.toLowerCase().includes("emperor".toLowerCase()) || position.label.toLowerCase().includes("monarch".toLowerCase()) || position.label.toLowerCase().includes("king".toLowerCase()))
        .map(position => `${position.label}: ${new Date(position['start time']).getUTCFullYear()} - ${new Date(position['end time']).getUTCFullYear()}`)
    label = label + '\n' + monarchPositions.join('\n')
  }
  return label;
}

const uniqueColors = [
  "#FF5733", // Vivid Orange
  "#33FF6A", // Lime Green
  "#3366FF", // Royal Blue
  "#FF33E9", // Bright Pink
  "#33FFFF", // Cyan
  "#FF33B8", // Magenta
  "#33FF33", // Green
  "#FF3366", // Reddish Pink
  "#33B8FF", // Sky Blue
  "#FFFF33", // Yellow
  "#B833FF", // Purple
  "#FFB833", // Amber
  "#33FFB8", // Turquoise
  "#FFB833", // Gold
  "#B83333"  // Deep Red
];

function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

export function convertToChart(data, highlightedNodes) {
  const highlightedNodeSet = new Set(highlightedNodes.map(node => node.id));
  const familyColorMap = {};
  let currentColor = 0;
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
    if (person.hasOwnProperty("sex or gender")) {
      node.style = {
        fill: person["sex or gender"].label === 'male' ? 'blue' : 'red',
        stroke: highlightedNodeSet.has(person.id) ? '#e7e312' : 'black',
        opacity: highlightedNodeSet.has(person.id) ? 1 : 0.5,
        lineWidth: 5
      }
    }
    if (person.hasOwnProperty('image') && person.image.length > 0) {
        node['icon'] = {
          img: process.env.PUBLIC_URL + '/wiki/' + person.id + '.jpg',
          width: 45,
          height: 70,
          show: true
        };
    }
    // TODO: Figure out how badges/halos work
    // if (person.hasOwnProperty("family") && person.family.length > 0) {
    //   const familyId = person.family[0].id;
    //   if (!familyColorMap.hasOwnProperty(familyId)) {
    //     if (currentColor < uniqueColors.length) {
    //       familyColorMap[familyId] = uniqueColors[currentColor];
    //       currentColor += 1;
    //     } else {
    //       familyColorMap[familyId] = getRandomColor();
    //     }
    //   }
    //   console.log(node);
    // }
    nodes.push(node);
    if (person['spouse']){
      person['spouse'].filter(spouse => data[spouse.id] && !nodeSet.has(getMarriageName(person.id, spouse.id)))
          .forEach(spouse => {
            const marriageName = getMarriageName(person.id, spouse.id);
            nodes.push({ id: marriageName, label: getMarriageLabel(person.label, data[spouse.id]['label']) });
            nodeSet.add(marriageName);
            edges.push({ source: person.id, target: marriageName, style: { stroke: person["sex or gender"] === 'male' ? 'blue' : 'red' } })
            edges.push({ source: spouse.id, target: marriageName, style: { stroke: data[spouse.id]["sex or gender"] === 'male' ? 'blue' : 'red' }  })
          })
    }
    if (person['unmarried partner']){
      person['unmarried partner'].filter(spouse => data[spouse.id] && !nodeSet.has(getMarriageName(person.id, spouse.id)))
          .forEach(spouse => {
            const marriageName = getMarriageName(person.id, spouse.id);
            nodes.push({ id: marriageName, label: getMarriageLabel(person.label, data[spouse.id]['label']) });
            nodeSet.add(marriageName);
            edges.push({ source: person.id, target: marriageName, style: { stroke: person["sex or gender"] === 'male' ? 'blue' : 'red' } })
            edges.push({ source: spouse.id, target: marriageName, style: { stroke: data[spouse.id]["sex or gender"] === 'male' ? 'blue' : 'red' }  })
          })
    }
    if (person['mother'] && data[person['mother']] && person['father'] && data[person['father']]){
      const marriageName = getMarriageName(person['mother'], person['father']);
      if (!nodeSet.has(marriageName)) {
        nodes.push({ id: marriageName, label: getMarriageLabel(data[person['mother']]['label'], data[person['father']]['label']) });
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
  'P1366': 'replaced by',
  'P1534': 'end cause',
  'P1706': 'together with'
};

/**
 * Fetch lists of objects from wikidata in batches of 50 (the limit).
 * @param ids
 * @returns {{}}
 */
export async function fetchIdsFromWikiData(ids) {
  const dedupedIds = [...new Set(ids)]
  console.log("Ids to fetch", dedupedIds);
  const toReturn = {};
  let start = 0;
  let end = 50;

  let idsToFetch = dedupedIds.slice(start, end);
  while (idsToFetch.length > 0) {
    const url = wdk.getEntities({
      ids: idsToFetch
    });
    const {entities} = await fetch(url).then(res => res.json());
    Object.entries(entities).forEach(([key, value]) => toReturn[key] = value);
    start += 50;
    end += 50;
    idsToFetch = dedupedIds.slice(start, end);
  }
  return toReturn;
}

/**
 * Get english label or next available
 */
function getLabel(labels) {
  if (labels.hasOwnProperty("en")) {
    return labels.en.value;
  } else if (labels.length > 0) {
      return Object.entries(labels)[0].value;
  }
  return "No Label";
}

/**
 * Transform data from id to denormalized data
 *   'noble title' to gather 'start time:P580', 'end time:P582', 'followed by:P156', 'follows:P155', 'end cause': 1534
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
  // console.log("Person to transform", personToTransform);
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
              label: getLabel(propertyValue.labels),
              description: getLabel(propertyValue.descriptions),
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
              label: getLabel(entityValue.labels),
              description: getLabel(entityValue.descriptions),
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
              label: getLabel(entityValue.labels),
              description: getLabel(entityValue.descriptions),
              id: val.id
            }
            propertyData[val.id] = propertyValue;
          }
          const propData = propertyData[val.id];
          if (val.hasOwnProperty("qualifiers")) {
            Object.entries(val.qualifiers)
                .filter(([qKey, qVal]) => !!qVal[0].datavalue)
                .forEach(([qKey, qVal]) => {
                  const { datatype, datavalue } = qVal[0];
                  propData[propertyMap[qKey]] = datatype === 'time' ? datavalue.value.time : datavalue.value.id;
                });
          }
          // TODO: Figure out why this is happening
          person.hasOwnProperty(property)
              ? person[property].push(JSON.parse(JSON.stringify(propData)))
              : (person[property] = [JSON.parse(JSON.stringify(propData))]);
        });
        if (person.hasOwnProperty(property)) {
          person[property].sort((a,b) => a['start time'] - b['start time'])
        }
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
 * Take a list of people and denormalize them
 * @param propertyData already fetched properties and their data
 * @param personList list of people retrieved but not transformed yet
 * @returns return list of transformed people
 */
export async function fetchProperties(propertyData, personList) {
  // Gather ids for all, fetch ids, then replace
  const idsToFetch = [];
  personList.forEach(person => {
    const keysToRetrieve = new Set(["instance of", "sex or gender", "country of citizenship", "noble title", "place of birth", "place of death", "cause of death", "place of burial", "family", "languages spoken, written or signed", "occupation", "position held", "ethnic group", "religion or worldview", "canonization status", "feast day", "time period"])
    const ids = Object.entries(person)
        .filter(([key, value]) => keysToRetrieve.has(key))
        .flatMap(([key, value]) => value.filter(entity => entity?.id && !(entity.id in propertyData)))
        .map(entity => entity.id);
    idsToFetch.push(...ids);
  })
  const entities = await fetchIdsFromWikiData(idsToFetch);
  return personList.map(person => transformPerson(propertyData, entities, person));
}

/**
 * Wrapper around fetchPeople() to just get one person
 * @param nodes
 * @param id
 * @returns {Promise<*>} denormalized person
 */
export async function fetchPerson(nodes, propertyData, id) {
  const n = await fetchPeople(nodes, propertyData,[id])
  return n[id];
}

/**
 * Fetch lists of people and denormalize them to be displayed.
 * @param data already fetched and denormalized people
 * @param ids ids of people to fetch
 * @returns {Promise<*>} map of ids to denormalized people
 */
export async function fetchPeople(data, propertyData, ids) {
  const idsToFetch = ids.filter(id => !data.hasOwnProperty(id));
  const entities = idsToFetch.length > 0 ? await fetchIdsFromWikiData(idsToFetch) : {};
  const peopleToTransform = [];
  for (const id of idsToFetch) {
    if (!entities[id]) {
      console.log('Data not found or there was an error in retrieving: ', id);
      continue;
    }
    const person = {
      id,
      label: getLabel(entities[id].labels),
      description: getLabel(entities[id].descriptions)
    };

    for (const p in propertyMap) {
      if (entities[id].claims.hasOwnProperty(p)) {
        person[propertyMap[p]] = entities[id].claims[p].filter(e =>
            e.hasOwnProperty('mainsnak') && e.mainsnak.hasOwnProperty('datavalue') && !!e.mainsnak.datavalue.value)
            .map(e => {
          try {
            const value = e.mainsnak.datavalue.value;
            if (e.hasOwnProperty("qualifiers") && typeof value === 'object') {
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
    peopleToTransform.push(person);
  }
  const transformedPeopleList = await fetchProperties(propertyData, peopleToTransform);
  transformedPeopleList.forEach(person => data[person.id] = person);
  const nodes = {};
  ids.forEach(id => nodes[id] = data[id]);
  return nodes;
}

export async function getCertainNumberOfConnections(data, propertyData, rootId, numberOfAncestors, numberOfDescendants) {
  // Get descendants
  let visited = new Set();
  let toFetchQueue = [{ currentNodeId: rootId, level: 0 }];
  let fetchedQueue = [];
  let partnerIds = [];
  visited.add(rootId);
  console.log(`Getting ${numberOfDescendants} descendants`);
  while (toFetchQueue.length > 0 || fetchedQueue.length > 0) {
    if (fetchedQueue.length > 0) {
      const { currentNodeId, level } = fetchedQueue.shift();
      console.log(`Descendant ${currentNodeId}`);
      const currentNode = data[currentNodeId]; // should be fetched already
      console.log(currentNode);
      visited.add(currentNodeId);
      if (currentNode.spouse) {
        for (const spouse of currentNode.spouse) {
          partnerIds.push(spouse.id);
        }
      }
      if (currentNode['unmarried partner']) {
        for (const partner of currentNode['unmarried partner']) {
          partnerIds.push(partner.id);
        }
      }
      if (currentNode.child) {
        currentNode.child.filter(child => !visited.has(child.id)).forEach(child => {
          toFetchQueue.push({ currentNodeId: child.id, level: level + 1 })
        });
      }
    } else {
      toFetchQueue = toFetchQueue.filter(val => val.level <= numberOfDescendants);
      await fetchPeople(data, propertyData, toFetchQueue.map(val => val.currentNodeId));
      fetchedQueue = JSON.parse(JSON.stringify(toFetchQueue));
      toFetchQueue = [];
    }
  }
  await fetchPeople(data, propertyData, partnerIds);
  const nodes = {};
  visited.forEach(id => nodes[id] = data[id]);
  partnerIds.forEach(id => nodes[id] = data[id]);

  // Get ancestors
  visited = new Set();
  toFetchQueue = [{ currentNodeId: rootId, level: 0 }];
  fetchedQueue = [];
  visited.add(rootId);
  console.log(`Getting ${numberOfAncestors} ancestors`);
  while (toFetchQueue.length > 0 || fetchedQueue.length > 0) {
    if (fetchedQueue.length > 0) {
      const {currentNodeId, level} = fetchedQueue.shift();
      console.log(`Ancestor ${currentNodeId}`);
      if (level === numberOfAncestors) {
        break;
      }
      const currentNode = data[currentNodeId];
      console.log(currentNode);
      visited.add(currentNodeId);
      if (currentNode.father && !visited.has(currentNode.father)) {
        toFetchQueue.push({currentNodeId: currentNode.father, level: level + 1})
      }
      if (currentNode.mother && !visited.has(currentNode.mother)) {
        toFetchQueue.push({currentNodeId: currentNode.mother, level: level + 1})
      }
    } else {
      toFetchQueue = toFetchQueue.filter(val => val.level <= numberOfAncestors);
      await fetchPeople(data, propertyData, toFetchQueue.map(val => val.currentNodeId));
      fetchedQueue = JSON.parse(JSON.stringify(toFetchQueue));
      toFetchQueue = [];
    }
  }
  visited.forEach(id => nodes[id] = data[id]);
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

export async function getMonarchListGraph(data, propertyData, monarchList) {
  const idSet = new Set();
  Object.values(monarchList).forEach(path => path.forEach(id => idSet.add(id)));
  const nodes = await fetchPeople(data, propertyData, Array.from(idSet));
  Object.keys(nodes).forEach(id => {
    const node = nodes[id];
    // const lists = ['spouse', 'unmarried partner']; //TODO Better filtering to show less children/siblings
    // lists.forEach(listKey => {
    //   if (node.hasOwnProperty(listKey)) {
    //     node[listKey].forEach(item => {
    //       idSet.add(item.id);
    //     });
    //   }
    // });
    ['father', 'mother'].forEach(parentKey => {
      if (node.hasOwnProperty(parentKey)) {
        idSet.add(node[parentKey]);
      }
    });
  });
  return await fetchPeople(data, propertyData, Array.from(idSet));
}

export async function traceInheritance(nodes, propertyData, listOfMonarchs) {
  const skipList = new Set(["Q517n "]); // Napolean II
  const pathMap = { [listOfMonarchs[0]]: [listOfMonarchs[0]]};

  await fetchPeople(nodes, propertyData, listOfMonarchs);
  for (let i = 1; i < listOfMonarchs.length; i++) {
    const monarchSet = new Set(listOfMonarchs.slice(0, i));
    const root = await fetchPerson(nodes, propertyData, listOfMonarchs[i]);
    if (skipList.has(listOfMonarchs[i])) {
      continue;
    }
    console.log("From: ", root.label);
    let foundPath = [];
    // check descendants
    let queue = [{nodeId: root.id, path: []}]; // Initialize queue with start node and an empty path
    let visited = new Set(); // Track visited nodes
    // Search descendants
    while (queue.length > 0) {
      const {nodeId, path} = queue.shift();
      // Skip already visited nodes
      if (visited.has(nodeId) || path.length > 8) {
        continue;
      }
      const node = await fetchPerson(nodes, propertyData, nodeId);
      // Add current node to the path
      const currentPath = [...path, node];
      console.log("Path: ", currentPath.map(n => n.label));
      // Check if the target node is found
      if (listOfMonarchs[i] != node.id && monarchSet.has(node.id)) {
        foundPath = currentPath; // Return the path to the target node
        break;
      }
      visited.add(node.id);
      // Add unvisited neighboring nodes to the queue with the updated path
      if (node.father && !visited.has(node.father)) {
        queue.push({nodeId: node.father, path: currentPath})
      }
      if (node.mother && !visited.has(node.mother)) {
        queue.push({nodeId: node.mother, path: currentPath})
      }
      const childList = node.child;
      if (childList) {
        for (const child of childList.filter(child => !visited.has(child.id))) {
          queue.push({
            nodeId: child.id,
            path: currentPath
          });
        }
      }
      queue.sort((a, b) => a.path.length - b.path.length);
      await fetchPeople(nodes, propertyData, queue.map(n => n.nodeId));
    }
    pathMap[listOfMonarchs[i]] = foundPath.map(p => p.id);
  }
  return pathMap;
}

/**
 * Try and form a connected graph of all the members of the list
 * @param data
 * @param listOfMonarchs
 */
export async function getConnectedGraph(nodes, propertyData, listOfMonarchs) {
  // We need to iterate through each monarch and find the path to the next monarch
  // It might not necessarily be the very next monarch in the list (thanks cromwells)
  // So if you come up short find the path to the next monarch (or the next)
  // At the end combine all the nodes from all the paths and return them
  const skipList = new Set(["Q7723"]); // Napolean II
  const pathMap = {};

  await fetchPeople(nodes, propertyData, listOfMonarchs);

  // Using a for loop
  for (let i = 0; i < listOfMonarchs.length - 1; i++) {
    const root = await fetchPerson(nodes, propertyData, listOfMonarchs[i]);
    if (skipList.has(listOfMonarchs[i])) {
      continue;
    }
    console.log("From: ", root.label);
    let foundPath = [];
    const targetNode = await fetchPerson(nodes, propertyData, listOfMonarchs[i + 1]);
    console.log("To: ", targetNode.label);
    let queue = [{nodeId: root.id, path: []}]; // Initialize queue with start node and an empty path
    let visited = new Set(); // Track visited nodes
    // Search relatives
    while (queue.length > 0) {
      const {nodeId, path} = queue.shift();
      // Skip already visited nodes
      if (visited.has(nodeId) || path.length > 10) {
        continue;
      }
      const node = await fetchPerson(nodes, propertyData, nodeId);
      // Add current node to the path
      const currentPath = [...path, node];
      console.log("Path: ", currentPath.map(n => n.label));
      // Add previous ruler
      // if ((j - currentPath.length) >= 0 && !visited.has(listOfMonarchs[j - currentPath.length])) {
      //   queue.push({nodeId: listOfMonarchs[j - currentPath.length], path: currentPath})
      // }
      // Check if the target node is found
      if (node.id === targetNode.id) {
        foundPath = currentPath; // Return the path to the target node
        break;
      }
      visited.add(node.id);
      // Add unvisited neighboring nodes to the queue with the updated path
      const childList = node.child;
      if (childList) {
        for (const child of childList.filter(child => !visited.has(child.id))) {
          queue.push({
            nodeId: child.id,
            path: currentPath
          });
        }
      }
      const siblingList = node.sibling;
      if (siblingList) {
        for (const sibling of siblingList.filter(sibling => !visited.has(sibling.id))) {
          queue.push({
            nodeId: sibling.id,
            path: currentPath
          });
        }
      }
      const spouseList = node.spouse;
      if (spouseList) {
        for (const spouse of spouseList.filter(spouse => !visited.has(spouse.id))) {
          queue.push({
            nodeId: spouse.id,
            path: currentPath
          });
        }
      }
      const partnerList = node["unmarried partner"];
      if (partnerList) {
        for (const partner of partnerList.filter(partner => !visited.has(partner.id))) {
          queue.push({
            nodeId: partner.id,
            path: currentPath
          });
        }
      }
      if (node.father && !visited.has(node.father)) {
        queue.push({nodeId: node.father, path: currentPath})
      }
      if (node.mother && !visited.has(node.mother)) {
        queue.push({nodeId: node.mother, path: currentPath})
      }
      queue.sort((a, b) => a.path.length - b.path.length);
      await fetchPeople(nodes, propertyData, queue.map(n => n.nodeId));
    }
    pathMap[listOfMonarchs[i]] = foundPath.map(p => p.id);
  }
  return pathMap;
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
          if (curPerson.child) {
            curPerson.childList.filter(childId => people[childId] && !visited.has(childId)).forEach(childId => queue.push(childId));
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