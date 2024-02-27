import json
import sys

def datetime_encoder(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()

    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")

def saveData(data, filename):
	print("Saving {} datapoints to ".format(len(data), filename))
	# Convert dictionary to JSON string using the custom encoder
	json_data = json.dumps(data, default=datetime_encoder, indent=4)
	# Write JSON data to a file
	with open(filename, "w") as file:
		file.write(json_data)

if __name__ == '__main__':
    with open(sys.argv[1], 'r') as file:
        data = json.load(file)

    # TODO: This can even be used to add nodes that don't exist in the data yet

    data_added = 0
    for key in data:
        person = data[key]
        # If person is not in their spouse's spouseList, add them
        if 'spouseList' in person:
            for spouseId in person['spouseList']:
                if spouseId in data:
                    spouse = data[spouseId]
                    if 'spouseList' not in spouse:
                        spouse['spouseList'] = []
                    if person['id'] not in spouse['spouseList']:
                        spouse['spouseList'].append(person['id'])
                        data[spouseId] = spouse
                        data_added += 1

        # Nobody has gender because this isn't in wikipedia, get it through father/mother
        # If person is not in their father's issueList, add them
        if 'father' in person:
            if person['father'] in data:
                father = data[person['father']]
                if 'sex' not in father:
                    father['sex'] = 'male'
                    data_added += 1
                if 'issueList' not in father:
                    father['issueList'] = []
                if person['id'] not in father['issueList']:
                    father['issueList'].append(person['id'])
                    data_added += 1
                data[person['father']] = father
        # If person is not in their mother's issueList, add them
        if 'mother' in person:
            if person['mother'] in data:
                mother = data[person['mother']]
                if 'sex' not in mother:
                    mother['sex'] = 'female'
                    data_added += 1
                if 'issueList' not in mother:
                    mother['issueList'] = []
                if person['id'] not in mother['issueList']:
                    mother['issueList'].append(person['id'])
                    data_added += 1
                data[person['mother']] = mother
        # Add spouse connection if we have the mother and father
        if 'father' in person and 'mother' in person:
            if person['father'] in data:
                father = data[person['father']]
                if 'spouseList' not in father:
                    father['spouseList'] = []
                if person['mother'] not in father['spouseList']:
                    father['spouseList'].append(person['mother'])
                    data_added += 1
                data[person['father']] = father
            if person['mother'] in data:
                mother = data[person['mother']]
                if 'spouseList' not in mother:
                    mother['spouseList'] = []
                if person['father'] not in mother['spouseList']:
                    mother['spouseList'].append(person['father'])
                    data_added += 1
                data[person['mother']] = mother
        # If person is not their issueList's father/mother, add them
        # need to know sex in order to do this
        if 'sex' in person and 'issueList' in person:
            for childId in person['issueList']:
                if childId in data:
                    child = data[childId]
                    if person['sex'] == 'male' and 'father' not in child:
                        child['father'] = person['id']
                        data_added += 1
                    elif person['sex'] == 'female' and 'mother' not in child:
                        child['mother'] = person['id']
                        data_added += 1
                    data[childId] = child
    print("Data Added: ", data_added)
    saveData(data, "royaltree_fixed.json")