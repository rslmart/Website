import json

import requests
import utils

# Explore graph of people, adding ids we found
# Go through list of visited nodes, get data
# from those lists extract ids of properties we want to find (ie country, position, title, place of death)
# go through lists of properties and retrieve them
# either denormalize those lists into the nodes or keep them separate
# 'P22': 'father',
# 'P25': 'mother',
# 'P3373': 'sibling',
# 'P26': 'spouse',
# 'P451': 'unmarried partner',
# 'P40': 'child',

# Fetch the next 50 items in the queue and return them
def fetch_wikidata(id_queue):
	ids = list(id_queue)
	if len(ids) > 50:
		ids = ids[:50]
	print("Fetching: {}".format(len(ids)))
	# Create parameters
	params = {
		'action': 'wbgetentities',
		'ids': '|'.join(ids),
		'format': 'json',
		'languages': 'en'
	}
	url = 'https://www.wikidata.org/w/api.php'
	try:
		return requests.get(url, params=params).json()
	except:
		return 'There was and error'

if __name__ == '__main__':
	visited = set()
	fetched_id_queue = set()
	fetched_dict = {}
	to_fetch_id_queue = set(['Q3044'])
	limit = 1000000000
	while (to_fetch_id_queue or fetched_id_queue) and len(visited) < limit:
		print("Visited: {}, Fetched Queue: {}, To Fetch Queue: {}".format(len(visited), len(fetched_id_queue), len(to_fetch_id_queue)))
		# If toVisit hasn't been retrived, take the next 50 items from the queue and retrieve them
		if fetched_id_queue:
			# We have already fetched pages to go through
			toVisit = fetched_id_queue.pop()
			visited.add(toVisit)
			relations = set(['P22', 'P25', 'P3373', 'P26', 'P451', 'P40'])
			person = fetched_dict[toVisit]
			for relation in relations:
				try:
					if relation in person['claims']:
						for item in person['claims'][relation]:
							if 'datavalue' in item['mainsnak'] and item['mainsnak']['datavalue']['value']['id'] not in visited:
								to_fetch_id_queue.add(item['mainsnak']['datavalue']['value']['id'])
				except:
					print(person)
		else:
			# We need to fetch more pages
			fetched_dict = fetch_wikidata(to_fetch_id_queue)['entities']
			for id in fetched_dict.keys():
				# Filter out unimportant people
				if 'P106' in fetched_dict[id]['claims']:
					fetched_id_queue.add(id)
				else:
					visited.add(id)
				to_fetch_id_queue.remove(id)
		if len(visited) % 100 == 0:
			utils.saveData(list(visited), "id_list")
	utils.saveData(list(visited), "id_list")
