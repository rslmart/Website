import {fetchPeople, fetchPerson, getConnectedGraph, traceInheritance} from "./RoyalTreeUtils.js";
import * as fs from 'fs';
import * as util from 'util';

async function getMonarchs(monarchId, titleIds) {
    const getList = async (monarchList, forward) => {
        const propertyId = forward ? "replaced by" : "replace";
        const nodes = {};
        const propertyData = {};
        const visited = {};
        const queue = [monarchId]
        while (queue.length > 0) {
            const id = queue.shift();
            // Someone might have been king multiple times (civil wars)
            if (visited.hasOwnProperty(id)) {
                visited[id] += 1;
            } else {
                visited[id] = 0;
            }
            const person = await fetchPerson(nodes, propertyData, id).then(p => p);
            try {
                const positionHeldList = person["position held"].filter(position => titleIds.has(position.id));
                console.log(positionHeldList);
                let nextId;
                if (forward) {
                    // If there is no next person then search through the other titles (transition from one title to another)
                    while (!positionHeldList[visited[id]].hasOwnProperty(propertyId)) {
                        visited[id] += 1;
                    }
                    nextId = positionHeldList[visited[id]][propertyId];
                    monarchList.push(person.id);
                } else {
                    while (!positionHeldList[positionHeldList.length - 1 - visited[id]].hasOwnProperty(propertyId)) {
                        visited[id] += 1;
                    }
                    nextId = positionHeldList[positionHeldList.length - 1 - visited[id]][propertyId];
                    monarchList.unshift(person.id);
                }
                console.log(positionHeldList, visited, nextId);
                queue.push(nextId);
            } catch (error) {
                console.error(error);
                return null;
            }
        }
    }
    const monarchList = [monarchId];
    await getList(monarchList, true);
   // await getList(monarchList, false);
    return monarchList;
}

function createMonarchList() {
    // const titleName = "king of France"
// const monarchId = "Q8058";
// const positionSet =  new Set(["Q29168087", "Q18384454", "Q3439798", "Q22923081", "Q3439814", "Q19808845"]);

// const titleName = "monarch of England"
// const monarchId = "Q7207";
// const positionSet =  new Set(["Q116", "Q18810062", "Q110324075", "Q111722535", "Q9134365"]);

// const titleName = "tsar of Russia"
// const monarchId = "Q171185";
// const positionSet =  new Set(["Q12370487", "Q12370489", "Q4147018", "Q2618625"]);
// Problem around Q1282778

    const titleName = "Holy Roman Emperor"
    const monarchId = "Q3044";
    const positionSet =  new Set(["Q111841382"]);

    // Input list of titles in case they changed titles at one point (looking at you England -> Great Britian)
    getMonarchs(monarchId, positionSet).then(result => {
        // Save the JSON data to a file named "data.json"
        const filePath = `./monarch_list_v2_fixed.json`;
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading the file:', err);
                return;
            }

            try {
                const jsonObject = JSON.parse(data);
                // Modify the contents of the JSON object as needed
                jsonObject[titleName] = result;

                // Convert the modified object back to a JSON string
                const modifiedJsonString = JSON.stringify(jsonObject, null, 2);

                // Save the modified JSON string back to the file
                fs.writeFile(filePath, modifiedJsonString, 'utf8', (err) => {
                    if (err) {
                        console.error('Error writing the file:', err);
                        return;
                    }
                    console.log('JSON file has been modified and saved successfully.');
                });
            } catch (parseError) {
                console.error('Error parsing JSON:', parseError);
            }
        });
    });
}

function convertMonarchList() {
    const filePath = `./monarch_list_v2.json`;
    fs.readFile("./monarch_list.json", 'utf8', async (err, data) => {
        if (err) {
            console.error('Error reading the file:', err);
            return;
        }

        try {
            const jsonObject = JSON.parse(data);
            const modifiedJsonObject = {};
            // Modify the contents of the JSON object as needed
            for (const [key, value] of Object.entries(jsonObject)) {
                modifiedJsonObject[key] = [];
                for (const wikiId of value) {
                    console.log(wikiId);

                    try {
                        const url = `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&titles=${wikiId}&format=json`
                        const {query} = await fetch(url).then(res => res.json());
                        modifiedJsonObject[key].push(Object.values(query.pages)[0].pageprops.wikibase_item);
                    } catch {
                        modifiedJsonObject[key].push(wikiId);
                    }
                }
                console.log(modifiedJsonObject);
            }

            // Convert the modified object back to a JSON string
            const modifiedJsonString = JSON.stringify(modifiedJsonObject, null, 2);

            // Save the modified JSON string back to the file
            fs.writeFile(filePath, modifiedJsonString, 'utf8', (err) => {
                if (err) {
                    console.error('Error writing the file:', err);
                    return;
                }
                console.log('JSON file has been modified and saved successfully.');
            });
        } catch (parseError) {
            console.error('Error parsing JSON:', parseError);
        }
    });
}
const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);

