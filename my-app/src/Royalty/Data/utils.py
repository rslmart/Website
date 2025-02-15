import requests
from bs4 import BeautifulSoup
from datetime import datetime
import json
import re

def remove_non_ascii(text):
    return text.encode('ascii', 'ignore').decode("utf-8")

def datetime_encoder(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()

    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")

def saveData(data, file_name):
    print("Saving Data: {}".format(len(data)))
    # Convert dictionary to JSON string using the custom encoder
    json_data = json.dumps(data, default=datetime_encoder, indent=4)
    # Write JSON data to a file
    with open("{}.json".format(file_name), "w") as file:
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

def extractDateFromStr(text):
    pattern = r'\b\d{1,2} [A-Za-z]+ \d{3,4}\b|\b\d{3,4}\b|\b\d{3}(?=\s+and\s+\d{3})\b'
    match = re.search(pattern, text)
    if match:
        date_string = match.group()
        year_string = date_string.split(' ')[-1]
        if len(year_string) == 3:
            date_string_list = date_string.split(' ')[:-1]
            year_string = '0' + year_string
            date_string_list.append(year_string)
            date_string = ' '.join(date_string_list)
        date_formats = ['%d %B %Y', '%B %Y', '%Y']
        for date_format in date_formats:
            try:
                date = datetime.strptime(date_string, date_format)
                return date
            except ValueError:
                pass
    return None

def extractDate(infobox, person, birth=True):
    dateRow = infobox.find("th", text="Born").parent if infobox.find("th", text="Born") else None
    if not birth:
        dateRow = infobox.find("th", text="Died").parent if infobox.find("th", text="Died") else None
    if dateRow:
        person['{}Date'.format("birth" if birth else "death")] = extractDateFromStr(str(dateRow))
        person['{}Place'.format("birth" if birth else "death")] = [a for a in dateRow.find_all("a") if a.get("title")][0].get("href") if len([a for a in dateRow.find_all("a") if a.get("title")]) > 0 else None

def extractTitle(infobox, person):
    if infobox.find("td", class_="infobox-subheader"):
        person['title'] = infobox.find("td", class_="infobox-subheader").find('a').get('href') if  infobox.find("td", class_="infobox-subheader").find('a') else  infobox.find("td", class_="infobox-subheader").text
    elif infobox.find("th", attrs={"style": "background-color: #e4dcf6;line-height:normal;padding:0.2em 0.2em"}):
        person['title'] = infobox.find("th", attrs={"style": "background-color: #e4dcf6;line-height:normal;padding:0.2em 0.2em"}).find('a').get('href') if infobox.find("th", attrs={"style": "background-color: #e4dcf6;line-height:normal;padding:0.2em 0.2em"}).find('a') else infobox.find("th", attrs={"style": "background-color: #e4dcf6;line-height:normal;padding:0.2em 0.2em"}).text

def getWikiPage(wiki_url):
    # Send a GET request to the Wikipedia page
    response = requests.get("https://en.wikipedia.org{}".format(wiki_url), headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36'})

    # Create a BeautifulSoup object
    return BeautifulSoup(response.content, 'html.parser')


def extract_data_from_infobox(wiki_url):
    print(wiki_url)
    soup = getWikiPage(wiki_url)

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
        burialRow = infobox.find("th", text="Burial").parent if infobox.find("th", text="Burial") else None
        if burialRow:
            person['burial'] = burialRow.find("td").find("a").get("href") if burialRow.find("td").find(
                "a") else burialRow.find("td").text
    return person

def get_wikidata_data(item_id):
  url = f"https://www.wikidata.org/w/api.php?action=wbgetentities&ids={item_id}&languages=en&format=json"

  try:
    response = requests.get(url)
    response.raise_for_status()  # Raise an exception for bad status codes
    data = response.json()

    if "entities" in data and item_id in data["entities"]:
      return data["entities"][item_id]
    else:
      print(f"No data found for item ID: {item_id}")
      return None

  except requests.exceptions.RequestException as e:
    print(f"Error fetching data: {e}")
    return None


def get_wikidata_data_for_list(item_ids):
  result = {}
  # Split the list into chunks of 50 items each
  for i in range(0, len(item_ids), 50):
    print(f"Progress Retrieving Items: {i/len(item_ids) * 100:.2f}% {i}/{len(item_ids)}")
    batch = item_ids[i:i + 50]
    batch_ids = "|".join(batch)
    url = f"https://www.wikidata.org/w/api.php?action=wbgetentities&ids={batch_ids}&languages=en&format=json"

    try:
      response = requests.get(url)
      response.raise_for_status()  # Raise HTTP errors
      data = response.json()

      if "entities" not in data:
        print(f"No data found for batch: {batch}")
        return None

      # Verify all items in this batch are present
      for item_id in batch:
        if item_id not in data["entities"]:
          print(f"No data found for item ID: {item_id}")
          return None
        result[item_id] = data["entities"][item_id]

    except requests.exceptions.RequestException as e:
      print(f"Error fetching batch: {e}")
      return None

  return result

def extract_person(item_data):
    person = {}
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
                                if id in {"Q116"}:  # "monarch"
                                    if "P1001" in claim["qualifiers"]:
                                        id = claim["qualifiers"]["P1001"][0]["datavalue"]["value"]["id"]
                                    elif "P642" in claim["qualifiers"]:
                                        id = claim["qualifiers"]["P642"][0]["datavalue"]["value"]["id"]
                                position = {"id": id}
                                for qualifier_prop_id in claim["qualifiers"].keys():
                                    qualifier = PROPERTIES.get(qualifier_prop_id, "")
                                    if qualifier_prop_id in {"P580", "P582"}:
                                        position[qualifier] = \
                                        claim["qualifiers"][qualifier_prop_id][0]["datavalue"]["value"]["time"]
                                    elif qualifier_prop_id in {"P1534", "P642"} and \
                                            claim["qualifiers"][qualifier_prop_id][0]['snaktype'] == 'value':
                                        position[qualifier] = \
                                        claim["qualifiers"][qualifier_prop_id][0]["datavalue"]["value"]["id"]
                                    elif qualifier_prop_id in {"P155", "P1365", "P1366", "P156"} and \
                                            claim["qualifiers"][qualifier_prop_id][0]['snaktype'] == 'value':
                                        position[qualifier] = [q["datavalue"]["value"]["id"] for q in
                                                               claim["qualifiers"][qualifier_prop_id]]
                                person[p].append(position)
                        # sort this by end time
                        person[p] = sorted(person[p], key=lambda x: x["end time"])
            except Exception as e:
                print(f"{e} {claim_list[0]}")
    return person