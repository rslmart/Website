import requests
import json
def fetch_wikidata(id_queue):
    ids = list(id_queue)
    print("Fetching: {}".format(len(ids)))

    # Prepare the final result dictionary
    combined_results = {}

    # Fetch results in batches of 50 until all IDs are processed
    while ids:
        # Take up to 50 IDs
        current_ids = ids[:50]
        ids = ids[50:]  # Remove the fetched IDs from the queue

        # Create parameters for the current batch
        params = {
            'action': 'wbgetentities',
            'ids': '|'.join(current_ids),
            'format': 'json',
            'languages': 'en'
        }

        url = 'https://www.wikidata.org/w/api.php'
        try:
            response = requests.get(url, params=params).json()
            print(response)
            # Combine results
            combined_results.update(response.get('entities', {}))
        except Exception as e:
            print(f'There was an error: {e}')
            return 'There was an error'

    return combined_results


def get_connected_graph(list_of_monarchs):
    """
    Try and form a connected graph of all the members of the list
    :param data: dict, where keys are node IDs and values are node objects
    :param list_of_monarchs: list of monarch IDs
    """
    path_node_ids = set()
    data = fetch_wikidata(list_of_monarchs)
    # Using a for loop
    for i in range(len(list_of_monarchs) - 1):
        if list_of_monarchs[i] in data:
            root = data[list_of_monarchs[i]]
            print("From:", root)
            found_path = []
            for j in range(i + 1, len(list_of_monarchs)):
                if list_of_monarchs[j] in data:
                    target_node = data[list_of_monarchs[j]]
                    print("To:", target_node)
                    queue = [{'node': root, 'path': []}]  # Initialize queue with start node and an empty path
                    visited = set()  # Track visited nodes

                    # Search relatives
                    while queue:
                        current = queue.pop(0)
                        node = current['node']
                        path = current['path']

                        # Skip already visited nodes
                        if node['id'] in visited:
                            continue

                        # Add current node to the path
                        current_path = path + [node]

                        # Check if the target node is found
                        if node['id'] == target_node['id']:
                            found_path = current_path  # Return the path to the target node
                            break

                        visited.add(node['id'])

                        # Add unvisited neighboring nodes to the queue with the updated path
                        issue_list = node.get('issueList', [])
                        for child_id in issue_list:
                            if child_id in data and child_id not in visited:
                                queue.append({'node': data[child_id], 'path': current_path})

                        if 'father' in node and node['father'] in data and node['father'] not in visited:
                            queue.append({'node': data[node['father']], 'path': current_path})

                        if 'mother' in node and node['mother'] in data and node['mother'] not in visited:
                            queue.append({'node': data[node['mother']], 'path': current_path})

                else:
                    print("Skipping because not in dataset:", list_of_monarchs[j])

            for node in found_path:
                path_node_ids.add(node['id'])



if __name__ == '__main__':
    file_path = 'monarch_list.json'
    # Open the JSON file and load its content into a Python object
    with open(file_path, 'r') as file:
        monarch_list = json.load(file)
    print(fetch_wikidata(monarch_list['Japan']))
