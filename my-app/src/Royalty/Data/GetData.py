# Given wikidata person, put traits into understandable format
# Retrieve one person from wikidata
# Retrieve list of people from wikidata
import json
from collections import deque, defaultdict

import requests
import utils
from datetime import datetime
import os
import re

class DataRetriever:
  def __init__(self, local_file="data.json", save=True):
    self.local_file = local_file
    self.data = {}
    if os.path.exists(self.local_file):
      with open(self.local_file) as json_file:
        self.data = json.load(json_file)
    elif save:
      with open(self.local_file, 'w') as json_file:
        json.dump(self.data, json_file)
    self.save = save

  def get_person_from_item_id(self, item_id):
    return self.get_people_from_item_ids([item_id])[item_id]

  # Retrieves people but just returns IDs (no labels), needs to be post-processed to retrieve labels
  def get_people_from_item_ids(self, item_ids):
    result = {}
    to_retrieve = []
    for item_id in item_ids:
      if item_id in self.data:
        result[item_id] = self.data[item_id]
      else:
        to_retrieve.append(item_id)
    retrieved_item_data = utils.get_wikidata_data_for_list(to_retrieve)
    for item_id in to_retrieve:

      item_data = retrieved_item_data[item_id]
      person = {}
      if item_data:
        person["id"] = item_data["id"]
        person["label"] = item_data["labels"].get("en", {}).get("value")
        person["description"] = item_data["descriptions"].get("en", {}).get("value")
        # Access claims (statements)
        claims = item_data.get("claims", {})
        for property_id, claim_list in claims.items():
          if property_id in PROPERTIES:
            try:
              p = PROPERTIES[property_id]
              match property_id:
                case "P69" | "P106" | "P27" | "P40" | "P26" | "P451" | "P1412" | "P3373" | "P140" | "P23478":  # time period, noble title, religion, sibling, "languages spoken, written or signed", child, spouse, unmarried partner, educated at, occupation, country of citizenship, position held
                  person[p] = [claim["mainsnak"]["datavalue"]["value"]["id"] for claim in
                               claim_list]
                case "P22" | "P25" | "P19" | "P20" | "P119" | "P53" | "P509" | "P21":  # sex or gender, cause of death, family, father, mother, place of birth, place of death, place of burial
                  person[p] = claim_list[0]["mainsnak"]["datavalue"]["value"]["id"]
                case "P18" | "P109" | "P1442":  # image, signature, image of grave
                  person[p] = [claim["mainsnak"]["datavalue"]["value"] for claim in claim_list]
                case "P569" | "P570":
                  person[p] = claim_list[0]["mainsnak"]["datavalue"]["value"]["time"]
                case "P39" | "P97":
                  person[p] = []
                  for claim in claim_list:
                    if "qualifiers" in claim and 'P582' in claim["qualifiers"]:
                      # Empress Matilda thanks
                      id = claim["mainsnak"]["datavalue"]["value"]["id"]
                      if id in {"Q116"}: # "monarch"
                        if "P1001" in claim["qualifiers"]:
                          id = claim["qualifiers"]["P1001"][0]["datavalue"]["value"]["id"]
                        elif "P642" in claim["qualifiers"]:
                          id = claim["qualifiers"]["P642"][0]["datavalue"]["value"]["id"]
                      position = {"id": id}
                      for qualifier_prop_id in claim["qualifiers"].keys():
                        qualifier = PROPERTIES.get(qualifier_prop_id, "")
                        if qualifier_prop_id in {"P580", "P582"}:
                          position[qualifier] = claim["qualifiers"][qualifier_prop_id][0]["datavalue"]["value"]["time"]
                        elif qualifier_prop_id in {"P1534", "P642"} and claim["qualifiers"][qualifier_prop_id][0]['snaktype'] == 'value':
                          position[qualifier] = claim["qualifiers"][qualifier_prop_id][0]["datavalue"]["value"]["id"]
                        elif qualifier_prop_id in {"P155", "P1365", "P1366","P156"} and claim["qualifiers"][qualifier_prop_id][0]['snaktype'] == 'value':
                          position[qualifier] = [q["datavalue"]["value"]["id"] for q in claim["qualifiers"][qualifier_prop_id]]
                      person[p].append(position)
                  # sort this by end time
                  person[p] = sorted(person[p], key=lambda x: x["end time"])
            except Exception as e:
              print(f"{e} {claim_list[0]}")

        self.data[item_id] = person
        result[item_id] = person
    if self.save:
      with open(self.local_file, 'w') as outfile:
        json.dump(self.data, outfile)
    return result

