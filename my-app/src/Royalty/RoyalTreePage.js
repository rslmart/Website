import React, {Component} from 'react';
import Tree from 'react-d3-tree';
import ROYAL_DATA from "./royaltree.json"

class RoyalTree extends Component {
  state = {
    chart: this.convertToChart(ROYAL_DATA, "/wiki/Charlemagne")
  }

  convertToChart(data, personId) {
    console.log("Loading ")
    const orgChart = { name: data[personId].id, children: [] };
    const processedIds = new Set([personId]);
    const queue = [{ id: personId, parent: orgChart }];

    while (queue.length > 0) {
      const { id, parent } = queue.shift();
      const person = data[id];

      if (person.father && !processedIds.has(person.father)) {
        const father = data[person.father];
        if (father) {
          const fatherNode = { name: father.id, children: [], parent };
          parent.children.push(fatherNode);
          queue.push({ id: person.father, parent: fatherNode });
          processedIds.add(person.father);
        }
      }

      if (person.mother && !processedIds.has(person.mother)) {
        const mother = data[person.mother];
        if (mother) {
          const motherNode = { name: mother.id, children: [], parent };
          parent.children.push(motherNode);
          queue.push({ id: person.mother, parent: motherNode });
          processedIds.add(person.mother);
        }
      }

      if (person.issueList) {
        person.issueList.forEach(childId => {
          if (!processedIds.has(childId)) {
            const child = data[childId];
            const childNode = { name: child.id, children: [], parent };
            parent.children.push(childNode);
            queue.push({ id: childId, parent: childNode });
            processedIds.add(childId);
          }
        });
      }
    }

    return orgChart;
  }

  render() {
    return (
        <div id="treeWrapper" style={{width: "100vw", height: "100vh"}}>
          <Tree data={this.state.chart} />
        </div>
    )
  }
}

export default RoyalTree