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
      console.error(nodeId);
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

function extractYear(dateStr) {
  if (!dateStr) return '?';
  try {
    const [datePart] = dateStr.split('T');
    const [yearStr] = datePart.split('-');
    const year = parseInt(yearStr, 10);
    return year < 1 ? `${Math.abs(year - 1)} BCE` : `${year}`;
  } catch (e) {
    return '?';
  }
}

function createLabel(person) {
  const birth = extractYear(person['date of birth']) ?? '?';
  const death = extractYear(person['date of death']) ?? '?';
  return `${person.label}\n${birth}-${death}`;
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
        opacity: highlightedNodeSet.has(person.id) ? 1 : 0.9,
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
            label: getMarriageLabel(person.label, spouse.label),
            type: 'marriage',
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
          label: getMarriageLabel(data[motherId].label, data[fatherId].label),
          type: 'marriage',
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

  let colors = ['#e6194B', '#3cb44b', '#4363d8', '#f58231', '#42d4f4', '#f032e6', '#fabed4', '#469990', '#dcbeff', '#9A6324', '#fffac8', '#800000', '#aaffc3', '#000075', '#a9a9a9', '#000000']
  let familyColors = {}
  edges.forEach(edge => {
    var family = ""
    if (edge.source in data && 'family' in data[edge.source]) {
      family = data[edge.source]['family']
    }
    else if (edge.target in data && 'family' in data[edge.target]) {
      family = data[edge.target]['family']
    }
    if (family) {
      edge['family'] = family
      if (family in familyColors){
        edge['color'] = familyColors[family]
      }
      else {
        let color = colors[Object.keys(familyColors).length % colors.length];
        familyColors[family] = color
        edge['color'] = color
      }
    }
  })

  return { nodes, edges: validEdges };
}