class PropertyRetriever:
  def __init__(self, local_file="./data/properties.json", save=True):
    self.local_file = local_file
    self.properties = {}
    if os.path.exists(self.local_file):
      with open(self.local_file) as json_file:
        self.properties = json.load(json_file)
    elif save:
      with open(self.local_file, 'w') as json_file:
        json.dump(self.properties, json_file)
    self.save = save

  def get_label_from_id(self, item_id):
    if item_id in self.properties:
      return self.properties[item_id]
    else:
      item_data = utils.get_wikidata_data(item_id)
      if item_data:
        label = item_data["labels"].get("en", {}).get("value")
        self.properties[item_id] = label
        if self.save:
          with open(self.local_file, 'w') as outfile:
            json.dump(self.properties, outfile)
        return label

  def get_labels_from_item_ids(self, item_ids):
    result = {}
    to_retrieve = []
    for item_id in item_ids:
      if item_id in self.properties:
        result[item_id] = self.properties[item_id]
      else:
        to_retrieve.append(item_id)
    retrieved_item_data = utils.get_wikidata_data_for_list(to_retrieve)
    for item_id in to_retrieve:
      label = retrieved_item_data[item_id]["labels"].get("en", {}).get("value")
      self.properties[item_id] = label
      result[item_id] = label
    if self.save:
      with open(self.local_file, 'w') as outfile:
        json.dump(self.properties, outfile)
    return result

  def replace_ids_and_add_labels(self, data):
    if isinstance(data, dict):
      new_dict = {}
      for key, value in data.items():
        if (key == "position held" or key == "noble title") and isinstance(value, list):
          # Special handling for "position held"
          updated_positions = []
          for pos_obj in value:
            if isinstance(pos_obj, dict) and "id" in pos_obj:
              pos_id = pos_obj["id"]
              label = self.properties.get(pos_id, pos_id)  # Use ID as label if not found
              pos_obj_with_label = pos_obj.copy()  # Create a copy to avoid modifying original
              pos_obj_with_label["label"] = label  # Add the "label" field
              updated_positions.append(pos_obj_with_label)
            else:
              updated_positions.append(pos_obj)  # Keep objects without 'id' as is
          new_dict[key] = [self.replace_ids_and_add_labels(item) for item in
                           updated_positions]  # Process content of position_held list
        elif key in {"id", "mother", "father", "spouse", "child", "sibling", "relative", "from", "to"}:
          new_dict[key] = value  # Keep 'id' value as is
        else:
          new_dict[key] = self.replace_ids_and_add_labels(value)  # Recursively process other values
      return new_dict
    elif isinstance(data, list):
      return [self.replace_ids_and_add_labels(item) for item in data]  # Recursively process list items
    elif isinstance(data, str):
      if data.startswith("Q") and data[1:].isdigit():
        return self.properties.get(data, data)  # Replace if in dict, otherwise keep original
      else:
        return data
    else:
      return data

  def add_labels_to_people(self, monarchy):
    print("./data/"+monarchy+".json")
    people = {}
    with open("./data/"+monarchy+".json") as json_file:
      people = json.load(json_file)
    print("People: ", len(people))
    for person in people.values():
      self.properties[person["id"]] = person["label"]
    json_string = json.dumps(people)
    ids = set(re.findall(r'Q\d+', json_string))
    print("Retrieving IDs:", len(ids))
    self.get_labels_from_item_ids(ids)
    print("Retrieved IDs:", len(ids))
    people_labelled = self.replace_ids_and_add_labels(people)
    with open("./data/"+monarchy+"_labelled.json", "w") as outfile:
      outfile.write(json.dumps(people_labelled))


PROPERTIES = {
  "P69": "educated at",
  "P106": "occupation",
  "P22": "father",
  "P25": "mother",
  "P26": "spouse",
  "P40": "child",
  "P18": "image",
  "P19": "place of birth",
  "P20": "place of death",
  "P119": "place of burial",
  "P27": "country of citizenship",
  "P39": "position held",
  "P451": "unmarried partner",
  "P569": "date of birth",
  "P570": "date of death",
  "P53": "family",
  "P109": "signature",
  "P509": "cause of death",
  "P463": "member of", #
  "P1038": "relative", #
  "P1412": "languages spoken, written or signed",
  "P3373": "sibling",
  "P140": "religion or worldview",
  "P2048": "height",
  "P1442": "image of grave",
  "P94": "coat of arms image",
  "P734": "family name",
  "P21": "sex or gender",
  "P97": "noble title",
  "P2348": "time period",
  "P580": "start time",
  "P582": "end time",
  "P1365": "from",
  "P1366": "to",
  "P1534": "end cause",
  "P642": "of",
  "P155": "from",
  "P156": "to",
  "P1001": "of",
}

