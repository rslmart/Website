import json


def flatten(xss):
    return [x for xs in xss for x in xs]

def clean_and_combine(monarch_lists):
    new_data = {}
    with open("./data/monarchy_data.json", 'r') as json_file:
        new_data = json.load(json_file)
    family_trees = {}
    with open("./data/monarchy_family_trees.json", 'r') as json_file:
        family_trees = json.load(json_file)
    for monarchy in monarch_lists:
        succession_list = []
        with open("./data/" + monarchy + "_family_tree.json", 'r') as file:
            data = json.load(file)
            family_trees[monarchy] = data[monarchy]
            succession_list = set(flatten(data[monarchy]))
        monarchy_data = {}
        with open("./data/" + monarchy + "_labelled.json", 'r') as file:
            monarchy_data = json.load(file)
        importantNodes = set()
        for nodeId in succession_list:
            if nodeId in monarchy_data:
                person = monarchy_data[nodeId]
                importantNodes.add(nodeId)
                importantNodes.add(person.get("father", nodeId))
                importantNodes.add(person.get("mother", nodeId))
                importantNodes.update(person.get("spouse", []))
                importantNodes.update(person.get("sibling", []))
                importantNodes.update(person.get("unmarried partner", []))
        for nodeId in importantNodes:
            if nodeId in monarchy_data:
                new_data[nodeId] = monarchy_data[nodeId]
    with open("./data/monarchy_data.json", 'w') as json_file:
        json.dump(new_data, json_file)
    with open("./data/monarchy_family_trees.json", 'w') as json_file:
        json.dump(family_trees, json_file, indent=4)

if __name__ == '__main__':
    clean_and_combine({"Spain"})
