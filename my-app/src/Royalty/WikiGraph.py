import utils

if __name__ == '__main__':
	tree = {}
	visited = set()
	queue = set(["/wiki/Charlemagne"])
	limit = 1000000000
	while queue and len(tree) < limit:
		toVisit = queue.pop()
		visited.add(toVisit)
		if '/wiki/' not in toVisit: # Not a valid  address
			continue
		try:
			person = utils.extract_data_from_infobox(toVisit)
			if 'spouseList' in person:
				for spouse in person['spouseList']:
					if spouse not in visited:
						queue.add(spouse)
			if 'issueList' in person:
				for issue in person['issueList']:
					if issue not in visited:
						queue.add(issue)
			if 'father' in person and person['father'] not in visited:
				queue.add(person['father'])
			if 'mother' in person and person['mother'] not in visited:
				queue.add(person['mother'])
			tree[person['id']] = person
		except Exception as e:
			print(toVisit, e)
		print("{:.2f}% ({}/{})".format(len(tree)/limit * 100, len(tree), limit))
		# Checkpoint
		if len(tree) % 50 == 0:
			utils.saveData(tree)
	utils.saveData(tree)