def get_property_label(property_id):
  url = f"https://www.wikidata.org/w/api.php?action=wbgetentities&ids={property_id}&languages=en&props=labels&format=json"

  try:
    response = requests.get(url)
    response.raise_for_status()  # Raise an exception for bad status codes
    data = response.json()

    if "entities" in data and property_id in data["entities"]:
      return data["entities"][property_id]["labels"].get("en", {}).get("value")
    else:
      print(f"No data found for property ID: {property_id}")
      return None

  except requests.exceptions.RequestException as e:
    print(f"Error fetching data: {e}")
    return None

def get_item_label_from_id(item_id):
  item_data = utils.get_wikidata_data(item_id)
  if item_data:
    return (item_id, item_data["labels"].get("en", {}).get("value"))

def get_dict_of_properties():
  item_ids = ["Q517", "Q3044", "Q9682"]
  properties = {}
  for item_id in item_ids:
    item_data = utils.get_wikidata_data(item_id)

    if item_data:
      print("Item ID:", item_id)
      print("Label:", item_data.get("labels", {}).get("en", {}).get("value"))
      print("Description:", item_data.get("descriptions", {}).get("en", {}).get("value"))

      # Access claims (statements)
      claims = item_data.get("claims", {})
      for property_id, claim_list in claims.items():
        print(f"Property ID: {property_id} {get_property_label(property_id)}")
        properties[property_id] = get_property_label(property_id)
        for claim in claim_list:
          try:
            value = claim["mainsnak"]["datavalue"]["value"]
            print(f"  Value: {value}")
          except KeyError:
            print(f"  No value available for this claim.")
  utils.saveData(properties, "properties")


def bfs(start_id, target_id, data_retriever, max_depth):
  visited = set()
  queue = deque()
  queue.append((start_id, [start_id], 0))
  visited.add(start_id)

  while queue:
    current_id, path, depth = queue.popleft()

    if current_id == target_id:
      return path

    if depth >= max_depth:
      print("Reached maximum search depth")
      continue

    current_person = data_retriever.get_person_from_item_id(current_id)
    if not current_person:
      continue

    # Collect valid neighbors (father, mother, children)
    neighbors = []
    # Father
    father_id = current_person.get('father')
    if father_id:
      neighbors.append(father_id)
    # Mother
    mother_id = current_person.get('mother')
    if mother_id:
      neighbors.append(mother_id)
    # Children
    children_ids = current_person.get('child', [])
    for child_id in children_ids:
      neighbors.append(child_id)

    # Retrieve neighbors so we have the data
    data_retriever.get_people_from_item_ids(neighbors)

    for neighbor_id in neighbors:
      if neighbor_id not in visited:
        visited.add(neighbor_id)
        new_path = path + [neighbor_id]
        queue.append((neighbor_id, new_path, depth + 1))

  return None

def construct_family_tree_from_monarch_list(monarchy, save_file_path):
  retriever = DataRetriever(local_file="./data/" + monarchy + ".json")

  list_of_monarch_ids = []
  with open("data/monarch_list.json") as json_file:
    list_of_monarch_ids = json.load(json_file)[monarchy]

  # Retrieve all the monarchs and their father/mother/spouses/unmarried partners/children
  retriever.get_people_from_item_ids(list_of_monarch_ids)

  result = []

  '''
  For Russian dynasty after Feodor II
  ["Q206459",
         "Q181915"
        ],
        [
            "Q181915",
            "Q170172",
            "Q260663",
            "Q4397050",
            "Q2328037",
            "Q547759",
            "Q7731"
        ],
        [
            "Q7731",
            "Q184868"
        ],
  '''

  for i in range(len(list_of_monarch_ids)):
    current_id = list_of_monarch_ids[i]
    path_found = None
    print("Finding path from: ", retriever.get_person_from_item_id(current_id)['label'], 'https://www.wikidata.org/wiki/' + current_id)
    # Check subsequent people starting from i+1
    end = i + 6
    if len(list_of_monarch_ids) < end:
      end = len(list_of_monarch_ids)
    for j in range(i + 1, end):
      target_id = list_of_monarch_ids[j]
      print("Finding path to: ", retriever.get_person_from_item_id(target_id)['label'], 'https://www.wikidata.org/wiki/' + target_id)
      path = bfs(current_id, target_id, retriever, max_depth=8)
      if path:
        path_found = path
        print("Found path:", path_found)
        break  # Found the earliest possible connection, move to next person
    result.append(path_found if path_found else [])

  family_tree_data = {}
  if os.path.exists(save_file_path):
    with open(save_file_path) as json_file:
      family_tree_data = json.load(json_file)
  family_tree_data[monarchy] = result
  with open(save_file_path, 'w') as json_file:
    json.dump(family_tree_data, json_file)

