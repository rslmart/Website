import requests
from bs4 import BeautifulSoup

URL = "https://en.wikipedia.org/wiki/Charlemagne"
page = requests.get(URL)
# print(page.content)
soup = BeautifulSoup(page.content, "html.parser")
infobox = soup.find("table", {"class": "infobox vcard"})
# Need an "Among others" handling see https://en.wikipedia.org/wiki/Charlemagne
issue = soup.find(lambda th: th.name == 'th' and 'Issue' in th.text).parent.find_all('li')
father = soup.find(lambda th: th.name == 'th' and 'Father' in th.text).parent.td.a
mother = soup.find(lambda th: th.name == 'th' and 'Mother' in th.text).parent.td.a