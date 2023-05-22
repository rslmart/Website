import requests
from bs4 import BeautifulSoup
from datetime import datetime
import json

def datetime_encoder(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()

    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")

def saveData(data):
	print("Saving Data: {}".format(len(data)))
	# Convert dictionary to JSON string using the custom encoder
	json_data = json.dumps(data, default=datetime_encoder, indent=4)
	# Write JSON data to a file
	with open("royaltree.json", "w") as file:
		file.write(json_data)

def getRealId(id):
	if 'wikipedia.org' in id:
		id = "/wiki/{}".format(id.split('/')[-1])
	response = requests.get(
		url="https://en.wikipedia.org{}".format(id),
	)
	soup = BeautifulSoup(response.content, 'html.parser')
	link = soup.find('link', rel='canonical').get('href').split('/')[-1]
	return "/wiki/{}".format(link)

def extractDateFromStr(dateDateStr, person, birth=True):
	# Check for the presence of "c." prefix
	if "c." in dateDateStr:
		dateDateStr = dateDateStr.replace("c.", "").strip()
	if '(' in dateDateStr:
		dateDateStr = dateDateStr.split('(')[0]

	# Extract day, month, and year
	date_parts = dateDateStr.split()
	day = None
	month = None
	year = None

	# Process the date parts based on their availability
	if len(date_parts) == 3:
		day, month, year = date_parts
	elif len(date_parts) == 2:
		# Handle cases like "April 747" where the day is missing
		if date_parts[1].isdigit():
			month, year = date_parts
		else:
			month, year = date_parts[::-1]  # Reverse the order
	elif len(date_parts) == 1:
		# Handle cases like "747" where only the year is available
		year = date_parts[0]

	# Convert year to an integer if available
	if year:
		year = int(year)

	# Create a datetime object with the available date parts
	if year:
		person['{}Date'.format("birth" if birth else "death")] = datetime(year=year, month=datetime.strptime(month, "%B").month,
							 day=int(day)) if day and month else datetime(year=year, month=1, day=1)

def extractDate(infobox, person, birth=True):
	dateRow = infobox.find("th", text="Born").parent if infobox.find("th", text="Born") else None
	if not birth:
		dateRow = infobox.find("th", text="Died").parent if infobox.find("th", text="Died") else None
	if dateRow:
		dateDateStrList = dateRow.find("td").contents
		for dateDateStr in dateDateStrList:
			try:
				extractDateFromStr(dateDateStr, person, birth=birth)
			except:
				print("Bad Date String: {}".format(dateDateStr))
		person['{}Place'.format("birth" if birth else "death")] = [a for a in dateRow.find_all("a") if a.get("title")][0].get("href") if len([a for a in dateRow.find_all("a") if a.get("title")]) > 0 else None

def extractTitle(infobox, person):
	if infobox.find("td", class_="infobox-subheader"):
		person['title'] = infobox.find("td", class_="infobox-subheader").find('a').get('href') if  infobox.find("td", class_="infobox-subheader").find('a') else  infobox.find("td", class_="infobox-subheader").text
	elif infobox.find("th", attrs={"style": "background-color: #e4dcf6;line-height:normal;padding:0.2em 0.2em"}):
		person['title'] = infobox.find("th", attrs={"style": "background-color: #e4dcf6;line-height:normal;padding:0.2em 0.2em"}).find('a').get('href') if infobox.find("th", attrs={"style": "background-color: #e4dcf6;line-height:normal;padding:0.2em 0.2em"}).find('a') else infobox.find("th", attrs={"style": "background-color: #e4dcf6;line-height:normal;padding:0.2em 0.2em"}).text


def extract_data_from_infobox(wiki_url):
	print(wiki_url)
	# Send a GET request to the Wikipedia page
	response = requests.get("https://en.wikipedia.org{}".format(wiki_url))

	# Create a BeautifulSoup object
	soup = BeautifulSoup(response.content, 'html.parser')

	# Extract data from the infobox
	# Initialize an empty dictionary
	person = {}

	# Assign values to dictionary keys
	person['id'] = wiki_url
	person['name'] = soup.find("span", class_="mw-page-title-main").text

	# Find the infobox
	infobox = soup.find("table", class_="infobox")
	if infobox:
		extractTitle(infobox, person)
		person['picture'] = infobox.find("img").get("src") if infobox.find("img") else None

		extractDate(infobox, person, birth=True)
		extractDate(infobox, person, birth=False)

		# Add marriage dates
		if infobox.find("th", text="Spouses"):
			spouseRow = infobox.find("th", text="Spouses").parent
			person['spouseList'] = [getRealId(spouse.find("a").get("href")) for spouse in spouseRow.findAll("li") if
						  spouse.find("a") and spouse.find("a").get("href")]
		elif infobox.find("th", text="Spouse"):
			spouseRow = infobox.find("th", text="Spouse").parent
			person['spouseList'] = [getRealId(spouseRow.find('a').get('href')) if spouseRow.find('a') else spouseRow.find('td').text]


		issueRow = infobox.find(lambda tag: tag.name == 'th' and 'Issue' in tag.text).parent if infobox.find(lambda tag: tag.name == 'th' and 'Issue' in tag.text) else None
		if issueRow:
			person['issueList'] = [getRealId(issue.find("a").get("href")) for issue in issueRow.findAll("li") if issue.find("a") and issue.find("a").get("href")]

		dynastyRow = infobox.find("th", text="Dynasty").parent if infobox.find("th", text="Dynasty") else None
		if dynastyRow:
			person['dynasty'] = dynastyRow.find("td").find("a").get("href") if dynastyRow.find("td").find("a") else dynastyRow.find("td").text

		houseRow = infobox.find("th", text="House").parent if infobox.find("th", text="House") else None
		if houseRow:
			person['house'] = houseRow.find("td").find("a").get("href") if houseRow.find("td").find("a") else houseRow.find("td").text

		fatherRow = infobox.find("th", text="Father").parent if infobox.find("th", text="Father") else None
		if fatherRow:
			person['father'] = getRealId(fatherRow.find("td").find("a").get("href")) if fatherRow.find("td").find("a") else fatherRow.find("td").text

		motherRow = infobox.find("th", text="Mother").parent if infobox.find("th", text="Mother") else None
		if motherRow:
			person['mother'] = getRealId(motherRow.find("td").find("a").get("href")) if motherRow.find("td").find("a") else motherRow.find("td").text

		religionRow = infobox.find("th", text="Religion").parent if infobox.find("th", text="Religion") else None
		if religionRow:
			person['religion'] = religionRow.find("td").find("a").get("href") if religionRow.find("td").find("a") else religionRow.find("td").text
	return person

if __name__ == '__main__':
	tree = {}
	visited = set()
	queue = set(["/wiki/Charlemagne"])
	limit = 10000
	while queue and len(tree) < limit:
		toVisit = queue.pop()
		visited.add(toVisit)
		if '/wiki/' not in toVisit:
			continue
		person = extract_data_from_infobox(toVisit)
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
		print("{:.2f}% ({}/{})".format(len(tree)/limit * 100, len(tree), limit))
		# Checkpoint
		if len(tree) % 50 == 0:
			saveData(tree)
	saveData(tree)