def get_monarch_data(skip):
  monarchy_lists = {}
  with open("data/monarch_list.json") as json_file:
    monarchy_lists = json.load(json_file)
  monarchy_lists = [m for m in monarchy_lists.keys() if m not in skip]
  for monarchy in monarchy_lists:
    print(monarchy)
    construct_family_tree_from_monarch_list(monarchy, "./data/" + monarchy + "_family_tree.json")

def get_monarch_list(monarchy, position_set, start_person_id):
  retriever = DataRetriever(save=False)
  path = [start_person_id]
  current_node = start_person_id
  prev_node = None
  connection_indices = defaultdict(int)

  while True:
    found = False
    start_index = connection_indices[current_node]
    current_person = retriever.get_person_from_item_id(current_node)
    print(current_person['label'], 'https://www.wikidata.org/wiki/' + current_person['id'])
    connections = current_person.get('noble title', []) + current_person.get('position held', [])
    connections = [conn for conn in connections if conn['id'] in position_set]

    # Correct title changes (ie King of England -> King of Great Britian)
    for conn in connections:
      if 'to' not in conn and 'from' in conn:
        candidates = [c for c in connections if 'to' in c and 'from' not in c]
        if len(candidates) > 0:
          c = candidates[0]
          conn['to'] = c['to']
          c['from'] = conn['from']

    # Special napolean rule
    if current_person['id'] == 'Q7732':
      path = path + ['Q517', 'Q7750', 'Q7758', 'Q7771', 'Q7721']
    else:
      # Check connections from current index to end
      for i in range(start_index, len(connections)):
        conn = connections[i]
        from_nodes = conn.get('from')
        if isinstance(from_nodes, str):
          from_nodes = [from_nodes]
        elif from_nodes is None:
          from_nodes = []

        to_nodes = conn.get('to', [])
        if not isinstance(to_nodes, list):
          to_nodes = [to_nodes] if to_nodes is not None else []

        if not to_nodes:
          continue  # Skip if no 'to' nodes

        to_node = to_nodes[0]

        if prev_node is None:
          # Handle the first step, ignore 'from' field
          path.append(to_node)
          prev_node = current_node
          connection_indices[current_node] = i + 1
          current_node = to_node
          found = True
          break
        else:
          if prev_node in from_nodes:
            path.append(to_node)
            prev_node = current_node
            connection_indices[current_node] = i + 1
            current_node = to_node
            found = True
            break

      if not found:
        # Check connections from beginning to start_index if not all were checked
        for i in range(0, start_index):
          conn = connections[i]
          from_nodes = conn.get('from')
          if isinstance(from_nodes, str):
            from_nodes = [from_nodes]
          elif from_nodes is None:
            from_nodes = []

          to_nodes = conn.get('to', [])
          if not isinstance(to_nodes, list):
            to_nodes = [to_nodes] if to_nodes is not None else []

          if not to_nodes:
            continue  # Skip if no 'to' nodes

          to_node = to_nodes[0]

          if prev_node is None:
            # Handle the first step, ignore 'from' field
            path.append(to_node)
            prev_node = current_node
            connection_indices[current_node] = i + 1
            current_node = to_node
            found = True
            break
          else:
            if prev_node in from_nodes:
              path.append(to_node)
              prev_node = current_node
              connection_indices[current_node] = i + 1
              current_node = to_node
              found = True
              break

    if not found:
      break

  with open("data/monarch_list.json") as json_file:
    monarch_lists = json.load(json_file)
  monarch_lists[monarchy] = path
  with open("data/monarch_list.json", 'w') as json_file:
    json.dump(monarch_lists, json_file, indent=4)

monarchies = ['Austria', 'Bavaria', 'Bohemia', 'Denmark', 'England', 'France', 'Germany', 'Han', 'Holy_Roman_Empire',
               'Hungary', 'Iceland', 'Japan', 'Joseon', 'Ming', 'Naples', 'Norway', 'Ottoman', 'Poland', 'Portugal',
               'Qing', 'Russia', 'Scotland', 'Shang', 'Spain', 'Sweden', 'Tang', 'Yuan', 'Zhou']
def label_people():
  for monarchy in monarchies:
    PropertyRetriever().add_labels_to_people(monarchy)

if __name__ == '__main__':
  # monarchies.sort()
  # print(monarchies)
  # retriever = DataRetriever(save=False)
  # get_monarch_data({'Bavaria', 'Bohemia', 'Denmark', 'England', 'France', 'Germany', 'Han', 'Holy_Roman_Empire',
  #              'Hungary', 'Iceland', 'Japan', 'Joseon', 'Ming', 'Norway', 'Ottoman', 'Poland', 'Portugal',
  #              'Qing', 'Russia', 'Scotland', 'Shang', 'Spain', 'Sweden', 'Tang', 'Yuan', 'Zhou'})
  label_people()