async function processMonarchData() {
    try {
        const propertyData = {};

        const monarch_list_v2_fixed_string = await readFileAsync("./monarch_list_v2_fixed.json", 'utf8');
        const monarchIdListMap = JSON.parse(monarch_list_v2_fixed_string);

        const monarch_data_string = await readFileAsync("./monarch_data.json", 'utf8');
        const monarchData = JSON.parse(monarch_data_string);

        const monarch_list_paths_string = await readFileAsync("./monarch_list_paths.json", 'utf8');
        const monarchListPaths = JSON.parse(monarch_list_paths_string);

        for (const key of Object.keys(monarchIdListMap)) {
            try {
                if (!monarchListPaths.hasOwnProperty(key)) {
                    console.log("Starting on Monarch List: ", key);
                    const monarchList = monarchIdListMap[key];
                    const result = await traceInheritance(monarchData, propertyData, monarchList);
                    monarchListPaths[key] = result;
                    const monarchListPathsJsonString = JSON.stringify(monarchListPaths);
                    const monarchDataJsonString = JSON.stringify(monarchData);

                    await writeFileAsync('./monarch_list_paths.json', monarchListPathsJsonString, 'utf8');
                    await writeFileAsync('./monarch_data.json', monarchDataJsonString, 'utf8');
                    console.log('JSON file has been modified and saved successfully.');
                } else {
                    console.log("Already fetched data for ", key);
                }
            } catch (err) {
                console.error('Error reading or parsing files:', err);
            }
        }
    } catch (err) {
        console.error('Error reading the file:', err);
    }
}

async function trimData() {
    const monarch_list_paths_string = await readFileAsync("./monarch_list_paths.json", 'utf8');
    const monarchListPaths = JSON.parse(monarch_list_paths_string);
    const monarch_data_string = await readFileAsync("./monarch_data.json", 'utf8');
    const monarchData = JSON.parse(monarch_data_string);

    const idSet = new Set();
    Object.values(monarchListPaths).forEach(monarchPath => Object.values(monarchPath).forEach(path => path.forEach(id => idSet.add(id))));
    const idsToFetch = new Set(Array.from(idSet));
    idSet.forEach(id => {
        const node = monarchData[id];
        const lists = ['child', 'sibling', 'spouse', 'unmarried partner'];
        lists.forEach(listKey => {
            if (node.hasOwnProperty(listKey)) {
                node[listKey].forEach(item => {
                    if (!monarchData.hasOwnProperty(item.id)) {
                        console.log(item.id);
                    }
                    idsToFetch.add(item.id);
                });
            }
        });
        ['father', 'mother'].forEach(parentKey => {
            if (node.hasOwnProperty(parentKey)) {
                if (!monarchData.hasOwnProperty(node[parentKey])) {
                    console.log(node[parentKey]);
                }
                idsToFetch.add(node[parentKey]);
            }
        });
    });
    const propertyData = {};
    const trimmedData = await fetchPeople(monarchData, propertyData, Array.from(idsToFetch));
    const trimmedDataJsonString = JSON.stringify(trimmedData);
    console.log(monarch_data_string.length, ' -> ', trimmedDataJsonString.length, trimmedDataJsonString.length / monarch_data_string.length);
    await writeFileAsync('./trimmed_monarch_data.json', trimmedDataJsonString, 'utf8');
}

async function findCommonRelations(listOfMonarchLists) {
    const propertyData = {};
    const monarch_data_string = await readFileAsync("./trimmed_monarch_data.json", 'utf8');
    const nodes = JSON.parse(monarch_data_string);
    const monarch_list_v2_fixed_string = await readFileAsync("./monarch_list_v2_fixed.json", 'utf8');
    const monarchIdListMap = JSON.parse(monarch_list_v2_fixed_string);
    const foundPaths = {};
    for (let i = 0; i < listOfMonarchLists.length - 1; i++) {
        const monarchSetA = new Set(monarchIdListMap[listOfMonarchLists[i]]);
        const monarchSetB = new Set();
        for (let j = i + 1; j < listOfMonarchLists.length; j++) {
            monarchIdListMap[listOfMonarchLists[j]].forEach(id => monarchSetB.add(id));
        }
        for (const monarchId of monarchSetA) {
            foundPaths[monarchId] = [];
            let queue = [{nodeId: monarchId, path: []}]; // Initialize queue with start node and an empty path
            let visited = new Set(); // Track visited nodes
            // Search descendants
            while (queue.length > 0) {
                const {nodeId, path} = queue.shift();
                // Skip already visited nodes
                if (visited.has(nodeId) || path.length > 4) {
                    continue;
                }
                const node = await fetchPerson(nodes, propertyData, nodeId);
                // Add current node to the path
                const currentPath = [...path, node];
                console.log("Path: ", currentPath.map(n => n.label));
                // Check if the target node is found
                if (monarchSetB.has(node.id)) {
                    foundPaths[monarchId].push(currentPath.map(n => n.id)); // Add the path to the target node
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
            console.log(monarchId, foundPaths[monarchId]);
            const foundPathsJsonString = JSON.stringify(foundPaths);
            await writeFileAsync(`./${listOfMonarchLists.join("_")}CombinedTree.json`, foundPathsJsonString, 'utf8');
        }
    }
    const foundPathsJsonString = JSON.stringify(foundPaths);
    await writeFileAsync(`./${listOfMonarchLists.join("_")}CombinedTree.json`, foundPathsJsonString, 'utf8');
}

findCommonRelations(["England", "France"]);
