import { WBK } from 'wikibase-sdk'

const wdk = WBK({
    instance: 'https://www.wikidata.org',
    sparqlEndpoint: 'https://query.wikidata.org/sparql'
})

export function getPersonFromWikiData() {

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


