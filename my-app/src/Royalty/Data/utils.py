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